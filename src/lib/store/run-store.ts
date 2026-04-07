import { create } from 'zustand';
import type { NodeRunState, ExecutionEvent } from '@/lib/engine/types';
import { useWorkflowStore } from './workflow-store';

interface RunStore {
  runId: string | null;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  nodeStates: Record<string, NodeRunState>;
  events: ExecutionEvent[];
  streamOutput: Record<string, string>;
  totalTokens: { input: number; output: number; cost: number };
  eventSource: EventSource | null;

  startRun: (runId: string) => void;
  setStatus: (status: RunStore['status']) => void;
  updateNodeState: (nodeId: string, state: Partial<NodeRunState>) => void;
  appendStreamOutput: (nodeId: string, chunk: string) => void;
  addEvent: (event: ExecutionEvent) => void;
  setTotalTokens: (tokens: RunStore['totalTokens']) => void;
  connectToRun: (runId: string) => void;
  disconnectFromRun: () => void;
  reset: () => void;
}

export const useRunStore = create<RunStore>((set, get) => ({
  runId: null,
  status: 'idle',
  nodeStates: {},
  events: [],
  streamOutput: {},
  totalTokens: { input: 0, output: 0, cost: 0 },
  eventSource: null,

  startRun: (runId) => set({
    runId,
    status: 'running',
    nodeStates: {},
    events: [],
    streamOutput: {},
    totalTokens: { input: 0, output: 0, cost: 0 },
  }),

  setStatus: (status) => set({ status }),

  updateNodeState: (nodeId, state) => set((s) => ({
    nodeStates: {
      ...s.nodeStates,
      [nodeId]: { ...s.nodeStates[nodeId], ...state } as NodeRunState,
    },
  })),

  appendStreamOutput: (nodeId, chunk) => set((s) => ({
    streamOutput: {
      ...s.streamOutput,
      [nodeId]: (s.streamOutput[nodeId] || '') + chunk,
    },
  })),

  addEvent: (event) => set((s) => ({
    events: [...s.events, event],
  })),

  setTotalTokens: (tokens) => set({ totalTokens: tokens }),

  connectToRun: (runId) => {
    // Clean up any existing connection
    get().disconnectFromRun();

    const es = new EventSource(`/api/runs/${runId}/stream`);

    es.addEventListener('state', (e) => {
      try {
        const data = JSON.parse(e.data) as {
          status: string;
          nodeStates: Record<string, { status: string }>;
          tokenUsage?: { input: number; output: number; cost: number };
        };

        // Update run store
        set({
          status: data.status as RunStore['status'],
          nodeStates: data.nodeStates as Record<string, NodeRunState>,
          totalTokens: data.tokenUsage || get().totalTokens,
        });

        // Bridge to workflow store node flags
        const wf = useWorkflowStore.getState();
        for (const [nodeId, state] of Object.entries(data.nodeStates)) {
          const s = state.status;
          wf.setNodeRunFlags(nodeId, {
            isRunning: s === 'running',
            isCompleted: s === 'completed',
            isFailed: s === 'failed',
            isWaiting: s === 'waiting',
          });
        }
      } catch { /* malformed event */ }
    });

    es.addEventListener('done', () => {
      es.close();
      set({ eventSource: null });
    });

    es.addEventListener('error', () => {
      // EventSource will auto-reconnect via retry directive
    });

    set({ runId, status: 'running', eventSource: es });
  },

  disconnectFromRun: () => {
    const es = get().eventSource;
    if (es) {
      es.close();
    }
    useWorkflowStore.getState().clearAllRunFlags();
    set({ eventSource: null });
  },

  reset: () => {
    get().disconnectFromRun();
    set({
      runId: null,
      status: 'idle',
      nodeStates: {},
      events: [],
      streamOutput: {},
      totalTokens: { input: 0, output: 0, cost: 0 },
      eventSource: null,
    });
  },
}));
