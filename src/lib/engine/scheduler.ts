import { Graph } from './graph';
import type { RunContext } from './context';
import type { WorkflowNode } from './types';

export interface ScheduledBatch {
  nodeIds: string[];
  isParallel: boolean;
}

export class Scheduler {
  private graph: Graph;
  private completed = new Set<string>();

  constructor(graph: Graph) {
    this.graph = graph;
  }

  getNextBatch(context: RunContext): ScheduledBatch | null {
    const ready: string[] = [];

    for (const node of this.graph.nodes) {
      if (this.completed.has(node.id)) continue;
      if (context.getNodeState(node.id).status === 'running') continue;
      if (context.getNodeState(node.id).status === 'completed') {
        this.completed.add(node.id);
        continue;
      }
      if (context.getNodeState(node.id).status === 'skipped') {
        this.completed.add(node.id);
        continue;
      }

      const predecessors = this.graph.getPredecessors(node.id);
      const allPredsDone = predecessors.every(
        p => this.completed.has(p) || context.getNodeState(p).status === 'completed' || context.getNodeState(p).status === 'skipped'
      );

      if (allPredsDone) {
        const paths = this.getNodePaths(node);
        if (paths.length > 0) {
          const conflict = context.checkConflict(paths);
          if (conflict) continue; // Stay pending — will retry next cycle
        }
        ready.push(node.id);
      }
    }

    if (ready.length === 0) return null;

    return {
      nodeIds: ready,
      isParallel: ready.length > 1,
    };
  }

  markCompleted(nodeId: string): void {
    this.completed.add(nodeId);
  }

  isComplete(): boolean {
    return this.completed.size >= this.graph.nodes.length;
  }

  getCompleted(): string[] {
    return Array.from(this.completed);
  }

  restoreCompleted(nodeIds: string[]): void {
    for (const id of nodeIds) {
      this.completed.add(id);
    }
  }

  private getNodePaths(node: WorkflowNode): string[] {
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
}
