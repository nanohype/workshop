import { Graph } from './graph';
import { Scheduler } from './scheduler';
import { RunContext } from './context';
import { getProvider } from '../providers';
import type { WorkflowNode, RunState, RunCheckpoint, ExecutionEvent } from './types';
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, relative, resolve } from 'path';
import { scaffoldTemplate, renderBrief, fetchTemplateKind } from '../nanohype/catalog';
import { runValidationStep } from '../validation/runner';
import { ProjectIndexManager } from '../project/index';
import { renderProjectContext } from '../project/context-renderer';

export interface ExecutorOptions {
  variables?: Record<string, string>;
  workspacePath?: string;
  onEvent?: (event: ExecutionEvent) => void;
  onCheckpoint?: (checkpoint: RunCheckpoint) => void | Promise<void>;
  checkpoint?: RunCheckpoint;
}

export class Executor {
  private graph: Graph;
  private scheduler: Scheduler;
  private context: RunContext;
  private workspacePath?: string;
  private aborted = false;
  private paused = false;
  private onCheckpoint?: (checkpoint: RunCheckpoint) => void | Promise<void>;
  private projectIndex: ProjectIndexManager | null = null;
  private indexLock: Promise<void> = Promise.resolve();

  constructor(
    nodes: WorkflowNode[],
    edges: import('./types').WorkflowEdge[],
    options: ExecutorOptions
  ) {
    this.graph = new Graph(nodes, edges);
    this.scheduler = new Scheduler(this.graph);
    this.context = new RunContext(options.variables || {});
    this.workspacePath = options.workspacePath;
    this.onCheckpoint = options.onCheckpoint;
    if (this.workspacePath) {
      this.projectIndex = new ProjectIndexManager(this.workspacePath);
    }

    if (options.onEvent) {
      this.context.onEvent(options.onEvent);
    }

    // Warm start from checkpoint
    if (options.checkpoint) {
      this.context.restoreNodeStates(options.checkpoint.nodeStates);
      for (const [key, value] of Object.entries(options.checkpoint.contextData)) {
        if (key === '__contextEvents') {
          this.context.restoreContextEvents(value as import('./types').ContextEvent[]);
        } else {
          this.context.set(key, value);
        }
      }
      this.scheduler.restoreCompleted(options.checkpoint.completedNodes);
    }
  }

  async execute(): Promise<RunState> {
    const validation = this.graph.validate();
    if (!validation.valid) {
      throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
    }

    const startTime = new Date();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (!this.scheduler.isComplete() && !this.aborted && !this.paused) {
      const batch = await this.scheduler.getNextBatch(this.context);
      if (!batch) {
        if (!this.scheduler.hasPendingNodes(this.context)) break;
        // Nodes waiting for activateOn events or streaming edges — yield and retry
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      if (batch.isParallel) {
        await Promise.all(
          batch.nodeIds.map(nodeId => this.executeNode(nodeId))
        );
      } else {
        for (const nodeId of batch.nodeIds) {
          await this.executeNode(nodeId);
        }
      }

      for (const nodeId of batch.nodeIds) {
        const state = this.context.getNodeState(nodeId);
        if (state.tokens) {
          totalInputTokens += state.tokens.input;
          totalOutputTokens += state.tokens.output;
        }
        this.scheduler.markCompleted(nodeId);
      }

      // Checkpoint after each batch
      if (this.onCheckpoint) {
        const checkpoint: RunCheckpoint = {
          completedNodes: this.scheduler.getCompleted(),
          nodeStates: this.context.getAllNodeStates(),
          contextData: this.context.serialize(),
          timestamp: new Date(),
        };
        await this.onCheckpoint(checkpoint);
      }
    }

    // Refresh project index after run completes (inside lock to avoid racing with in-flight marker extraction)
    if (this.projectIndex && !this.paused) {
      try {
        await this.withIndexLock(() => {
          let index = this.projectIndex!.load();
          if (index) {
            index = this.projectIndex!.refresh(index);
            index = this.projectIndex!.gc(index);
            this.projectIndex!.save(index);
          }
        });
      } catch {
        // Non-fatal: index refresh failure should not fail the run
      }
    }

    const status = this.paused
      ? 'paused' as const
      : this.aborted
        ? 'cancelled' as const
        : Object.values(this.context.getAllNodeStates()).some(s => s.status === 'failed')
          ? 'failed' as const
          : 'completed' as const;

    const cost = this.estimateCost(totalInputTokens, totalOutputTokens);

    const runState: RunState = {
      runId: crypto.randomUUID(),
      workflowId: '',
      status,
      nodeStates: this.context.getAllNodeStates(),
      context: this.context.getAll(),
      startedAt: startTime,
      completedAt: new Date(),
      totalTokens: {
        input: totalInputTokens,
        output: totalOutputTokens,
        cost,
      },
    };

    this.context.emit({
      type: 'run-complete',
      data: runState,
      timestamp: new Date(),
    });

    return runState;
  }

  abort(): void {
    this.aborted = true;
  }

  pause(): void {
    this.paused = true;
  }

  getState(): { nodeStates: Record<string, unknown>; totalTokens: { input: number; output: number; cost: number } } {
    const nodeStates = this.context.getAllNodeStates();
    let input = 0, output = 0;
    for (const state of Object.values(nodeStates)) {
      if (state.tokens) {
        input += state.tokens.input;
        output += state.tokens.output;
      }
    }
    return { nodeStates, totalTokens: { input, output, cost: this.estimateCost(input, output) } };
  }

  private async executeNode(nodeId: string): Promise<void> {
    const node = this.graph.getNode(nodeId);
    if (!node) return;

    this.context.setNodeState(nodeId, { status: 'running', startedAt: new Date() });
    this.context.emit({ type: 'node-start', nodeId, data: { label: node.data.label }, timestamp: new Date() });

    // Declare workspace intent for conflict tracking
    const intentPaths = this.getNodeIntentPaths(node);
    if (intentPaths.length > 0) {
      this.context.declareIntent(nodeId, intentPaths);
    }

    try {
      const predecessors = this.graph.getPredecessors(nodeId);
      const anyPredFailed = predecessors.some(p => {
        const state = this.context.getNodeState(p);
        return state.status === 'failed';
      });
      if (anyPredFailed) {
        this.context.setNodeState(nodeId, { status: 'skipped', completedAt: new Date() });
        return;
      }

      let retries = node.data.retries || 0;
      let lastError: Error | null = null;
      const timeoutMs = (node.data.timeout || 600) * 1000;

      while (retries >= 0) {
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);
        try {
          await Promise.race([
            this.executeNodeByType(node, abortController.signal),
            new Promise<never>((_, reject) => {
              abortController.signal.addEventListener('abort', () => {
                reject(new Error(`Node "${node.data.label}" timed out after ${node.data.timeout || 600}s`));
              });
            }),
          ]);
          lastError = null;
          break;
        } catch (error) {
          lastError = error as Error;
          retries--;
          if (retries >= 0) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, (node.data.retries || 0) - retries - 1)));
          }
        } finally {
          clearTimeout(timer);
        }
      }

      if (lastError) throw lastError;

      const output = this.context.getNodeOutput(nodeId);
      this.context.setNodeState(nodeId, { status: 'completed', completedAt: new Date(), output });
      this.context.emit({
        type: 'node-complete',
        nodeId,
        data: { output: this.context.getNodeOutput(nodeId) },
        timestamp: new Date(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.setNodeState(nodeId, {
        status: 'failed',
        error: errorMessage,
        completedAt: new Date(),
      });
      this.context.emit({ type: 'node-error', nodeId, data: { error: errorMessage }, timestamp: new Date() });
    } finally {
      this.context.releaseIntent(nodeId);
    }
  }

  private async executeNodeByType(node: WorkflowNode, signal?: AbortSignal): Promise<void> {
    switch (node.type) {
      case 'agent':
        await this.executeAgentNode(node, signal);
        break;
      case 'condition':
        await this.executeConditionNode(node);
        break;
      case 'router':
        await this.executeRouterNode(node);
        break;
      case 'transform':
        await this.executeTransformNode(node);
        break;
      case 'gate':
        await this.executeGateNode(node);
        break;
      case 'input':
        this.executeInputNode(node);
        break;
      case 'output':
        this.executeOutputNode(node);
        break;
      case 'loop':
        await this.executeLoopNode(node);
        break;
      case 'scaffold':
        await this.executeScaffoldNode(node);
        break;
      case 'git-commit':
        await this.executeGitCommitNode(node);
        break;
      case 'github-pr':
        await this.executeGithubPrNode(node);
        break;
      case 'github-issue':
        await this.executeGithubIssueNode(node);
        break;
      case 'github-checks':
        await this.executeGithubChecksNode(node);
        break;
      case 'validate':
        await this.executeValidateNode(node);
        break;
    }
  }

  private async withIndexLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const prev = this.indexLock;
    let resolve!: () => void;
    this.indexLock = new Promise<void>(r => { resolve = r; });
    await prev;
    try {
      return await fn();
    } finally {
      resolve();
    }
  }

  private async extractAndUpdateIndex(node: WorkflowNode, output: string): Promise<void> {
    if (!this.projectIndex || !output) return;
    await this.withIndexLock(() => this.extractAndUpdateIndexInner(node, output));
  }

  private extractAndUpdateIndexInner(node: WorkflowNode, output: string): void {
    if (!this.projectIndex) return;

    let index = this.projectIndex.load();
    if (!index) return;

    const source = node.data.label || node.id;
    let changed = false;

    const decisionPattern = /<!--\s*decision:\s*([\s\S]*?)\s*-->/g;
    let match: RegExpExecArray | null;
    while ((match = decisionPattern.exec(output)) !== null) {
      index = this.projectIndex.appendDecision(index, { text: match[1].trim(), source });
      changed = true;
    }

    const conventionPattern = /<!--\s*convention:\s*([\s\S]*?)\s*-->/g;
    while ((match = conventionPattern.exec(output)) !== null) {
      index = this.projectIndex.addConvention(index, { text: match[1].trim(), source });
      changed = true;
    }

    const issuePattern = /<!--\s*known-issue:\s*([\s\S]*?)\s*-->/g;
    while ((match = issuePattern.exec(output)) !== null) {
      index = this.projectIndex.addKnownIssue(index, { text: match[1].trim(), source });
      changed = true;
    }

    if (changed) {
      this.projectIndex.save(index);
    }
  }

  private getNodeIntentPaths(node: WorkflowNode): string[] {
    switch (node.type) {
      case 'scaffold':
        return node.data.outputSubdir ? [node.data.outputSubdir] : [];
      case 'agent':
        return node.data.workspace && node.data.workspace !== 'off' ? ['.'] : [];
      case 'git-commit':
        return node.data.paths && node.data.paths.length > 0 ? node.data.paths : ['.'];
      default:
        return [];
    }
  }

  private estimateCost(inputTokens: number, outputTokens: number): number {
    // Claude Code rate (Claude Sonnet equivalent)
    return (inputTokens * 3.0 + outputTokens * 15.0) / 1_000_000;
  }

  private buildPredecessorContext(nodeId: string): string {
    const predecessors = this.graph.getPredecessors(nodeId);
    return predecessors
      .map(p => {
        const predNode = this.graph.getNode(p);
        const label = predNode?.data.label || p;

        // For streaming edges, read from StreamBuffer if available
        const incomingEdge = this.graph.getIncomingEdges(nodeId).find(e => e.source === p);
        let output: string | undefined;
        if (incomingEdge?.streaming) {
          const buffer = this.context.getStreamBuffer(p);
          output = buffer ? buffer.getStableContent() : this.context.getNodeOutput(p);
        } else {
          output = this.context.getNodeOutput(p);
        }
        if (!output) return null;

        // Enrich scaffold node output with structured context for the agent
        if (predNode?.type === 'scaffold') {
          try {
            const scaffold = JSON.parse(output);
            const fileList = (scaffold.filesWritten || []).join('\n  ');
            const vars = scaffold.templateVariables
              ? Object.entries(scaffold.templateVariables).map(([k, v]) => `  ${k}: ${v}`).join('\n')
              : '';
            return [
              `[Scaffolded from "${scaffold.displayName || scaffold.template}" template]`,
              scaffold.outputSubdir ? `Output directory: ${scaffold.outputSubdir}/` : 'Output directory: workspace root',
              fileList ? `Files created:\n  ${fileList}` : '',
              vars ? `Template variables:\n${vars}` : '',
              scaffold.warnings?.length ? `Warnings: ${scaffold.warnings.join('; ')}` : '',
              scaffold.hooks?.post?.length ? `Post-hooks available: ${scaffold.hooks.post.map((h: { name: string }) => h.name).join(', ')}` : '',
            ].filter(Boolean).join('\n');
          } catch {
            // Fall through to default formatting
          }
        }

        return predecessors.length > 1
          ? `[Output from "${label}"]\n${output}`
          : output;
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private async executeAgentNode(node: WorkflowNode, signal?: AbortSignal): Promise<void> {
    const workspaceMode = node.data.workspace || 'off';
    const workspaceEnabled = workspaceMode !== 'off' && !!this.workspacePath;

    let filesBefore: Map<string, number> | undefined;
    if (workspaceEnabled) {
      filesBefore = this.scanWorkspaceFiles(this.workspacePath!);
    }

    const previousOutputs = this.buildPredecessorContext(node.id);
    // Inject project context into system prompt
    let effectiveSystemPrompt = node.data.systemPrompt || '';
    if (this.projectIndex) {
      let index = this.projectIndex.load();
      if (!index) {
        index = this.projectIndex.build();
        this.projectIndex.save(index);
      }
      const projectContext = renderProjectContext(index);
      if (projectContext) {
        effectiveSystemPrompt = effectiveSystemPrompt
          ? `${projectContext}\n\n${effectiveSystemPrompt}`
          : projectContext;
      }
    }

    const provider = getProvider(node.data.provider || 'claude-code');
    const buffer = this.context.getOrCreateStreamBuffer(node.id);

    let fullOutput = '';
    const stream = provider.stream(
      [
        ...(effectiveSystemPrompt ? [{ role: 'system' as const, content: effectiveSystemPrompt }] : []),
        { role: 'user' as const, content: previousOutputs || (this.context.get('input') as string) || 'Begin' },
      ],
      {
        workspacePath: workspaceEnabled ? this.workspacePath : undefined,
        workspace: workspaceMode,
        maxTurns: node.data.maxTurns,
        signal,
      },
    );

    try {
      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullOutput += chunk.content;
          buffer.append(chunk.content);
          buffer.setWatermark();
          this.context.emit({
            type: 'node-output',
            nodeId: node.id,
            data: { chunk: chunk.content },
            timestamp: new Date(),
          });
        } else if (chunk.type === 'done' && chunk.tokens) {
          this.context.setNodeState(node.id, { tokens: chunk.tokens });
        }
      }
    } finally {
      buffer.close();

      if (fullOutput) {
        this.context.setNodeOutput(node.id, fullOutput);
        this.context.setNodeState(node.id, { output: fullOutput });
        await this.extractAndUpdateIndex(node, fullOutput);
      }

      if (workspaceEnabled && this.workspacePath) {
        if (fullOutput) {
          const safeLabel = (node.data.label || node.id).replace(/[^a-zA-Z0-9_-]/g, '_');
          const outputPath = join(this.workspacePath, `${safeLabel}.md`);
          writeFileSync(outputPath, fullOutput, 'utf-8');
        }

        const filesAfter = this.scanWorkspaceFiles(this.workspacePath);
        const changedFiles: { path: string; size: number }[] = [];

        for (const [filePath, size] of filesAfter) {
          const prevSize = filesBefore?.get(filePath);
          if (prevSize === undefined || prevSize !== size) {
            changedFiles.push({ path: filePath, size });
          }
        }

        if (changedFiles.length > 0) {
          this.context.setNodeState(node.id, { files: changedFiles });
          for (const file of changedFiles) {
            this.context.publish({
              source: node.id,
              type: 'file-written',
              payload: { path: file.path, size: file.size },
              timestamp: new Date(),
            });
          }
        }
      }
    }
  }

  private scanWorkspaceFiles(dirPath: string): Map<string, number> {
    const files = new Map<string, number>();
    try {
      this.walkDir(dirPath, dirPath, files);
    } catch {
      // Directory may not exist yet
    }
    return files;
  }

  private walkDir(baseDir: string, currentDir: string, files: Map<string, number>, maxDepth = 10): void {
    if (maxDepth <= 0 || files.size >= 10_000) return;

    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.size >= 10_000) return;

      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        this.walkDir(baseDir, fullPath, files, maxDepth - 1);
      } else if (entry.isFile()) {
        const relativePath = relative(baseDir, fullPath);
        const stat = statSync(fullPath);
        files.set(relativePath, stat.size);
      }
    }
  }

  private async executeRouterNode(node: WorkflowNode): Promise<void> {
    const routes = node.data.routes || [];
    if (routes.length < 2) throw new Error('Router node must have at least 2 routes');

    let matchedRoute: string | null = null;

    for (const route of routes) {
      if (!route.condition) {
        // Route without condition = default fallback
        if (!matchedRoute) matchedRoute = route.label;
        continue;
      }
      const result = await this.context.evaluateCondition(route.condition);
      if (result) {
        matchedRoute = route.label;
        break;
      }
    }

    // If no route matched, use the first route as default
    if (!matchedRoute) matchedRoute = routes[0].label;

    this.context.setNodeOutput(node.id, matchedRoute);

    // Skip downstream nodes connected to non-matching routes
    const outgoingEdges = this.graph.getOutgoingEdges(node.id);
    for (const edge of outgoingEdges) {
      // Edge sourceHandle carries the route label
      const edgeRoute = edge.sourceHandle || edge.label;
      if (edgeRoute && edgeRoute !== matchedRoute) {
        this.context.setNodeState(edge.target, { status: 'skipped' });
      }
    }
  }

  private interpolateTemplate(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      const nodeOutput = this.context.get(`node_${varName}_output`);
      if (nodeOutput !== undefined) return String(nodeOutput);
      const contextVal = this.context.get(varName);
      if (contextVal !== undefined) return String(contextVal);
      return '';
    });
  }

  private async executeTransformNode(node: WorkflowNode): Promise<void> {
    const template = node.data.template;
    if (!template) throw new Error('Transform node must have a template');
    this.context.setNodeOutput(node.id, this.interpolateTemplate(template));
  }

  private async executeGateNode(node: WorkflowNode): Promise<void> {
    const message = node.data.gateMessage || 'Approval required to continue';

    this.context.setNodeState(node.id, { status: 'waiting' });
    this.context.emit({
      type: 'node-waiting',
      nodeId: node.id,
      data: { message },
      timestamp: new Date(),
    });

    // Poll for gate decision — check DB every 2 seconds
    const maxWaitMs = 3600_000; // 1 hour
    const pollIntervalMs = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (this.aborted) throw new Error('Run was cancelled');

      // Check if gate has been resolved via context
      const decision = this.context.get(`gate_${node.id}_decision`);
      if (decision === 'approved') {
        this.context.setNodeOutput(node.id, 'approved');
        return;
      }
      if (decision === 'rejected') {
        throw new Error(`Gate "${node.data.label}" was rejected`);
      }

      await new Promise(r => setTimeout(r, pollIntervalMs));
    }

    throw new Error(`Gate "${node.data.label}" timed out after 1 hour`);
  }

  private async executeConditionNode(node: WorkflowNode): Promise<void> {
    const condition = node.data.condition;
    if (!condition) throw new Error('Condition node must have a condition expression');

    const result = await this.context.evaluateCondition(condition);
    this.context.setNodeOutput(node.id, String(result));

    const outgoingEdges = this.graph.getOutgoingEdges(node.id);
    for (const edge of outgoingEdges) {
      if (edge.condition) {
        const edgeResult = await this.context.evaluateCondition(edge.condition);
        if (!edgeResult) {
          this.context.setNodeState(edge.target, { status: 'skipped' });
        }
      }
    }
  }

  private executeInputNode(node: WorkflowNode): void {
    const defaultValue = (node.data as Record<string, unknown>).defaultValue as string || '';
    const inputData = this.context.get('input') as string || defaultValue;
    this.context.setNodeOutput(node.id, inputData);
  }

  private executeOutputNode(node: WorkflowNode): void {
    const predecessors = this.graph.getPredecessors(node.id);
    const outputs = predecessors
      .map(p => this.context.getNodeOutput(p))
      .filter(Boolean)
      .join('\n\n');
    this.context.setNodeOutput(node.id, outputs);
    this.context.set('output', outputs);
  }

  /**
   * Execute a scaffold node: render a nanohype template into the workspace.
   *
   * 1. Resolve variable bindings from RunContext (same {{var}} pattern as transform)
   * 2. Call scaffoldTemplate() to render files via @nanohype/sdk
   * 3. Run post-scaffold hooks (npm install, etc.) unless disabled
   * 4. Output structured JSON for downstream agents (template, files, variables, hooks)
   */
  private async executeScaffoldNode(node: WorkflowNode): Promise<void> {
    const templateName = node.data.templateName;
    if (!templateName) throw new Error('Scaffold node must have a template name');

    // Resolve variable bindings (shared between template and brief modes)
    const staticVars = node.data.templateVariables || {};
    const bindings = node.data.templateVariableBindings || {};
    const resolvedVars: Record<string, string | boolean | number> = { ...staticVars };

    for (const [varName, expression] of Object.entries(bindings)) {
      const resolved = expression.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const nodeOutput = this.context.get(`node_${key}_output`);
        if (nodeOutput !== undefined) return String(nodeOutput);
        const contextVal = this.context.get(key);
        if (contextVal !== undefined) return String(contextVal);
        return '';
      });
      resolvedVars[varName] = resolved;
    }

    // Check template kind — briefs render text, templates scaffold files
    const kind = await fetchTemplateKind(templateName);

    if (kind === 'brief') {
      const result = await renderBrief(templateName, resolvedVars);
      const output = JSON.stringify({
        kind: 'brief',
        template: result.templateName,
        displayName: result.templateDisplayName,
        content: result.content,
        warnings: result.warnings,
      });
      this.context.setNodeOutput(node.id, output);
      this.context.emit({
        type: 'node-output',
        nodeId: node.id,
        data: { chunk: result.content },
        timestamp: new Date(),
      });
      return;
    }

    // Standard template scaffolding
    // Ensure workspace exists
    if (!this.workspacePath) throw new Error('Scaffold node requires a workspace path');
    mkdirSync(this.workspacePath, { recursive: true });

    // Validate outputSubdir doesn't escape workspace
    if (node.data.outputSubdir) {
      const target = resolve(this.workspacePath, node.data.outputSubdir);
      if (!target.startsWith(this.workspacePath + '/') && target !== this.workspacePath) {
        throw new Error(`outputSubdir escapes workspace: ${node.data.outputSubdir}`);
      }
    }

    const result = await scaffoldTemplate(
      templateName,
      resolvedVars,
      this.workspacePath,
      node.data.outputSubdir,
    );

    // Run post-scaffold hooks if enabled
    const hooksRun: string[] = [];
    if (node.data.runPostHooks !== false && result.hooks.post.length > 0) {
      const hookCwd = node.data.outputSubdir
        ? join(this.workspacePath, node.data.outputSubdir)
        : this.workspacePath;

      for (const hook of result.hooks.post) {
        this.context.emit({
          type: 'node-output',
          nodeId: node.id,
          data: { chunk: `\n[hook: ${hook.name}] ${hook.run}\n` },
          timestamp: new Date(),
        });
        try {
          const hookOutput = execSync(hook.run, {
            cwd: hookCwd,
            timeout: 120_000,
            env: {
              ...process.env,
              NANOHYPE_TEMPLATE_NAME: result.templateName,
              NANOHYPE_OUTPUT_DIR: hookCwd,
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          const outputStr = hookOutput.toString().slice(-500);
          if (outputStr) {
            this.context.emit({
              type: 'node-output',
              nodeId: node.id,
              data: { chunk: outputStr },
              timestamp: new Date(),
            });
          }
          hooksRun.push(hook.name);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.context.emit({
            type: 'node-output',
            nodeId: node.id,
            data: { chunk: `[hook failed: ${hook.name}] ${msg}\n` },
            timestamp: new Date(),
          });
        }
      }
    }

    // Track written files in node state
    const files = result.filesWritten.map(f => ({ path: f, size: 0 }));
    this.context.setNodeState(node.id, { files });

    // Publish file-written events for each scaffolded file
    for (const filePath of result.filesWritten) {
      this.context.publish({
        source: node.id,
        type: 'file-written',
        payload: { path: filePath },
        timestamp: new Date(),
      });
    }

    // Store structured output for downstream nodes
    const output = JSON.stringify({
      template: result.templateName,
      displayName: result.templateDisplayName,
      filesWritten: result.filesWritten,
      warnings: result.warnings,
      hooks: result.hooks,
      hooksRun,
      outputSubdir: node.data.outputSubdir || '',
      templateVariables: resolvedVars,
    });
    this.context.setNodeOutput(node.id, output);

    // Publish scaffold-complete event
    this.context.publish({
      source: node.id,
      type: 'scaffold-complete',
      payload: {
        template: result.templateName,
        outputSubdir: node.data.outputSubdir || '',
        filesWritten: result.filesWritten,
      },
      timestamp: new Date(),
    });

    // Record template provenance in project index
    if (this.projectIndex) {
      await this.withIndexLock(() => {
        let index = this.projectIndex!.load();
        if (!index) {
          index = this.projectIndex!.build();
        }
        index = this.projectIndex!.addTemplateProvenance(index, {
          template: result.templateName,
          displayName: result.templateDisplayName || result.templateName,
          outputSubdir: node.data.outputSubdir || '',
          filesWritten: result.filesWritten,
          variables: resolvedVars,
          scaffoldedAt: new Date().toISOString(),
        });
        this.projectIndex!.save(index);
      });
    }
  }

  private async executeGitCommitNode(node: WorkflowNode): Promise<void> {
    if (!this.workspacePath) throw new Error('Git commit node requires a workspace path');

    const message = node.data.commitTemplate
      ? this.interpolateTemplate(node.data.commitTemplate)
      : node.data.commitMessage;
    if (!message) throw new Error('Git commit node must have a commit message or template');

    const cwd = this.workspacePath;

    // Optionally create and switch to a new branch
    if (node.data.createBranch && node.data.branch) {
      execSync(`git checkout -b ${node.data.branch}`, { cwd, stdio: 'pipe' });
    } else if (node.data.branch) {
      execSync(`git checkout ${node.data.branch}`, { cwd, stdio: 'pipe' });
    }

    // Stage files
    if (node.data.paths && node.data.paths.length > 0) {
      for (const p of node.data.paths) {
        execSync(`git add ${p}`, { cwd, stdio: 'pipe' });
      }
    } else {
      execSync('git add -A', { cwd, stdio: 'pipe' });
    }

    // Commit
    execSync(`git commit -m ${JSON.stringify(message)}`, { cwd, stdio: 'pipe' });

    // Capture output
    const sha = execSync('git rev-parse HEAD', { cwd, stdio: 'pipe' }).toString().trim();
    const branch = execSync('git branch --show-current', { cwd, stdio: 'pipe' }).toString().trim();
    let filesChanged: string[] = [];
    try {
      filesChanged = execSync('git diff --name-only HEAD~1', { cwd, stdio: 'pipe' })
        .toString().trim().split('\n').filter(Boolean);
    } catch { /* initial commit */ }

    const output = JSON.stringify({ sha, branch, filesChanged, message });
    this.context.setNodeOutput(node.id, output);
  }

  private async executeGithubPrNode(node: WorkflowNode): Promise<void> {
    if (!this.workspacePath) throw new Error('GitHub PR node requires a workspace path');

    const title = node.data.prTitleTemplate
      ? this.interpolateTemplate(node.data.prTitleTemplate)
      : node.data.prTitle;
    if (!title) throw new Error('GitHub PR node must have a title or title template');

    const body = node.data.prBodyTemplate
      ? this.interpolateTemplate(node.data.prBodyTemplate)
      : node.data.prBody || '';

    const cwd = this.workspacePath;
    const args = ['gh', 'pr', 'create', '--title', JSON.stringify(title), '--body', JSON.stringify(body)];
    if (node.data.baseBranch) args.push('--base', node.data.baseBranch);
    if (node.data.draft) args.push('--draft');

    let stdout: string;
    try {
      stdout = execSync(args.join(' '), { cwd, stdio: 'pipe' }).toString().trim();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // If PR already exists, fall back to edit
      if (errMsg.includes('already exists')) {
        const editArgs = ['gh', 'pr', 'edit', '--title', JSON.stringify(title), '--body', JSON.stringify(body)];
        stdout = execSync(editArgs.join(' '), { cwd, stdio: 'pipe' }).toString().trim();
      } else {
        throw err;
      }
    }

    // Parse PR URL and number from stdout
    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/(\d+)/);
    const prUrl = urlMatch?.[0] || stdout;
    const prNumber = urlMatch?.[1] ? parseInt(urlMatch[1], 10) : undefined;

    const output = JSON.stringify({ url: prUrl, number: prNumber, title, draft: !!node.data.draft });
    this.context.setNodeOutput(node.id, output);
  }

  private async executeGithubIssueNode(node: WorkflowNode): Promise<void> {
    if (!this.workspacePath) throw new Error('GitHub issue node requires a workspace path');

    const cwd = this.workspacePath;

    // Close mode
    if (node.data.closeIssue && node.data.issueNumber) {
      execSync(`gh issue close ${node.data.issueNumber}`, { cwd, stdio: 'pipe' });
      const output = JSON.stringify({ action: 'closed', number: node.data.issueNumber });
      this.context.setNodeOutput(node.id, output);
      return;
    }

    // Create mode
    const title = node.data.issueTitleTemplate
      ? this.interpolateTemplate(node.data.issueTitleTemplate)
      : node.data.issueTitle;
    if (!title) throw new Error('GitHub issue node must have a title or title template');

    const body = node.data.issueBodyTemplate
      ? this.interpolateTemplate(node.data.issueBodyTemplate)
      : node.data.issueBody || '';

    const args = ['gh', 'issue', 'create', '--title', JSON.stringify(title), '--body', JSON.stringify(body)];
    if (node.data.labels && node.data.labels.length > 0) {
      args.push('--label', node.data.labels.join(','));
    }

    const stdout = execSync(args.join(' '), { cwd, stdio: 'pipe' }).toString().trim();

    const urlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/issues\/(\d+)/);
    const issueUrl = urlMatch?.[0] || stdout;
    const issueNumber = urlMatch?.[1] ? parseInt(urlMatch[1], 10) : undefined;

    const output = JSON.stringify({ action: 'created', url: issueUrl, number: issueNumber, title });
    this.context.setNodeOutput(node.id, output);
  }

  private async executeGithubChecksNode(node: WorkflowNode): Promise<void> {
    if (!this.workspacePath) throw new Error('GitHub checks node requires a workspace path');

    const cwd = this.workspacePath;

    // Derive PR number: from node data, or from upstream github-pr node output
    let prNumber: number | undefined;
    if (node.data.prNumberSource) {
      const sourceOutput = this.context.getNodeOutput(node.data.prNumberSource);
      if (sourceOutput) {
        try {
          const parsed = JSON.parse(sourceOutput);
          prNumber = parsed.number;
        } catch { /* not JSON */ }
      }
    }
    if (!prNumber) {
      // Try to find an upstream github-pr node
      const predecessors = this.graph.getPredecessors(node.id);
      for (const predId of predecessors) {
        const predNode = this.graph.getNode(predId);
        if (predNode?.type === 'github-pr') {
          const output = this.context.getNodeOutput(predId);
          if (output) {
            try {
              prNumber = JSON.parse(output).number;
            } catch { /* not JSON */ }
          }
          break;
        }
      }
    }
    if (!prNumber) throw new Error('GitHub checks node could not determine PR number');

    const pollInterval = (node.data.pollInterval || 30) * 1000;
    const timeout = (node.data.checksTimeout || 600) * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.aborted) throw new Error('Run was cancelled');

      let checksJson: string;
      try {
        checksJson = execSync(
          `gh pr checks ${prNumber} --json name,state,conclusion`,
          { cwd, stdio: 'pipe' }
        ).toString().trim();
      } catch {
        // gh pr checks may fail if no checks exist yet — wait and retry
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      const checks = JSON.parse(checksJson) as { name: string; state: string; conclusion: string }[];
      if (checks.length === 0) {
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      const allComplete = checks.every(c => c.state === 'COMPLETED');
      if (!allComplete) {
        this.context.emit({
          type: 'node-output',
          nodeId: node.id,
          data: { chunk: `Waiting on checks... ${checks.filter(c => c.state !== 'COMPLETED').length} pending\n` },
          timestamp: new Date(),
        });
        await new Promise(r => setTimeout(r, pollInterval));
        continue;
      }

      const allPassed = checks.every(c => c.conclusion === 'SUCCESS' || c.conclusion === 'NEUTRAL' || c.conclusion === 'SKIPPED');
      const failed = checks.filter(c => c.conclusion === 'FAILURE' || c.conclusion === 'CANCELLED');

      const output = JSON.stringify({
        prNumber,
        passed: allPassed,
        checks: checks.map(c => ({ name: c.name, conclusion: c.conclusion })),
        failed: failed.map(c => c.name),
      });
      this.context.setNodeOutput(node.id, output);

      if (!allPassed) {
        throw new Error(`GitHub checks failed: ${failed.map(c => c.name).join(', ')}`);
      }
      return;
    }

    throw new Error(`GitHub checks timed out after ${(timeout / 1000)}s for PR #${prNumber}`);
  }

  private async executeValidateNode(node: WorkflowNode): Promise<void> {
    if (!this.workspacePath) throw new Error('Validate node requires a workspace path');

    const steps = node.data.validationSteps || [];
    if (steps.length === 0) throw new Error('Validate node must have at least one validation step');

    const results = [];
    let allPassed = true;

    for (const step of steps) {
      this.context.emit({
        type: 'node-output',
        nodeId: node.id,
        data: { chunk: `[validate] ${step.name}: ${step.command}\n` },
        timestamp: new Date(),
      });

      const result = runValidationStep(step, this.workspacePath);
      results.push(result);

      if (!result.passed) allPassed = false;

      const status = result.passed ? 'pass' : 'FAIL';
      const parsedSummary = result.parsed
        ? ` (${result.parsed.passed}/${result.parsed.total} passed)`
        : '';
      this.context.emit({
        type: 'node-output',
        nodeId: node.id,
        data: { chunk: `[validate] ${step.name}: ${status}${parsedSummary} [${result.duration}ms]\n` },
        timestamp: new Date(),
      });
    }

    const output = JSON.stringify({ passed: allPassed, results });
    this.context.setNodeOutput(node.id, output);

    if (!allPassed) {
      const failed = results.filter(r => !r.passed).map(r => r.name);
      throw new Error(`Validation failed: ${failed.join(', ')}`);
    }
  }

  private async executeLoopNode(node: WorkflowNode): Promise<void> {
    const maxIterations = (node.data as Record<string, unknown>).maxIterations as number || 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      this.context.set(`loop_${node.id}_iteration`, iteration);

      if (node.data.condition) {
        const shouldContinue = await this.context.evaluateCondition(node.data.condition);
        if (!shouldContinue) break;
      }

      this.context.setNodeOutput(node.id, `Loop iteration ${iteration}`);
    }
  }
}
