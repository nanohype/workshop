import { Graph } from './graph';
import type { RunContext } from './context';
import type { WorkflowNode, WorkflowEdge } from './types';

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

  async getNextBatch(context: RunContext): Promise<ScheduledBatch | null> {
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

      const incomingEdges = this.graph.getIncomingEdges(node.id);

      // No incoming edges = start node, always ready
      if (incomingEdges.length === 0) {
        ready.push(node.id);
        continue;
      }

      // Evaluate each incoming edge
      let allSatisfied = true;
      let allDeactivated = true;
      let hasEdges = false;

      for (const edge of incomingEdges) {
        hasEdges = true;
        const satisfied = await this.isEdgeSatisfied(edge, context);
        const deactivated = await this.isEdgeDeactivated(edge, context);

        if (deactivated) {
          // Deactivated edges don't block, but also don't satisfy
          continue;
        }

        allDeactivated = false;
        if (!satisfied) {
          allSatisfied = false;
        }
      }

      // All incoming edges deactivated → skip the node
      if (hasEdges && allDeactivated) {
        context.setNodeState(node.id, { status: 'skipped', completedAt: new Date() });
        this.completed.add(node.id);
        continue;
      }

      if (!allSatisfied) continue;

      // Intent conflict check
      const paths = this.getNodePaths(node);
      if (paths.length > 0) {
        const conflict = context.checkConflict(paths);
        if (conflict) continue;
      }

      ready.push(node.id);
    }

    if (ready.length === 0) return null;

    return {
      nodeIds: ready,
      isParallel: ready.length > 1,
    };
  }

  private async isEdgeSatisfied(edge: WorkflowEdge, context: RunContext): Promise<boolean> {
    const sourceState = context.getNodeState(edge.source).status;

    // Streaming edge: satisfied when source is running or done
    if (edge.streaming) {
      return sourceState === 'running' || sourceState === 'completed' || sourceState === 'skipped';
    }

    // activateOn: requires matching ContextEvent in the log
    if (edge.activateOn) {
      const events = context.getContextEvents(edge.activateOn);
      if (events.length === 0) return false;
    }

    // Standard: source must be completed or skipped
    return this.completed.has(edge.source) || sourceState === 'completed' || sourceState === 'skipped';
  }

  private async isEdgeDeactivated(edge: WorkflowEdge, context: RunContext): Promise<boolean> {
    if (!edge.dynamicCondition) return false;
    try {
      const result = await context.evaluateCondition(edge.dynamicCondition);
      return !result; // condition false = edge deactivated
    } catch {
      // Evaluation failure = edge stays active (safe default)
      return false;
    }
  }

  markCompleted(nodeId: string): void {
    this.completed.add(nodeId);
  }

  isComplete(): boolean {
    return this.completed.size >= this.graph.nodes.length;
  }

  hasPendingNodes(context: RunContext): boolean {
    for (const node of this.graph.nodes) {
      if (this.completed.has(node.id)) continue;
      const status = context.getNodeState(node.id).status;
      if (status === 'pending' || status === 'running' || status === 'waiting') {
        return true;
      }
    }
    return false;
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
