import { db } from '@/lib/db';
import { workflows, runs } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { Graph } from './graph';
import { Executor, type ExecutorOptions } from './executor';
import type { WorkflowNode, WorkflowEdge, RunCheckpoint, ExecutionEvent } from './types';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '@/lib/logger';

interface RunResult {
  runId: string;
  status: string;
}

const activeExecutors = new Map<string, Executor>();

// ── Shared callback factory ──────────────────────────────────────────
// Both startWorkflowRun and resumeWorkflowRun use identical event/checkpoint
// handling. This factory eliminates the duplication.

function makeRunCallbacks(
  runId: string,
  getExecutor: () => Executor,
): Pick<ExecutorOptions, 'onCheckpoint' | 'onEvent' | 'checkGateDecision'> {
  // Streaming output accumulator with debounced DB flush
  const streamingOutput: Record<string, string> = {};
  let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushStreamingOutput = async () => {
    if (streamFlushTimer) {
      clearTimeout(streamFlushTimer);
      streamFlushTimer = null;
    }
    try {
      const state = getExecutor().getState();
      const nodeStates = { ...state.nodeStates } as Record<string, Record<string, unknown>>;
      for (const [nodeId, text] of Object.entries(streamingOutput)) {
        if (nodeStates[nodeId]) {
          nodeStates[nodeId] = { ...nodeStates[nodeId], output: text };
        }
      }
      await db
        .update(runs)
        .set({
          nodeStates,
          tokenUsage: state.totalTokens,
          updatedAt: new Date(),
        })
        .where(eq(runs.id, runId));
    } catch (err) {
      logger.error(`[run-simple] Failed to flush streaming output: ${err}`);
    }
  };

  const scheduleStreamFlush = () => {
    if (streamFlushTimer) return;
    streamFlushTimer = setTimeout(flushStreamingOutput, 500);
  };

  return {
    onCheckpoint: async (checkpoint: RunCheckpoint) => {
      try {
        await db
          .update(runs)
          .set({ checkpoint, updatedAt: new Date() })
          .where(eq(runs.id, runId));
      } catch (err) {
        logger.error(`[run-simple] Failed to write checkpoint: ${err}`);
      }
    },

    onEvent: async (event: ExecutionEvent) => {
      try {
        // Accumulate streaming output with debounced flush
        if (event.type === 'node-output' && event.nodeId) {
          const data = event.data as { chunk: string };
          streamingOutput[event.nodeId] = (streamingOutput[event.nodeId] || '') + (data.chunk || '');
          scheduleStreamFlush();
          return;
        }

        if (event.type === 'node-start' || event.type === 'node-complete' || event.type === 'node-error') {
          // Flush pending streaming output on node completion
          if ((event.type === 'node-complete' || event.type === 'node-error') && event.nodeId) {
            if (streamFlushTimer) await flushStreamingOutput();
            delete streamingOutput[event.nodeId];
          }
          const state = getExecutor().getState();
          await db
            .update(runs)
            .set({
              nodeStates: state.nodeStates,
              tokenUsage: state.totalTokens,
              updatedAt: new Date(),
            })
            .where(eq(runs.id, runId));
        }

        if (event.type === 'run-complete') {
          if (streamFlushTimer) {
            clearTimeout(streamFlushTimer);
            streamFlushTimer = null;
          }
          const data = event.data as { status: string; nodeStates: Record<string, unknown>; context: Record<string, unknown>; totalTokens: { input: number; output: number; cost: number } };
          await db
            .update(runs)
            .set({
              status: data.status,
              nodeStates: data.nodeStates,
              context: data.context,
              tokenUsage: data.totalTokens,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(runs.id, runId));
          activeExecutors.delete(runId);
        }
      } catch (err) {
        logger.error(`[run-simple] Failed to update run state: ${err}`);
      }
    },

    checkGateDecision: async (nodeId: string) => {
      try {
        const [current] = await db
          .select({ context: runs.context })
          .from(runs)
          .where(eq(runs.id, runId));
        if (!current) return null;
        const ctx = (current.context as Record<string, unknown>) || {};
        const decision = ctx[`gate_${nodeId}_decision`];
        if (decision === 'approved' || decision === 'rejected') return decision;
        return null;
      } catch {
        return null; // Transient DB error — retry next poll
      }
    },
  };
}

export async function startWorkflowRun(workflowId: string, userId: string): Promise<RunResult> {
  // Fetch workflow
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)));

  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const raw = workflow.graphData;
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>).nodes) || !Array.isArray((raw as Record<string, unknown>).edges)) {
    throw new Error('Workflow graphData is missing or malformed (expected { nodes, edges })');
  }
  const graphData = raw as { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  if (!graphData.nodes.length) {
    throw new Error('Workflow has no nodes');
  }

  // Validate graph
  const graph = new Graph(graphData.nodes, graphData.edges);
  const validation = graph.validate();
  if (!validation.valid) {
    throw new Error(`Invalid workflow: ${validation.errors.join(', ')}`);
  }

  // Setup workspace
  const workspacePath = join(homedir(), '.workshop', 'workspaces', workflowId);
  try { mkdirSync(workspacePath, { recursive: true }); } catch { /* exists */ }

  // Create run record
  const [run] = await db
    .insert(runs)
    .values({
      workflowId,
      userId,
      status: 'running',
      context: { _workspacePath: workspacePath },
      nodeStates: {},
      tokenUsage: { input: 0, output: 0, cost: 0 },
      startedAt: new Date(),
    })
    .returning();

  const variables = (workflow.variables as Record<string, string>) || {};

  // Execute in background (don't await — return immediately)
  // eslint-disable-next-line prefer-const -- assigned after callbacks close over the binding
  let executor!: Executor;
  const callbacks = makeRunCallbacks(run.id, () => executor);
  executor = new Executor(graphData.nodes, graphData.edges, {
    variables: { ...variables, _workspacePath: workspacePath },
    workspacePath,
    ...callbacks,
  });

  activeExecutors.set(run.id, executor);

  // Fire and forget — execution happens in background
  executor.execute().catch(async (err: unknown) => {
    logger.error(`[run-simple] Execution failed: ${err}`);
    activeExecutors.delete(run.id);
    try {
      await db
        .update(runs)
        .set({
          status: 'failed',
          context: { _workspacePath: workspacePath, error: err instanceof Error ? err.message : String(err) },
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(runs.id, run.id));
    } catch { /* DB update failed too */ }
  });

  return { runId: run.id, status: 'running' };
}

export async function pauseRun(runId: string): Promise<void> {
  const executor = activeExecutors.get(runId);
  if (!executor) throw new Error('Run is not active on this instance');
  executor.pause();
  await db
    .update(runs)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(runs.id, runId));
}

export async function resumeWorkflowRun(runId: string, userId: string): Promise<RunResult> {
  const [run] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)));

  if (!run) throw new Error('Run not found');
  if (run.status !== 'paused') throw new Error('Run is not paused');

  const checkpoint = run.checkpoint as RunCheckpoint | null;
  if (!checkpoint) throw new Error('No checkpoint available for resume');

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, run.workflowId));

  if (!workflow) throw new Error('Workflow not found');

  const rawGraph = workflow.graphData;
  if (!rawGraph || typeof rawGraph !== 'object' || !Array.isArray((rawGraph as Record<string, unknown>).nodes) || !Array.isArray((rawGraph as Record<string, unknown>).edges)) {
    throw new Error('Workflow graphData is missing or malformed (expected { nodes, edges })');
  }
  const graphData = rawGraph as { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  const workspacePath = join(homedir(), '.workshop', 'workspaces', workflow.id);
  const variables = (workflow.variables as Record<string, string>) || {};

  await db
    .update(runs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(runs.id, runId));

  // eslint-disable-next-line prefer-const -- assigned after callbacks close over the binding
  let executor!: Executor;
  const callbacks = makeRunCallbacks(runId, () => executor);
  executor = new Executor(graphData.nodes, graphData.edges, {
    variables: { ...variables, _workspacePath: workspacePath },
    workspacePath,
    checkpoint,
    ...callbacks,
  });

  activeExecutors.set(runId, executor);

  executor.execute().catch(async (err: unknown) => {
    logger.error(`[run-simple] Resume execution failed: ${err}`);
    activeExecutors.delete(runId);
    try {
      await db
        .update(runs)
        .set({
          status: 'failed',
          context: { _workspacePath: workspacePath, error: err instanceof Error ? err.message : String(err) },
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(runs.id, runId));
    } catch { /* DB update failed too */ }
  });

  return { runId, status: 'running' };
}

export async function recoverStaleRuns(): Promise<void> {
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
  const staleRuns = await db
    .select()
    .from(runs)
    .where(and(eq(runs.status, 'running'), lt(runs.updatedAt, staleThreshold)));

  for (const run of staleRuns) {
    const hasCheckpoint = !!run.checkpoint;
    await db
      .update(runs)
      .set({
        status: hasCheckpoint ? 'paused' : 'failed',
        updatedAt: new Date(),
        ...(hasCheckpoint ? {} : { completedAt: new Date() }),
      })
      .where(eq(runs.id, run.id));
    logger.info(`[run-simple] Recovered stale run ${run.id} → ${hasCheckpoint ? 'paused' : 'failed'}`);
  }
}
