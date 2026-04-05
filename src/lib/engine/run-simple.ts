import { db } from '@/lib/db';
import { workflows, runs } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import { Graph } from './graph';
import { Executor } from './executor';
import type { WorkflowNode, WorkflowEdge, RunCheckpoint, ExecutionEvent } from './types';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { join } from 'path';

interface RunResult {
  runId: string;
  status: string;
}

const activeExecutors = new Map<string, Executor>();

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
    onCheckpoint: async (checkpoint: RunCheckpoint) => {
      try {
        await db
          .update(runs)
          .set({
            checkpoint,
            updatedAt: new Date(),
          })
          .where(eq(runs.id, run.id));
      } catch (err) {
        console.error('[run-simple] Failed to write checkpoint:', err);
      }
    },
    onEvent: async (event: ExecutionEvent) => {
      try {
        if (event.type === 'node-start' || event.type === 'node-complete' || event.type === 'node-error') {
          const state = executor.getState();
          await db
            .update(runs)
            .set({
              nodeStates: state.nodeStates,
              tokenUsage: state.totalTokens,
              updatedAt: new Date(),
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
              updatedAt: new Date(),
            })
            .where(eq(runs.id, run.id));
          activeExecutors.delete(run.id);
        }
      } catch (err) {
        console.error('[run-simple] Failed to update run state:', err);
      }
    },
  });

  activeExecutors.set(run.id, executor);

  // Fire and forget — execution happens in background
  executor.execute().catch(async (err) => {
    console.error('[run-simple] Execution failed:', err);
    activeExecutors.delete(run.id);
    try {
      await db
        .update(runs)
        .set({
          status: 'failed',
          context: { error: err instanceof Error ? err.message : String(err) },
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

  const graphData = workflow.graphData as { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  const workspacePath = join(homedir(), '.workshop', 'workspaces', workflow.id);
  const variables = (workflow.variables as Record<string, string>) || {};

  await db
    .update(runs)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(runs.id, runId));

  const executor = new Executor(graphData.nodes, graphData.edges, {
    variables,
    workspacePath,
    checkpoint,
    onCheckpoint: async (cp: RunCheckpoint) => {
      try {
        await db
          .update(runs)
          .set({ checkpoint: cp, updatedAt: new Date() })
          .where(eq(runs.id, runId));
      } catch (err) {
        console.error('[run-simple] Failed to write checkpoint:', err);
      }
    },
    onEvent: async (event: ExecutionEvent) => {
      try {
        if (event.type === 'node-start' || event.type === 'node-complete' || event.type === 'node-error') {
          const state = executor.getState();
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
        console.error('[run-simple] Failed to update run state:', err);
      }
    },
  });

  activeExecutors.set(runId, executor);

  executor.execute().catch(async (err) => {
    console.error('[run-simple] Resume execution failed:', err);
    activeExecutors.delete(runId);
    try {
      await db
        .update(runs)
        .set({
          status: 'failed',
          context: { error: err instanceof Error ? err.message : String(err) },
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
    console.log(`[run-simple] Recovered stale run ${run.id} → ${hasCheckpoint ? 'paused' : 'failed'}`);
  }
}
