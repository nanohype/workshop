import type { NodeRunState, ExecutionEvent, IntentManifest, ContextEvent } from './types';
import { StreamBuffer } from './stream-buffer';

export class RunContext {
  private data: Record<string, unknown> = {};
  private nodeStates: Record<string, NodeRunState> = {};
  private events: ExecutionEvent[] = [];
  private eventListeners: ((event: ExecutionEvent) => void)[] = [];
  private intents = new Map<string, IntentManifest>();
  private contextEvents: ContextEvent[] = [];
  private contextSubscribers = new Map<string, Set<(event: ContextEvent) => void>>();
  private streamBuffers = new Map<string, StreamBuffer>();

  constructor(initialData: Record<string, unknown> = {}) {
    this.data = { ...initialData };
  }

  get(key: string): unknown {
    return this.data[key];
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
  }

  getAll(): Record<string, unknown> {
    return { ...this.data };
  }

  setNodeOutput(nodeId: string, output: string): void {
    this.data[`node_${nodeId}_output`] = output;
  }

  getNodeOutput(nodeId: string): string | undefined {
    return this.data[`node_${nodeId}_output`] as string | undefined;
  }

  getNodeState(nodeId: string): NodeRunState {
    return this.nodeStates[nodeId] || { status: 'pending' };
  }

  setNodeState(nodeId: string, state: Partial<NodeRunState>): void {
    this.nodeStates[nodeId] = {
      ...this.nodeStates[nodeId],
      ...state,
    } as NodeRunState;
  }

  getAllNodeStates(): Record<string, NodeRunState> {
    return { ...this.nodeStates };
  }

  emit(event: ExecutionEvent): void {
    this.events.push(event);
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  onEvent(listener: (event: ExecutionEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== listener);
    };
  }

  getEvents(): ExecutionEvent[] {
    return [...this.events];
  }

  async evaluateCondition(expression: string): Promise<boolean> {
    const { evaluateExpression } = await import('./sandbox');
    const safeContext: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.data)) {
      if (typeof value !== 'function') {
        safeContext[key] = value;
      }
    }
    return evaluateExpression(expression, safeContext);
  }

  declareIntent(nodeId: string, paths: string[]): void {
    const normalized = paths.map(p => p.endsWith('/') ? p : p + '/');
    this.intents.set(nodeId, { nodeId, paths: normalized, declaredAt: new Date() });
  }

  checkConflict(paths: string[]): string | null {
    const normalized = paths.map(p => p.endsWith('/') ? p : p + '/');
    for (const [holderId, manifest] of this.intents) {
      for (const held of manifest.paths) {
        for (const requested of normalized) {
          if (held.startsWith(requested) || requested.startsWith(held)) {
            return holderId;
          }
        }
      }
    }
    return null;
  }

  releaseIntent(nodeId: string): void {
    this.intents.delete(nodeId);
  }

  publish(event: ContextEvent): void {
    if (!event.source || !event.type) return;
    this.contextEvents.push(event);
    const typed = this.contextSubscribers.get(event.type);
    if (typed) {
      for (const handler of typed) handler(event);
    }
    const wildcard = this.contextSubscribers.get('*');
    if (wildcard) {
      for (const handler of wildcard) handler(event);
    }
  }

  subscribe(type: string, handler: (event: ContextEvent) => void): () => void {
    let handlers = this.contextSubscribers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.contextSubscribers.set(type, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
      if (handlers!.size === 0) this.contextSubscribers.delete(type);
    };
  }

  getContextEvents(type?: string): ContextEvent[] {
    if (!type) return [...this.contextEvents];
    return this.contextEvents.filter(e => e.type === type);
  }

  restoreContextEvents(events: ContextEvent[]): void {
    this.contextEvents = [...events];
  }

  getOrCreateStreamBuffer(nodeId: string): StreamBuffer {
    let buffer = this.streamBuffers.get(nodeId);
    if (!buffer) {
      buffer = new StreamBuffer();
      this.streamBuffers.set(nodeId, buffer);
    }
    return buffer;
  }

  getStreamBuffer(nodeId: string): StreamBuffer | undefined {
    return this.streamBuffers.get(nodeId);
  }

  serialize(): Record<string, unknown> {
    const safeData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.data)) {
      if (typeof value !== 'function') {
        safeData[key] = value;
      }
    }
    safeData.__contextEvents = this.contextEvents;
    return safeData;
  }

  restoreNodeStates(states: Record<string, NodeRunState>): void {
    this.nodeStates = { ...states };
  }
}
