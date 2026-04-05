'use client';

import React, { useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import AgentNode from './node-types/agent-node';
import ConditionNode from './node-types/condition-node';
import InputNode from './node-types/input-node';
import OutputNode from './node-types/output-node';
import LoopNode from './node-types/loop-node';
import RouterNode from './node-types/router-node';
import TransformNode from './node-types/transform-node';
import GateNode from './node-types/gate-node';
import ScaffoldNode from './node-types/scaffold-node';
import GitCommitNode from './node-types/git-commit-node';
import GithubPrNode from './node-types/github-pr-node';
import GithubIssueNode from './node-types/github-issue-node';
import GithubChecksNode from './node-types/github-checks-node';
import ValidateNode from './node-types/validate-node';
import ConditionalEdge from './edge-types/conditional-edge';
import { useWorkflowStore } from '@/lib/store/workflow-store';
import type { WorkflowNode } from '@/lib/engine/types';

// Clipboard for copy/paste (module-level to survive re-renders)
let clipboard: { type: string; data: Record<string, unknown> } | null = null;

const nodeTypes = {
  agent: AgentNode,
  condition: ConditionNode,
  input: InputNode,
  output: OutputNode,
  loop: LoopNode,
  router: RouterNode,
  transform: TransformNode,
  gate: GateNode,
  scaffold: ScaffoldNode,
  'git-commit': GitCommitNode,
  'github-pr': GithubPrNode,
  'github-issue': GithubIssueNode,
  'github-checks': GithubChecksNode,
  validate: ValidateNode,
};

const edgeTypes = {
  conditional: ConditionalEdge,
};

function toFlowNodes(storeNodes: WorkflowNode[]): Node[] {
  return storeNodes.map((n) => ({
    id: n.id,
    type: n.type as string,
    position: n.position,
    data: n.data,
    selected: false,
  }));
}

function toFlowEdges(storeEdges: { id: string; source: string; target: string; label?: string; condition?: string }[]): Edge[] {
  return storeEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: e.condition ? 'conditional' : 'default',
    data: { label: e.label, condition: e.condition },
  }));
}

interface GraphCanvasProps {
  onNodeSelect?: (nodeId: string | null) => void;
}

function GraphCanvasInner({ onNodeSelect }: GraphCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const store = useWorkflowStore();
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(toFlowNodes(store.nodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toFlowEdges(store.edges));

  // Sync store → React Flow when store changes (e.g. config panel updates node data)
  const storeNodesRef = useRef(store.nodes);
  const storeEdgesRef = useRef(store.edges);
  const isSyncingFromFlow = useRef(false);

  useEffect(() => {
    if (isSyncingFromFlow.current) return;
    if (storeNodesRef.current !== store.nodes) {
      storeNodesRef.current = store.nodes;
      setNodes(toFlowNodes(store.nodes));
    }
  }, [store.nodes, setNodes]);

  useEffect(() => {
    if (isSyncingFromFlow.current) return;
    if (storeEdgesRef.current !== store.edges) {
      storeEdgesRef.current = store.edges;
      setEdges(toFlowEdges(store.edges));
    }
  }, [store.edges, setEdges]);

  // Connection validation: prevent invalid edges
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (!connection.source || !connection.target) return false;
      // No self-loops
      if (connection.source === connection.target) return false;
      // Input nodes have no incoming edges
      const targetNode = store.nodes.find(n => n.id === connection.target);
      if (targetNode?.type === 'input') return false;
      // Output nodes have no outgoing edges
      const sourceNode = store.nodes.find(n => n.id === connection.source);
      if (sourceNode?.type === 'output') return false;
      // No duplicate edges
      const duplicate = store.edges.some(
        e => e.source === connection.source && e.target === connection.target
      );
      if (duplicate) return false;
      return true;
    },
    [store.nodes, store.edges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      // Auto-label edges from condition and router nodes
      const sourceNode = store.nodes.find(n => n.id === params.source);
      const existingEdgesFromSource = store.edges.filter(e => e.source === params.source);
      let label: string | undefined;
      let sourceHandle: string | undefined;

      if (sourceNode?.type === 'condition') {
        label = existingEdgesFromSource.length === 0 ? 'true' : 'false';
      } else if (sourceNode?.type === 'router' && params.sourceHandle) {
        label = params.sourceHandle;
        sourceHandle = params.sourceHandle;
      }

      const edgeId = `e-${params.source}-${params.target}-${Date.now()}`;
      const rfEdge: Edge = {
        id: edgeId,
        source: params.source,
        target: params.target,
        sourceHandle: sourceHandle,
        type: label ? 'conditional' : 'default',
        label,
        data: { label },
      };
      setEdges((eds) => addEdge(rfEdge, eds));

      isSyncingFromFlow.current = true;
      store.addEdge({
        id: edgeId,
        source: params.source,
        target: params.target,
        label,
      });
      storeEdgesRef.current = store.edges;
      isSyncingFromFlow.current = false;
    },
    [setEdges, store]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      store.selectNode(node.id);
      onNodeSelect?.(node.id);
    },
    [store, onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    store.selectNode(null);
    onNodeSelect?.(null);
  }, [store, onNodeSelect]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type');
      const label = event.dataTransfer.getData('application/reactflow-label');
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = `${type}-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type,
        position,
        data: { label: label || type },
      };

      setNodes((nds) => [...nds, newNode]);
      isSyncingFromFlow.current = true;
      store.addNode({
        id: newNodeId,
        type: type as WorkflowNode['type'],
        position,
        data: { label: label || type },
      });
      storeNodesRef.current = store.nodes;
      isSyncingFromFlow.current = false;
    },
    [screenToFlowPosition, setNodes, store]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Sync React Flow → store on node changes (position drag, delete)
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);

      // Handle removals
      const removals = changes.filter((c) => c.type === 'remove');
      if (removals.length > 0) {
        isSyncingFromFlow.current = true;
        for (const change of removals) {
          if (change.type === 'remove') {
            store.removeNode(change.id);
          }
        }
        storeNodesRef.current = store.nodes;
        storeEdgesRef.current = store.edges;
        isSyncingFromFlow.current = false;
      }

      // Handle position changes (debounced via dragend)
      const positionChanges = changes.filter((c) => c.type === 'position' && c.dragging === false && c.position);
      if (positionChanges.length > 0) {
        setNodes((currentNodes) => {
          const workflowNodes = currentNodes.map((n) => ({
            id: n.id,
            type: (n.type || 'agent') as WorkflowNode['type'],
            position: n.position,
            data: n.data as WorkflowNode['data'],
          }));
          // Defer store sync to avoid setState-during-render warning
          queueMicrotask(() => {
            isSyncingFromFlow.current = true;
            store.setNodes(workflowNodes);
            storeNodesRef.current = store.nodes;
            isSyncingFromFlow.current = false;
          });
          return currentNodes;
        });
      }
    },
    [onNodesChange, setNodes, store]
  );

  // Sync React Flow → store on edge changes (delete)
  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes);

      const removals = changes.filter((c) => c.type === 'remove');
      if (removals.length > 0) {
        isSyncingFromFlow.current = true;
        for (const change of removals) {
          if (change.type === 'remove') {
            store.removeEdge(change.id);
          }
        }
        storeEdgesRef.current = store.edges;
        isSyncingFromFlow.current = false;
      }
    },
    [onEdgesChange, store]
  );

  // Copy/paste selected node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        store.selectNode(null);
        setNodes(nds => nds.map(n => ({ ...n, selected: false })));
        setEdges(eds => eds.map(ed => ({ ...ed, selected: false })));
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === 'c' && store.selectedNodeId) {
        const node = store.nodes.find(n => n.id === store.selectedNodeId);
        if (node) {
          clipboard = { type: node.type, data: { ...node.data } };
        }
      }

      if (e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setEdges(eds => eds.map(e => ({ ...e, selected: true })));
      }

      if (e.key === 'd' && store.selectedNodeId) {
        e.preventDefault();
        const node = store.nodes.find(n => n.id === store.selectedNodeId);
        if (node) {
          const newId = `${node.type}-${Date.now()}`;
          const position = { x: node.position.x + 50, y: node.position.y + 50 };
          const newNode: Node = {
            id: newId,
            type: node.type,
            position,
            data: { ...node.data, label: `${node.data.label || node.type} (copy)` },
          };
          setNodes(nds => [...nds, newNode]);
          isSyncingFromFlow.current = true;
          store.addNode({
            id: newId,
            type: node.type as WorkflowNode['type'],
            position,
            data: { ...node.data, label: `${node.data.label || node.type} (copy)` } as WorkflowNode['data'],
          });
          storeNodesRef.current = store.nodes;
          isSyncingFromFlow.current = false;
          store.selectNode(newId);
        }
      }

      if (e.key === 'v' && clipboard) {
        e.preventDefault();
        const newId = `${clipboard.type}-${Date.now()}`;
        // Offset position so pasted node is visible
        const selectedNode = nodes.find(n => n.id === store.selectedNodeId);
        const position = selectedNode
          ? { x: selectedNode.position.x + 50, y: selectedNode.position.y + 50 }
          : { x: 250, y: 250 };

        const newNode: Node = {
          id: newId,
          type: clipboard.type,
          position,
          data: { ...clipboard.data, label: `${clipboard.data.label || clipboard.type} (copy)` },
        };

        setNodes(nds => [...nds, newNode]);
        isSyncingFromFlow.current = true;
        store.addNode({
          id: newId,
          type: clipboard.type as WorkflowNode['type'],
          position,
          data: { ...clipboard.data, label: `${clipboard.data.label || clipboard.type} (copy)` } as WorkflowNode['data'],
        });
        storeNodesRef.current = store.nodes;
        isSyncingFromFlow.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, nodes, setNodes, setEdges]);

  return (
    <div ref={reactFlowWrapper} className="flex-1 h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        fitView
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={['Backspace', 'Delete']}
        className="bg-background"
        defaultEdgeOptions={{
          style: { stroke: 'var(--handle)', strokeWidth: 2 },
          type: 'default',
        }}
      >
        <Controls className="!bg-card !border-border !rounded-lg" />
        <MiniMap
          className="!bg-card !border-border !rounded-lg"
          nodeColor={(node) => {
            switch (node.type) {
              case 'agent': return '#6366f1';
              case 'condition': return '#f59e0b';
              case 'input': return '#06b6d4';
              case 'output': return '#5B8DEF';
              case 'loop': return '#ec4899';
              case 'router': return '#14b8a6';
              case 'transform': return '#8b5cf6';
              case 'gate': return '#f59e0b';
              case 'scaffold': return '#10b981';
              case 'git-commit': return '#f97316';
              case 'github-pr': return '#3b82f6';
              case 'github-issue': return '#22c55e';
              case 'github-checks': return '#0ea5e9';
              case 'validate': return '#f43f5e';
              default: return '#1E293B';
            }
          }}
          maskColor="color-mix(in srgb, var(--background) 70%, transparent)"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--dot-grid)" />
      </ReactFlow>
    </div>
  );
}

export { ReactFlowProvider };

export function GraphCanvas(props: GraphCanvasProps) {
  return <GraphCanvasInner {...props} />;
}
