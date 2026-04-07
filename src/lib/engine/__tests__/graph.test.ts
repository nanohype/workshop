import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import type { WorkflowNode, WorkflowEdge } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: { label: id },
    ...overrides,
  };
}

function makeEdge(source: string, target: string, overrides: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    ...overrides,
  };
}

// ── Graph construction ───────────────────────────────────────────────────────

describe('Graph', () => {
  describe('construction and lookups', () => {
    it('retrieves nodes by id', () => {
      const graph = new Graph([makeNode('a'), makeNode('b')], []);
      expect(graph.getNode('a')?.id).toBe('a');
      expect(graph.getNode('b')?.id).toBe('b');
      expect(graph.getNode('x')).toBeUndefined();
    });

    it('returns all nodes', () => {
      const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
      const graph = new Graph(nodes, []);
      expect(graph.getNodes()).toHaveLength(3);
    });

    it('computes successors and predecessors from edges', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('a', 'c')],
      );
      expect(graph.getSuccessors('a')).toEqual(['b', 'c']);
      expect(graph.getPredecessors('b')).toEqual(['a']);
      expect(graph.getPredecessors('c')).toEqual(['a']);
      expect(graph.getSuccessors('b')).toEqual([]);
    });

    it('returns outgoing and incoming edges', () => {
      const edges = [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'c')];
      const graph = new Graph([makeNode('a'), makeNode('b'), makeNode('c')], edges);

      expect(graph.getOutgoingEdges('a')).toHaveLength(2);
      expect(graph.getIncomingEdges('c')).toHaveLength(2);
      expect(graph.getIncomingEdges('a')).toHaveLength(0);
    });
  });

  // ── Start / end nodes ────────────────────────────────────────────────────

  describe('start and end nodes', () => {
    it('identifies start nodes (no incoming edges)', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c')],
      );
      const starts = graph.getStartNodes();
      expect(starts).toHaveLength(1);
      expect(starts[0].id).toBe('a');
    });

    it('identifies end nodes (no outgoing edges)', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c')],
      );
      const ends = graph.getEndNodes();
      expect(ends).toHaveLength(1);
      expect(ends[0].id).toBe('c');
    });

    it('handles multiple start nodes', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'c'), makeEdge('b', 'c')],
      );
      const starts = graph.getStartNodes();
      expect(starts).toHaveLength(2);
      expect(starts.map(n => n.id).sort()).toEqual(['a', 'b']);
    });

    it('handles multiple end nodes', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('a', 'c')],
      );
      const ends = graph.getEndNodes();
      expect(ends).toHaveLength(2);
      expect(ends.map(n => n.id).sort()).toEqual(['b', 'c']);
    });

    it('disconnected nodes are both start and end', () => {
      const graph = new Graph([makeNode('a'), makeNode('b')], []);
      expect(graph.getStartNodes()).toHaveLength(2);
      expect(graph.getEndNodes()).toHaveLength(2);
    });
  });

  // ── Topological sort ─────────────────────────────────────────────────────

  describe('topologicalSort', () => {
    it('returns correct ordering for a linear chain', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c')],
      );
      expect(graph.topologicalSort()).toEqual(['a', 'b', 'c']);
    });

    it('respects dependency ordering in a diamond', () => {
      // a -> b, a -> c, b -> d, c -> d
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')],
        [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd'), makeEdge('c', 'd')],
      );
      const sorted = graph.topologicalSort();

      // a must come before b and c; b and c must come before d
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'));
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
      expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
    });

    it('handles multiple independent start nodes', () => {
      // a -> c, b -> c
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'c'), makeEdge('b', 'c')],
      );
      const sorted = graph.topologicalSort();
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'));
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
    });

    it('handles disconnected components', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')],
        [makeEdge('a', 'b'), makeEdge('c', 'd')],
      );
      const sorted = graph.topologicalSort();
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
      expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
      expect(sorted).toHaveLength(4);
    });

    it('handles a single node with no edges', () => {
      const graph = new Graph([makeNode('a')], []);
      expect(graph.topologicalSort()).toEqual(['a']);
    });

    it('throws on cycle (A -> B -> A)', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b'), makeEdge('b', 'a')],
      );
      expect(() => graph.topologicalSort()).toThrow(/Cycle detected/);
    });

    it('throws on three-node cycle', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c'), makeEdge('c', 'a')],
      );
      expect(() => graph.topologicalSort()).toThrow(/Cycle detected/);
    });

    it('handles complex DAG with multiple merge points', () => {
      //   a
      //  / \
      // b   c
      // |\ /|
      // | X |
      // |/ \|
      // d   e
      //  \ /
      //   f
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d'), makeNode('e'), makeNode('f')],
        [
          makeEdge('a', 'b'), makeEdge('a', 'c'),
          makeEdge('b', 'd'), makeEdge('b', 'e'),
          makeEdge('c', 'd'), makeEdge('c', 'e'),
          makeEdge('d', 'f'), makeEdge('e', 'f'),
        ],
      );
      const sorted = graph.topologicalSort();
      expect(sorted).toHaveLength(6);
      // Verify all ordering constraints
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
      expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('c'));
      expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('d'));
      expect(sorted.indexOf('c')).toBeLessThan(sorted.indexOf('d'));
      expect(sorted.indexOf('d')).toBeLessThan(sorted.indexOf('f'));
      expect(sorted.indexOf('e')).toBeLessThan(sorted.indexOf('f'));
    });
  });

  // ── validate() ───────────────────────────────────────────────────────────

  describe('validate', () => {
    it('valid linear workflow passes', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b')],
      );
      const result = graph.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('empty workflow is invalid', () => {
      const graph = new Graph([], []);
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow must have at least one node');
    });

    it('detects cycles', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b'), makeEdge('b', 'a')],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workflow contains a cycle');
    });

    it('detects self-loops', () => {
      const graph = new Graph(
        [makeNode('a')],
        [{ id: 'self', source: 'a', target: 'a' }],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('self-loop'))).toBe(true);
    });

    it('detects edges referencing missing source nodes', () => {
      const graph = new Graph(
        [makeNode('a')],
        [{ id: 'bad-edge', source: 'missing', target: 'a' }],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('unknown source node "missing"'))).toBe(true);
    });

    it('detects edges referencing missing target nodes', () => {
      const graph = new Graph(
        [makeNode('a')],
        [{ id: 'bad-edge', source: 'a', target: 'missing' }],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('unknown target node "missing"'))).toBe(true);
    });

    it('rejects stub providers (gemini-cli, codex)', () => {
      const graph = new Graph(
        [makeNode('a', { data: { label: 'agent1', provider: 'gemini-cli' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('gemini-cli') && e.includes('not yet implemented'))).toBe(true);
    });

    it('rejects codex stub provider', () => {
      const graph = new Graph(
        [makeNode('a', { data: { label: 'agent2', provider: 'codex' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('codex'))).toBe(true);
    });

    it('allows valid providers like claude-code', () => {
      const graph = new Graph(
        [makeNode('a', { data: { label: 'agent1', provider: 'claude-code' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(true);
    });

    it('condition node without expression is invalid', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'condition', data: { label: 'cond1' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('condition expression'))).toBe(true);
    });

    it('condition node with expression is valid', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'condition', data: { label: 'cond1', condition: 'x > 5' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(true);
    });

    it('git-commit node without message or template is invalid', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'git-commit', data: { label: 'commit1' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('commit message or template'))).toBe(true);
    });

    it('git-commit node with commitMessage is valid', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'git-commit', data: { label: 'commit1', commitMessage: 'fix: bug' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(true);
    });

    it('git-commit node with commitTemplate is valid', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'git-commit', data: { label: 'commit1', commitTemplate: '{{msg}}' } })],
        [],
      );
      const result = graph.validate();
      expect(result.valid).toBe(true);
    });

    it('warns about dynamic conditions on input nodes', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'input' }), makeNode('b')],
        [makeEdge('a', 'b', { dynamicCondition: 'someVar === true' })],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('dynamic condition on an input node'))).toBe(true);
    });

    it('warns about activateOn on input node edges', () => {
      const graph = new Graph(
        [makeNode('a', { type: 'input' }), makeNode('b')],
        [makeEdge('a', 'b', { activateOn: 'some-event' })],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('input node'))).toBe(true);
    });

    it('accumulates multiple errors', () => {
      // Self-loop + stub provider + cycle (from self-loop)
      const graph = new Graph(
        [makeNode('a', { data: { label: 'agent', provider: 'gemini-cli' } })],
        [{ id: 'self', source: 'a', target: 'a' }],
      );
      const result = graph.validate();
      expect(result.valid).toBe(false);
      // Should have both the self-loop error and the stub provider error
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── hasParallelBranches ──────────────────────────────────────────────────

  describe('hasParallelBranches', () => {
    it('returns true when a node has multiple successors', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('a', 'c')],
      );
      expect(graph.hasParallelBranches('a')).toBe(true);
    });

    it('returns false for a node with one successor', () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b')],
      );
      expect(graph.hasParallelBranches('a')).toBe(false);
    });

    it('returns false for a leaf node', () => {
      const graph = new Graph([makeNode('a')], []);
      expect(graph.hasParallelBranches('a')).toBe(false);
    });
  });
});
