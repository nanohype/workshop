import { create } from 'zustand';
import type { WorkflowNode, WorkflowEdge } from '@/lib/engine/types';

interface Snapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const MAX_HISTORY = 50;

interface WorkflowState {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  workflowId: string | null;
  workflowName: string;
  workflowDescription: string;
  variables: Record<string, string>;
  isDirty: boolean;
  history: Snapshot[];
  future: Snapshot[];

  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  addNode: (node: WorkflowNode) => void;
  updateNode: (id: string, data: Partial<WorkflowNode['data']>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: WorkflowEdge) => void;
  removeEdge: (id: string) => void;
  selectNode: (id: string | null) => void;
  setWorkflowMeta: (id: string, name: string, description: string) => void;
  setVariable: (key: string, value: string) => void;
  removeVariable: (key: string) => void;
  loadWorkflow: (id: string, name: string, description: string, nodes: WorkflowNode[], edges: WorkflowEdge[], variables?: Record<string, string>) => void;
  reset: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setNodeRunFlags: (nodeId: string, flags: { isRunning?: boolean; isCompleted?: boolean; isFailed?: boolean; isWaiting?: boolean }) => void;
  clearAllRunFlags: () => void;
}

function pushHistory(state: WorkflowState): Pick<WorkflowState, 'history' | 'future'> {
  const snapshot: Snapshot = { nodes: state.nodes, edges: state.edges };
  const history = [...state.history, snapshot].slice(-MAX_HISTORY);
  return { history, future: [] };
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  workflowId: null,
  workflowName: 'Untitled Workflow',
  workflowDescription: '',
  variables: {},
  isDirty: false,
  history: [],
  future: [],

  setNodes: (nodes) => set((state) => ({
    ...pushHistory(state),
    nodes,
    isDirty: true,
  })),

  setEdges: (edges) => set((state) => ({
    ...pushHistory(state),
    edges,
    isDirty: true,
  })),

  addNode: (node) => set((state) => ({
    ...pushHistory(state),
    nodes: [...state.nodes, node],
    isDirty: true,
  })),

  updateNode: (id, data) => set((state) => ({
    ...pushHistory(state),
    nodes: state.nodes.map((n) =>
      n.id === id ? { ...n, data: { ...n.data, ...data } } : n
    ),
    isDirty: true,
  })),

  removeNode: (id) => set((state) => ({
    ...pushHistory(state),
    nodes: state.nodes.filter((n) => n.id !== id),
    edges: state.edges.filter((e) => e.source !== id && e.target !== id),
    selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    isDirty: true,
  })),

  addEdge: (edge) => set((state) => ({
    ...pushHistory(state),
    edges: [...state.edges, edge],
    isDirty: true,
  })),

  removeEdge: (id) => set((state) => ({
    ...pushHistory(state),
    edges: state.edges.filter((e) => e.id !== id),
    isDirty: true,
  })),

  selectNode: (id) => set({ selectedNodeId: id }),

  setWorkflowMeta: (id, name, description) => set({
    workflowId: id,
    workflowName: name,
    workflowDescription: description,
  }),

  setVariable: (key, value) => set((state) => ({
    variables: { ...state.variables, [key]: value },
    isDirty: true,
  })),

  removeVariable: (key) => set((state) => {
    const { [key]: _removed, ...rest } = state.variables;
    return { variables: rest, isDirty: true };
  }),

  loadWorkflow: (id, name, description, nodes, edges, variables) => set({
    workflowId: id,
    workflowName: name,
    workflowDescription: description,
    nodes,
    edges,
    variables: variables || {},
    isDirty: false,
    selectedNodeId: null,
    history: [],
    future: [],
  }),

  reset: () => set({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    workflowId: null,
    workflowName: 'Untitled Workflow',
    workflowDescription: '',
    variables: {},
    isDirty: false,
    history: [],
    future: [],
  }),

  undo: () => set((state) => {
    if (state.history.length === 0) return state;
    const history = [...state.history];
    const snapshot = history.pop()!;
    const current: Snapshot = { nodes: state.nodes, edges: state.edges };
    return {
      history,
      future: [...state.future, current],
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      isDirty: true,
    };
  }),

  redo: () => set((state) => {
    if (state.future.length === 0) return state;
    const future = [...state.future];
    const snapshot = future.pop()!;
    const current: Snapshot = { nodes: state.nodes, edges: state.edges };
    return {
      future,
      history: [...state.history, current],
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      isDirty: true,
    };
  }),

  canUndo: () => get().history.length > 0,
  canRedo: () => get().future.length > 0,

  // Run-state flags — transient, no undo history, no isDirty
  setNodeRunFlags: (nodeId, flags) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...flags } } : n
    ),
  })),

  clearAllRunFlags: () => set((state) => ({
    nodes: state.nodes.map((n) => {
      const { isRunning: _r, isCompleted: _c, isFailed: _f, isWaiting: _w, ...rest } = n.data as Record<string, unknown>;
      return { ...n, data: rest as WorkflowNode['data'] };
    }),
  })),
}));
