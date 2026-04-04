import { db } from '@/lib/db';
import { workflows, runs } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { Graph } from './graph';
import { Executor } from './executor';
import type { WorkflowNode, WorkflowEdge, ExecutionEvent } from './types';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

interface RunResult {
  runId: string;
  status: string;
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

  const graphData = workflow.graphData as { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  if (!graphData?.nodes?.length) {
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
      context: {},
      nodeStates: {},
      tokenUsage: { input: 0, output: 0, cost: 0 },
      startedAt: new Date(),
    })
    .returning();

  const variables = (workflow.variables as Record<string, string>) || {};

  // Execute in background (don't await — return immediately)
  const executor = new Executor(graphData.nodes, graphData.edges, {
    variables,
    workspacePath,
    onEvent: async (event: ExecutionEvent) => {
      try {
        if (event.type === 'node-start' || event.type === 'node-complete' || event.type === 'node-error') {
          const state = executor.getState();
          await db
            .update(runs)
            .set({
              nodeStates: state.nodeStates,
              tokenUsage: state.totalTokens,
            })
            .where(eq(runs.id, run.id));
        }

        if (event.type === 'run-complete') {
          const data = event.data as { status: string; nodeStates: Record<string, unknown>; context: Record<string, unknown>; totalTokens: { input: number; output: number; cost: number } };
          await db
            .update(runs)
            .set({
              status: data.status,
              nodeStates: data.nodeStates,
              context: data.context,
              tokenUsage: data.totalTokens,
              completedAt: new Date(),
            })
            .where(eq(runs.id, run.id));
        }
      } catch (err) {
        console.error('[run-simple] Failed to update run state:', err);
      }
    },
  });

  // Fire and forget — execution happens in background
  executor.execute().catch(async (err) => {
    console.error('[run-simple] Execution failed:', err);
    try {
      await db
        .update(runs)
        .set({
          status: 'failed',
          context: { error: err instanceof Error ? err.message : String(err) },
          completedAt: new Date(),
        })
        .where(eq(runs.id, run.id));
    } catch { /* DB update failed too */ }
  });

  return { runId: run.id, status: 'running' };
}
