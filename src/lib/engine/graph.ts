import type { WorkflowNode, WorkflowEdge } from './types';

export class Graph {
  private adjacency = new Map<string, string[]>();
  private reverseAdjacency = new Map<string, string[]>();
  private nodeMap = new Map<string, WorkflowNode>();
  private edgeMap = new Map<string, WorkflowEdge>();

  constructor(
    public readonly nodes: WorkflowNode[],
    public readonly edges: WorkflowEdge[]
  ) {
    for (const node of nodes) {
      this.nodeMap.set(node.id, node);
      this.adjacency.set(node.id, []);
      this.reverseAdjacency.set(node.id, []);
    }
    for (const edge of edges) {
      this.edgeMap.set(edge.id, edge);
      this.adjacency.get(edge.source)?.push(edge.target);
      this.reverseAdjacency.get(edge.target)?.push(edge.source);
    }
  }

  getNode(id: string): WorkflowNode | undefined {
    return this.nodeMap.get(id);
  }

  getNodes(): WorkflowNode[] {
    return this.nodes;
  }

  getOutgoingEdges(nodeId: string): WorkflowEdge[] {
    return this.edges.filter(e => e.source === nodeId);
  }

  getIncomingEdges(nodeId: string): WorkflowEdge[] {
    return this.edges.filter(e => e.target === nodeId);
  }

  getSuccessors(nodeId: string): string[] {
    return this.adjacency.get(nodeId) || [];
  }

  getPredecessors(nodeId: string): string[] {
    return this.reverseAdjacency.get(nodeId) || [];
  }

  getStartNodes(): WorkflowNode[] {
    return this.nodes.filter(n =>
      (this.reverseAdjacency.get(n.id)?.length || 0) === 0
    );
  }

  getEndNodes(): WorkflowNode[] {
    return this.nodes.filter(n =>
      (this.adjacency.get(n.id)?.length || 0) === 0
    );
  }

  topologicalSort(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const temp = new Set<string>();

    const visit = (nodeId: string) => {
      if (temp.has(nodeId)) throw new Error(`Cycle detected at node ${nodeId}`);
      if (visited.has(nodeId)) return;
      temp.add(nodeId);
      for (const successor of this.getSuccessors(nodeId)) {
        visit(successor);
      }
      temp.delete(nodeId);
      visited.add(nodeId);
      result.unshift(nodeId);
    };

    for (const node of this.nodes) {
      if (!visited.has(node.id)) visit(node.id);
    }

    return result;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.nodes.length === 0) {
      errors.push('Workflow must have at least one node');
    }

    const startNodes = this.getStartNodes();
    if (startNodes.length === 0 && this.nodes.length > 0) {
      errors.push('Workflow must have at least one start node (no incoming edges)');
    }

    try {
      this.topologicalSort();
    } catch {
      errors.push('Workflow contains a cycle');
    }

    // Validate edges reference existing nodes
    for (const edge of this.edges) {
      if (!this.nodeMap.has(edge.source)) {
        errors.push(`Edge "${edge.id}" references unknown source node "${edge.source}"`);
      }
      if (!this.nodeMap.has(edge.target)) {
        errors.push(`Edge "${edge.id}" references unknown target node "${edge.target}"`);
      }
      if (edge.source === edge.target) {
        errors.push(`Edge "${edge.id}" creates a self-loop on node "${edge.source}"`);
      }
    }

    for (const node of this.nodes) {
      if (node.type === 'condition' && !node.data.condition) {
        errors.push(`Condition node "${node.data.label}" must have a condition expression`);
      }
      if (node.type === 'git-commit' && !node.data.commitMessage && !node.data.commitTemplate) {
        errors.push(`Git commit node "${node.data.label}" must have a commit message or template`);
      }
    }

    // Warn about dynamic edges on input nodes (conditions evaluated before context exists)
    for (const edge of this.edges) {
      if (edge.dynamicCondition || edge.activateOn) {
        const sourceNode = this.nodeMap.get(edge.source);
        if (sourceNode?.type === 'input') {
          errors.push(`Edge "${edge.id}" has dynamic condition on an input node — condition will evaluate before any context exists`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  hasParallelBranches(nodeId: string): boolean {
    return (this.adjacency.get(nodeId)?.length || 0) > 1;
  }
}
