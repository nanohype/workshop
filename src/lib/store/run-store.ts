import { create } from 'zustand';
import type { NodeRunState, ExecutionEvent } from '@/lib/engine/types';

interface RunStore {
  runId: string | null;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  nodeStates: Record<string, NodeRunState>;
  events: ExecutionEvent[];
  streamOutput: Record<string, string>;
  totalTokens: { input: number; output: number; cost: number };

  startRun: (runId: string) => void;
  setStatus: (status: RunStore['status']) => void;
  updateNodeState: (nodeId: string, state: Partial<NodeRunState>) => void;
  appendStreamOutput: (nodeId: string, chunk: string) => void;
  addEvent: (event: ExecutionEvent) => void;
  setTotalTokens: (tokens: RunStore['totalTokens']) => void;
  reset: () => void;
}

export const useRunStore = create<RunStore>((set) => ({
  runId: null,
  status: 'idle',
  nodeStates: {},
  events: [],
  streamOutput: {},
  totalTokens: { input: 0, output: 0, cost: 0 },

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

  reset: () => set({
    runId: null,
    status: 'idle',
    nodeStates: {},
    events: [],
    streamOutput: {},
    totalTokens: { input: 0, output: 0, cost: 0 },
  }),
}));
