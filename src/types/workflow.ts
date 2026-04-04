import type { WorkflowNode, WorkflowEdge } from '@/lib/engine/types';

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  lastRunAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowCreateInput {
  name: string;
  description: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  variables?: Record<string, string>;
}

export interface WorkflowUpdateInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  variables?: Record<string, string>;
}

export type { WorkflowNode, WorkflowEdge };
