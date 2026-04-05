import type { NodeRunState, ExecutionEvent, IntentManifest } from './types';

export class RunContext {
  private data: Record<string, unknown> = {};
  private nodeStates: Record<string, NodeRunState> = {};
  private events: ExecutionEvent[] = [];
  private eventListeners: ((event: ExecutionEvent) => void)[] = [];
  private intents = new Map<string, IntentManifest>();

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

  serialize(): Record<string, unknown> {
    const safeData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this.data)) {
      if (typeof value !== 'function') {
        safeData[key] = value;
      }
    }
    return safeData;
  }

  restoreNodeStates(states: Record<string, NodeRunState>): void {
    this.nodeStates = { ...states };
  }
}
