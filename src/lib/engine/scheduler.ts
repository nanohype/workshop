import { Graph } from './graph';
import type { RunContext } from './context';

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
}
