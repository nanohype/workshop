import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Graph } from '../graph';
import { Scheduler } from '../scheduler';
import { RunContext } from '../context';
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

/**
 * Complete a node in context + scheduler — sets state to completed and marks
 * the scheduler's internal completed set.
 */
function completeNode(nodeId: string, context: RunContext, scheduler: Scheduler): void {
  context.setNodeState(nodeId, { status: 'completed', completedAt: new Date() });
  scheduler.markCompleted(nodeId);
}

function skipNode(nodeId: string, context: RunContext, scheduler: Scheduler): void {
  context.setNodeState(nodeId, { status: 'skipped', completedAt: new Date() });
  scheduler.markCompleted(nodeId);
}

// ── Scheduler tests ──────────────────────────────────────────────────────────

describe('Scheduler', () => {
  let context: RunContext;

  beforeEach(() => {
    context = new RunContext();
  });

  // ── Basic batch scheduling ─────────────────────────────────────────────

  describe('basic batch scheduling', () => {
    it('returns start nodes as the first batch', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b')],
      );
      const scheduler = new Scheduler(graph);
      const batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['a']);
      expect(batch!.isParallel).toBe(false);
    });

    it('returns null when all nodes completed', async () => {
      const graph = new Graph([makeNode('a')], []);
      const scheduler = new Scheduler(graph);

      completeNode('a', context, scheduler);
      const batch = await scheduler.getNextBatch(context);
      expect(batch).toBeNull();
    });

    it('returns null when no nodes are ready (dependencies unmet)', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b')],
      );
      const scheduler = new Scheduler(graph);

      // a is running, b depends on a
      context.setNodeState('a', { status: 'running' });
      const batch = await scheduler.getNextBatch(context);
      expect(batch).toBeNull();
    });

    it('isComplete returns true after all nodes completed', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b')],
      );
      const scheduler = new Scheduler(graph);
      expect(scheduler.isComplete()).toBe(false);

      completeNode('a', context, scheduler);
      expect(scheduler.isComplete()).toBe(false);

      completeNode('b', context, scheduler);
      expect(scheduler.isComplete()).toBe(true);
    });
  });

  // ── Sequential ordering ────────────────────────────────────────────────

  describe('sequential ordering', () => {
    it('schedules nodes in dependency order (linear chain)', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c')],
      );
      const scheduler = new Scheduler(graph);
      const order: string[] = [];

      // Batch 1: a
      let batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['a']);
      order.push(...batch!.nodeIds);
      completeNode('a', context, scheduler);

      // Batch 2: b
      batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['b']);
      order.push(...batch!.nodeIds);
      completeNode('b', context, scheduler);

      // Batch 3: c
      batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['c']);
      order.push(...batch!.nodeIds);
      completeNode('c', context, scheduler);

      // Done
      batch = await scheduler.getNextBatch(context);
      expect(batch).toBeNull();

      expect(order).toEqual(['a', 'b', 'c']);
    });
  });

  // ── Parallel batches ───────────────────────────────────────────────────

  describe('parallel batches', () => {
    it('multiple start nodes are batched together', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'c'), makeEdge('b', 'c')],
      );
      const scheduler = new Scheduler(graph);

      const batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds.sort()).toEqual(['a', 'b']);
      expect(batch!.isParallel).toBe(true);
    });

    it('diamond merge: parallel branches then single merge node', async () => {
      //    a
      //   / \
      //  b   c
      //   \ /
      //    d
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c'), makeNode('d')],
        [makeEdge('a', 'b'), makeEdge('a', 'c'), makeEdge('b', 'd'), makeEdge('c', 'd')],
      );
      const scheduler = new Scheduler(graph);

      // Batch 1: a
      let batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['a']);
      completeNode('a', context, scheduler);

      // Batch 2: b and c in parallel
      batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds.sort()).toEqual(['b', 'c']);
      expect(batch!.isParallel).toBe(true);
      completeNode('b', context, scheduler);
      completeNode('c', context, scheduler);

      // Batch 3: d (after both b and c complete)
      batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['d']);
      expect(batch!.isParallel).toBe(false);
    });

    it('merge node waits for all predecessors', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'c'), makeEdge('b', 'c')],
      );
      const scheduler = new Scheduler(graph);

      // Complete only a, not b
      completeNode('a', context, scheduler);

      const batch = await scheduler.getNextBatch(context);
      // b is still pending, and c cannot run yet
      expect(batch!.nodeIds).toEqual(['b']);
    });
  });

  // ── Edge satisfaction ──────────────────────────────────────────────────

  describe('edge satisfaction', () => {
    it('skipped predecessor satisfies edge', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b')],
      );
      const scheduler = new Scheduler(graph);

      skipNode('a', context, scheduler);
      const batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['b']);
    });

    it('streaming edge is satisfied when source is running', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b', { streaming: true })],
      );
      const scheduler = new Scheduler(graph);

      context.setNodeState('a', { status: 'running' });
      const batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['b']);
    });

    it('streaming edge is satisfied when source is completed', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b', { streaming: true })],
      );
      const scheduler = new Scheduler(graph);

      completeNode('a', context, scheduler);
      const batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['b']);
    });

    it('activateOn edge requires matching context event', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b', { activateOn: 'build-complete' })],
      );
      const scheduler = new Scheduler(graph);
      completeNode('a', context, scheduler);

      // Without the event, b should not be scheduled
      let batch = await scheduler.getNextBatch(context);
      expect(batch).toBeNull();

      // Publish the event
      context.publish({
        source: 'a',
        type: 'build-complete',
        payload: {},
        timestamp: new Date(),
      });

      batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['b']);
    });
  });

  // ── Dynamic conditions / edge deactivation ─────────────────────────────

  describe('edge deactivation (dynamicCondition)', () => {
    it('skips node when all incoming edges are deactivated', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b', { dynamicCondition: 'false' })],
      );
      const scheduler = new Scheduler(graph);
      completeNode('a', context, scheduler);

      // Mock evaluateCondition so it resolves 'false' to false
      vi.spyOn(context, 'evaluateCondition').mockResolvedValue(false);

      const batch = await scheduler.getNextBatch(context);
      // b should be skipped (all edges deactivated), no batch returned with b
      // After skip, getNextBatch should return null
      expect(batch).toBeNull();
      expect(context.getNodeState('b').status).toBe('skipped');
    });

    it('does not skip node when at least one edge is active', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [
          makeEdge('a', 'c', { dynamicCondition: 'false' }),
          makeEdge('b', 'c'), // no condition, always active
        ],
      );
      const scheduler = new Scheduler(graph);
      completeNode('a', context, scheduler);
      completeNode('b', context, scheduler);

      vi.spyOn(context, 'evaluateCondition').mockResolvedValue(false);

      const batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['c']);
    });

    it('edge stays active when condition evaluation throws', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [makeEdge('a', 'b', { dynamicCondition: 'invalid()' })],
      );
      const scheduler = new Scheduler(graph);
      completeNode('a', context, scheduler);

      vi.spyOn(context, 'evaluateCondition').mockRejectedValue(new Error('eval error'));

      const batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['b']);
    });
  });

  // ── Intent conflict blocking ───────────────────────────────────────────

  describe('intent conflict blocking', () => {
    it('blocks node with conflicting workspace intent from a running node', async () => {
      // Two git-commit nodes targeting '.', both depend on a start node.
      // a is running with intent; b should be blocked.
      const graph = new Graph(
        [
          makeNode('start', { data: { label: 'start' } }),
          makeNode('a', { type: 'git-commit', data: { label: 'commit-a', commitMessage: 'a' } }),
          makeNode('b', { type: 'git-commit', data: { label: 'commit-b', commitMessage: 'b' } }),
        ],
        [
          makeEdge('start', 'a'),
          makeEdge('start', 'b'),
        ],
      );
      const scheduler = new Scheduler(graph);

      // Complete start so a,b become ready
      completeNode('start', context, scheduler);
      // Mark a as running and holding intent
      context.setNodeState('a', { status: 'running' });
      context.declareIntent('a', ['.']);

      const batch = await scheduler.getNextBatch(context);
      // a is running so not re-scheduled; b conflicts with a's intent on '.'
      expect(batch).toBeNull();
    });

    it('unblocks node after intent is released', async () => {
      const graph = new Graph(
        [
          makeNode('start', { data: { label: 'start' } }),
          makeNode('a', { type: 'git-commit', data: { label: 'commit-a', commitMessage: 'a' } }),
          makeNode('b', { type: 'git-commit', data: { label: 'commit-b', commitMessage: 'b' } }),
        ],
        [
          makeEdge('start', 'a'),
          makeEdge('start', 'b'),
        ],
      );
      const scheduler = new Scheduler(graph);

      // Complete start
      completeNode('start', context, scheduler);
      // a runs and holds intent
      context.setNodeState('a', { status: 'running' });
      context.declareIntent('a', ['.']);

      // b is blocked
      let batch = await scheduler.getNextBatch(context);
      expect(batch).toBeNull();

      // Complete a, release intent
      completeNode('a', context, scheduler);
      context.releaseIntent('a');

      batch = await scheduler.getNextBatch(context);
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['b']);
    });

    it('non-workspace node types have no intent paths and are not blocked', async () => {
      // Transform returns [] from getNodePaths, so no conflict check.
      // Even with a held intent on '.', transform should still be scheduled.
      const graph = new Graph(
        [
          makeNode('a', { type: 'agent', data: { label: 'agent1', workspace: 'safe' } }),
          makeNode('b', { type: 'transform', data: { label: 'transform1' } }),
        ],
        [],
      );
      const scheduler = new Scheduler(graph);

      // Simulate some other running node holding a '.' intent
      context.declareIntent('external-node', ['.']);
      // Mark a as running to remove it from the ready pool
      context.setNodeState('a', { status: 'running' });

      const batch = await scheduler.getNextBatch(context);
      // transform has no paths so it skips the conflict check entirely
      expect(batch).not.toBeNull();
      expect(batch!.nodeIds).toEqual(['b']);
    });
  });

  // ── hasPendingNodes / getCompleted / restoreCompleted ──────────────────

  describe('state management', () => {
    it('hasPendingNodes returns true when nodes are pending', () => {
      const graph = new Graph([makeNode('a'), makeNode('b')], []);
      const scheduler = new Scheduler(graph);
      expect(scheduler.hasPendingNodes(context)).toBe(true);
    });

    it('hasPendingNodes returns false when all completed', () => {
      const graph = new Graph([makeNode('a')], []);
      const scheduler = new Scheduler(graph);
      completeNode('a', context, scheduler);
      expect(scheduler.hasPendingNodes(context)).toBe(false);
    });

    it('hasPendingNodes returns true when a node is running', () => {
      const graph = new Graph([makeNode('a')], []);
      const scheduler = new Scheduler(graph);
      context.setNodeState('a', { status: 'running' });
      expect(scheduler.hasPendingNodes(context)).toBe(true);
    });

    it('hasPendingNodes returns true when a node is waiting', () => {
      const graph = new Graph([makeNode('a')], []);
      const scheduler = new Scheduler(graph);
      context.setNodeState('a', { status: 'waiting' });
      expect(scheduler.hasPendingNodes(context)).toBe(true);
    });

    it('getCompleted returns completed node ids', () => {
      const graph = new Graph([makeNode('a'), makeNode('b')], []);
      const scheduler = new Scheduler(graph);
      completeNode('a', context, scheduler);
      expect(scheduler.getCompleted()).toEqual(['a']);
    });

    it('restoreCompleted populates completed set', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c')],
      );
      const scheduler = new Scheduler(graph);
      context.setNodeState('a', { status: 'completed' });
      context.setNodeState('b', { status: 'completed' });
      scheduler.restoreCompleted(['a', 'b']);

      // c should now be ready
      const batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['c']);
    });
  });

  // ── Complex scenarios ──────────────────────────────────────────────────

  describe('complex scenarios', () => {
    it('full workflow: wide parallel then funnel', async () => {
      // s1, s2, s3 (start) -> merge -> end
      const graph = new Graph(
        [makeNode('s1'), makeNode('s2'), makeNode('s3'), makeNode('merge'), makeNode('end')],
        [
          makeEdge('s1', 'merge'), makeEdge('s2', 'merge'), makeEdge('s3', 'merge'),
          makeEdge('merge', 'end'),
        ],
      );
      const scheduler = new Scheduler(graph);

      // Step 1: all starts in parallel
      let batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds.sort()).toEqual(['s1', 's2', 's3']);
      expect(batch!.isParallel).toBe(true);
      for (const id of batch!.nodeIds) completeNode(id, context, scheduler);

      // Step 2: merge
      batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['merge']);
      completeNode('merge', context, scheduler);

      // Step 3: end
      batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['end']);
      completeNode('end', context, scheduler);

      expect(scheduler.isComplete()).toBe(true);
    });

    it('running nodes are not re-scheduled', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b')],
        [],
      );
      const scheduler = new Scheduler(graph);

      context.setNodeState('a', { status: 'running' });

      const batch = await scheduler.getNextBatch(context);
      // a is running so skipped; b is pending with no deps so ready
      expect(batch!.nodeIds).toEqual(['b']);
    });

    it('skipped nodes propagate completion to scheduler', async () => {
      const graph = new Graph(
        [makeNode('a'), makeNode('b'), makeNode('c')],
        [makeEdge('a', 'b'), makeEdge('b', 'c')],
      );
      const scheduler = new Scheduler(graph);

      // a completed, b skipped
      completeNode('a', context, scheduler);
      skipNode('b', context, scheduler);

      // c should be ready since b is skipped (treated as completed for edges)
      const batch = await scheduler.getNextBatch(context);
      expect(batch!.nodeIds).toEqual(['c']);
    });
  });
});
