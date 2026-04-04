import type { RunState, NodeRunState, ExecutionEvent } from '@/lib/engine/types';

export interface RunSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunState['status'];
  startedAt: Date;
  completedAt?: Date;
  totalTokens: RunState['totalTokens'];
}

export interface RunDetail extends RunState {
  workflowName: string;
  events: ExecutionEvent[];
}

export type { RunState, NodeRunState, ExecutionEvent };
