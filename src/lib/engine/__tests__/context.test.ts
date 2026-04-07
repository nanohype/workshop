import { describe, it, expect, vi } from 'vitest';
import { RunContext } from '../context';
import type { ExecutionEvent, ContextEvent } from '../types';

// ── Data store ───────────────────────────────────────────────────────────────

describe('RunContext', () => {
  describe('data store (get/set/getAll)', () => {
    it('starts empty when no initial data provided', () => {
      const ctx = new RunContext();
      expect(ctx.getAll()).toEqual({});
    });

    it('initializes with provided data', () => {
      const ctx = new RunContext({ foo: 'bar', count: 42 });
      expect(ctx.get('foo')).toBe('bar');
      expect(ctx.get('count')).toBe(42);
    });

    it('set/get roundtrips values', () => {
      const ctx = new RunContext();
      ctx.set('key', 'value');
      expect(ctx.get('key')).toBe('value');
    });

    it('getAll returns a copy (mutations do not leak)', () => {
      const ctx = new RunContext({ a: 1 });
      const snapshot = ctx.getAll();
      snapshot.a = 999;
      expect(ctx.get('a')).toBe(1);
    });

    it('overwrites existing keys', () => {
      const ctx = new RunContext({ a: 1 });
      ctx.set('a', 2);
      expect(ctx.get('a')).toBe(2);
    });

    it('returns undefined for missing keys', () => {
      const ctx = new RunContext();
      expect(ctx.get('missing')).toBeUndefined();
    });

    it('does not mutate the original initialData object', () => {
      const init = { x: 10 };
      const ctx = new RunContext(init);
      ctx.set('x', 20);
      expect(init.x).toBe(10);
    });
  });

  // ── Node outputs ─────────────────────────────────────────────────────────

  describe('node outputs', () => {
    it('setNodeOutput stores and getNodeOutput retrieves', () => {
      const ctx = new RunContext();
      ctx.setNodeOutput('node-1', 'hello world');
      expect(ctx.getNodeOutput('node-1')).toBe('hello world');
    });

    it('setNodeOutput also sets backward-compat data key', () => {
      const ctx = new RunContext();
      ctx.setNodeOutput('abc', 'result');
      expect(ctx.get('node_abc_output')).toBe('result');
    });

    it('getNodeOutput returns undefined for unknown nodes', () => {
      const ctx = new RunContext();
      expect(ctx.getNodeOutput('nonexistent')).toBeUndefined();
    });

    it('overwrites previous output', () => {
      const ctx = new RunContext();
      ctx.setNodeOutput('n1', 'first');
      ctx.setNodeOutput('n1', 'second');
      expect(ctx.getNodeOutput('n1')).toBe('second');
    });
  });

  // ── Node states ──────────────────────────────────────────────────────────

  describe('node states', () => {
    it('defaults to pending for unknown nodes', () => {
      const ctx = new RunContext();
      expect(ctx.getNodeState('unknown')).toEqual({ status: 'pending' });
    });

    it('sets and retrieves node state', () => {
      const ctx = new RunContext();
      ctx.setNodeState('n1', { status: 'running', startedAt: new Date('2025-01-01') });
      const state = ctx.getNodeState('n1');
      expect(state.status).toBe('running');
      expect(state.startedAt).toEqual(new Date('2025-01-01'));
    });

    it('merges partial state updates', () => {
      const ctx = new RunContext();
      ctx.setNodeState('n1', { status: 'running', startedAt: new Date('2025-01-01') });
      ctx.setNodeState('n1', { status: 'completed', completedAt: new Date('2025-01-02') });
      const state = ctx.getNodeState('n1');
      expect(state.status).toBe('completed');
      expect(state.startedAt).toEqual(new Date('2025-01-01'));
      expect(state.completedAt).toEqual(new Date('2025-01-02'));
    });

    it('getAllNodeStates returns a copy', () => {
      const ctx = new RunContext();
      ctx.setNodeState('n1', { status: 'completed' });
      const all = ctx.getAllNodeStates();
      all.n1 = { status: 'failed' };
      expect(ctx.getNodeState('n1').status).toBe('completed');
    });

    it('restoreNodeStates replaces all states', () => {
      const ctx = new RunContext();
      ctx.setNodeState('n1', { status: 'running' });
      ctx.restoreNodeStates({
        n1: { status: 'completed' },
        n2: { status: 'pending' },
      });
      expect(ctx.getNodeState('n1').status).toBe('completed');
      expect(ctx.getNodeState('n2').status).toBe('pending');
    });
  });

  // ── Execution events (event bus) ─────────────────────────────────────────

  describe('execution events', () => {
    it('emits and records events', () => {
      const ctx = new RunContext();
      const event: ExecutionEvent = {
        type: 'node-start',
        nodeId: 'n1',
        data: {},
        timestamp: new Date(),
      };
      ctx.emit(event);
      expect(ctx.getEvents()).toHaveLength(1);
      expect(ctx.getEvents()[0]).toEqual(event);
    });

    it('notifies listeners on emit', () => {
      const ctx = new RunContext();
      const listener = vi.fn();
      ctx.onEvent(listener);

      const event: ExecutionEvent = {
        type: 'node-complete',
        nodeId: 'n1',
        data: { output: 'done' },
        timestamp: new Date(),
      };
      ctx.emit(event);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('unsubscribe removes listener', () => {
      const ctx = new RunContext();
      const listener = vi.fn();
      const unsub = ctx.onEvent(listener);
      unsub();

      ctx.emit({
        type: 'node-start',
        nodeId: 'n1',
        data: {},
        timestamp: new Date(),
      });
      expect(listener).not.toHaveBeenCalled();
    });

    it('getEvents returns a copy', () => {
      const ctx = new RunContext();
      ctx.emit({ type: 'node-start', nodeId: 'n1', data: {}, timestamp: new Date() });
      const events = ctx.getEvents();
      events.push({ type: 'run-complete', data: {}, timestamp: new Date() });
      expect(ctx.getEvents()).toHaveLength(1);
    });

    it('multiple listeners all fire', () => {
      const ctx = new RunContext();
      const l1 = vi.fn();
      const l2 = vi.fn();
      ctx.onEvent(l1);
      ctx.onEvent(l2);

      ctx.emit({ type: 'node-start', nodeId: 'n1', data: {}, timestamp: new Date() });
      expect(l1).toHaveBeenCalledOnce();
      expect(l2).toHaveBeenCalledOnce();
    });
  });

  // ── Intent / conflict tracking ───────────────────────────────────────────

  describe('intent / conflict tracking', () => {
    it('no conflict when no intents declared', () => {
      const ctx = new RunContext();
      expect(ctx.checkConflict(['/src'])).toBeNull();
    });

    it('detects overlapping path conflict', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['/src/lib']);
      // Requesting a parent path that overlaps
      const conflict = ctx.checkConflict(['/src']);
      expect(conflict).toBe('node-a');
    });

    it('detects child path conflict', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['/src']);
      const conflict = ctx.checkConflict(['/src/lib/deep']);
      expect(conflict).toBe('node-a');
    });

    it('no conflict for disjoint paths', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['/src']);
      expect(ctx.checkConflict(['/docs'])).toBeNull();
    });

    it('releaseIntent clears the conflict', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['/src']);
      ctx.releaseIntent('node-a');
      expect(ctx.checkConflict(['/src'])).toBeNull();
    });

    it('normalizes paths to end with /', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['src']);
      // 'src/' should match 'src/'
      const conflict = ctx.checkConflict(['src']);
      expect(conflict).toBe('node-a');
    });

    it('dot path (workspace root) conflicts with dot-relative paths', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['.']);
      // './' is a prefix of './anything/', so it conflicts
      expect(ctx.checkConflict(['./src'])).toBe('node-a');
    });

    it('multiple intents from different nodes', () => {
      const ctx = new RunContext();
      ctx.declareIntent('node-a', ['src/lib']);
      ctx.declareIntent('node-b', ['docs']);
      expect(ctx.checkConflict(['src/lib/engine'])).toBe('node-a');
      expect(ctx.checkConflict(['docs/api'])).toBe('node-b');
      expect(ctx.checkConflict(['tests'])).toBeNull();
    });
  });

  // ── Context events (publish/subscribe) ───────────────────────────────────

  describe('context events (publish/subscribe)', () => {
    const makeCtxEvent = (type: string, source: string = 'test'): ContextEvent => ({
      source,
      type,
      payload: { data: 'test' },
      timestamp: new Date(),
    });

    it('publish stores events retrievable by getContextEvents', () => {
      const ctx = new RunContext();
      ctx.publish(makeCtxEvent('build-complete'));
      expect(ctx.getContextEvents()).toHaveLength(1);
      expect(ctx.getContextEvents('build-complete')).toHaveLength(1);
    });

    it('getContextEvents filters by type', () => {
      const ctx = new RunContext();
      ctx.publish(makeCtxEvent('build-complete'));
      ctx.publish(makeCtxEvent('test-passed'));
      ctx.publish(makeCtxEvent('build-complete'));

      expect(ctx.getContextEvents('build-complete')).toHaveLength(2);
      expect(ctx.getContextEvents('test-passed')).toHaveLength(1);
      expect(ctx.getContextEvents('unknown')).toHaveLength(0);
      expect(ctx.getContextEvents()).toHaveLength(3);
    });

    it('subscribe receives matching events', () => {
      const ctx = new RunContext();
      const handler = vi.fn();
      ctx.subscribe('build-complete', handler);
      ctx.publish(makeCtxEvent('build-complete'));
      ctx.publish(makeCtxEvent('test-passed'));

      expect(handler).toHaveBeenCalledOnce();
    });

    it('wildcard subscriber receives all events', () => {
      const ctx = new RunContext();
      const handler = vi.fn();
      ctx.subscribe('*', handler);
      ctx.publish(makeCtxEvent('build-complete'));
      ctx.publish(makeCtxEvent('test-passed'));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('unsubscribe stops delivery', () => {
      const ctx = new RunContext();
      const handler = vi.fn();
      const unsub = ctx.subscribe('build-complete', handler);
      unsub();
      ctx.publish(makeCtxEvent('build-complete'));
      expect(handler).not.toHaveBeenCalled();
    });

    it('ignores events without source or type', () => {
      const ctx = new RunContext();
      ctx.publish({ source: '', type: 'x', payload: null, timestamp: new Date() });
      ctx.publish({ source: 'a', type: '', payload: null, timestamp: new Date() });
      expect(ctx.getContextEvents()).toHaveLength(0);
    });

    it('restoreContextEvents replaces event history', () => {
      const ctx = new RunContext();
      ctx.publish(makeCtxEvent('original'));
      const restored: ContextEvent[] = [
        makeCtxEvent('restored-1'),
        makeCtxEvent('restored-2'),
      ];
      ctx.restoreContextEvents(restored);
      expect(ctx.getContextEvents()).toHaveLength(2);
      expect(ctx.getContextEvents('original')).toHaveLength(0);
      expect(ctx.getContextEvents('restored-1')).toHaveLength(1);
    });
  });

  // ── Stream buffers ───────────────────────────────────────────────────────

  describe('stream buffers', () => {
    it('getOrCreateStreamBuffer creates on first access', () => {
      const ctx = new RunContext();
      const buf = ctx.getOrCreateStreamBuffer('n1');
      expect(buf).toBeDefined();
      expect(buf.isClosed()).toBe(false);
    });

    it('returns same buffer on subsequent access', () => {
      const ctx = new RunContext();
      const buf1 = ctx.getOrCreateStreamBuffer('n1');
      const buf2 = ctx.getOrCreateStreamBuffer('n1');
      expect(buf1).toBe(buf2);
    });

    it('getStreamBuffer returns undefined for unknown node', () => {
      const ctx = new RunContext();
      expect(ctx.getStreamBuffer('nope')).toBeUndefined();
    });

    it('getStreamBuffer returns existing buffer', () => {
      const ctx = new RunContext();
      const created = ctx.getOrCreateStreamBuffer('n1');
      expect(ctx.getStreamBuffer('n1')).toBe(created);
    });
  });

  // ── Serialization / restore roundtrip ────────────────────────────────────

  describe('serialize / restore roundtrip', () => {
    it('roundtrips basic data', () => {
      const ctx = new RunContext({ projectName: 'workshop', count: 42 });
      ctx.set('extra', true);

      const serialized = ctx.serialize();
      const ctx2 = new RunContext();
      for (const [key, value] of Object.entries(serialized)) {
        if (key === '__contextEvents') {
          ctx2.restoreContextEvents(value as ContextEvent[]);
        } else if (key === '__nodeOutputs') {
          const outputs = value as Record<string, string>;
          for (const [nodeId, output] of Object.entries(outputs)) {
            ctx2.setNodeOutput(nodeId, output);
          }
        } else {
          ctx2.set(key, value);
        }
      }

      expect(ctx2.get('projectName')).toBe('workshop');
      expect(ctx2.get('count')).toBe(42);
      expect(ctx2.get('extra')).toBe(true);
    });

    it('roundtrips node outputs', () => {
      const ctx = new RunContext();
      ctx.setNodeOutput('n1', 'output-1');
      ctx.setNodeOutput('n2', 'output-2');

      const serialized = ctx.serialize();
      const ctx2 = new RunContext();
      const outputs = serialized.__nodeOutputs as Record<string, string>;
      for (const [nodeId, output] of Object.entries(outputs)) {
        ctx2.setNodeOutput(nodeId, output);
      }

      expect(ctx2.getNodeOutput('n1')).toBe('output-1');
      expect(ctx2.getNodeOutput('n2')).toBe('output-2');
    });

    it('roundtrips context events', () => {
      const ctx = new RunContext();
      ctx.publish({
        source: 'test-node',
        type: 'build-complete',
        payload: { success: true },
        timestamp: new Date('2025-06-01'),
      });

      const serialized = ctx.serialize();
      const ctx2 = new RunContext();
      ctx2.restoreContextEvents(serialized.__contextEvents as ContextEvent[]);

      const events = ctx2.getContextEvents('build-complete');
      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('test-node');
      expect(events[0].payload).toEqual({ success: true });
    });

    it('excludes functions from serialized data', () => {
      const ctx = new RunContext();
      ctx.set('fn', () => 'hello');
      ctx.set('num', 123);

      const serialized = ctx.serialize();
      expect(serialized.fn).toBeUndefined();
      expect(serialized.num).toBe(123);
    });

    it('node states are serialized separately via getAllNodeStates', () => {
      const ctx = new RunContext();
      ctx.setNodeState('n1', { status: 'completed', output: 'done' });

      // Node states are NOT in serialize() — they go through getAllNodeStates()
      const states = ctx.getAllNodeStates();
      const ctx2 = new RunContext();
      ctx2.restoreNodeStates(states);

      expect(ctx2.getNodeState('n1').status).toBe('completed');
      expect(ctx2.getNodeState('n1').output).toBe('done');
    });

    it('full roundtrip: data + node outputs + context events + node states', () => {
      const ctx = new RunContext({ workflow: 'test' });
      ctx.setNodeOutput('step1', 'result-1');
      ctx.setNodeOutput('step2', 'result-2');
      ctx.setNodeState('step1', { status: 'completed' });
      ctx.setNodeState('step2', { status: 'completed' });
      ctx.publish({
        source: 'step1',
        type: 'analysis-done',
        payload: { score: 95 },
        timestamp: new Date(),
      });

      // Serialize
      const serialized = ctx.serialize();
      const nodeStates = ctx.getAllNodeStates();

      // Restore into fresh context
      const ctx2 = new RunContext();
      for (const [key, value] of Object.entries(serialized)) {
        if (key === '__contextEvents') {
          ctx2.restoreContextEvents(value as ContextEvent[]);
        } else if (key === '__nodeOutputs') {
          for (const [nid, out] of Object.entries(value as Record<string, string>)) {
            ctx2.setNodeOutput(nid, out);
          }
        } else {
          ctx2.set(key, value);
        }
      }
      ctx2.restoreNodeStates(nodeStates);

      // Verify everything survived
      expect(ctx2.get('workflow')).toBe('test');
      expect(ctx2.getNodeOutput('step1')).toBe('result-1');
      expect(ctx2.getNodeOutput('step2')).toBe('result-2');
      expect(ctx2.getNodeState('step1').status).toBe('completed');
      expect(ctx2.getNodeState('step2').status).toBe('completed');
      expect(ctx2.getContextEvents('analysis-done')).toHaveLength(1);
    });
  });
});
