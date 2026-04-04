'use client';

import React, { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Toolbar } from '@/components/workflow/toolbar';
import { useWorkflowStore } from '@/lib/store/workflow-store';
import { toast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { Graph } from '@/lib/engine/graph';
import { ReactFlowProvider } from '@xyflow/react';

// Lazy load heavy components (React Flow is large)
const GraphCanvas = dynamic(
  () => import('@/components/workflow/graph-canvas').then(m => ({ default: m.GraphCanvas })),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-dim" /></div> }
);
const NodePalette = dynamic(
  () => import('@/components/workflow/node-palette').then(m => ({ default: m.NodePalette })),
  { ssr: false }
);
const ConfigPanel = dynamic(
  () => import('@/components/workflow/config-panel').then(m => ({ default: m.ConfigPanel })),
  { ssr: false }
);

export default function WorkflowBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { selectedNodeId, workflowId, nodes, edges, variables, workflowName, workflowDescription, loadWorkflow, setWorkflowMeta, isDirty, undo, redo } = useWorkflowStore();

  // Load workflow from API on mount
  useEffect(() => {
    // If it's a template ID (non-UUID), start with a blank workflow
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUUID) {
      loadWorkflow(id, id === 'blank' ? 'Untitled Workflow' : id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), '', [], []);
      setIsLoading(false);
      return;
    }

    async function fetchWorkflow() {
      try {
        const res = await fetch(`/api/workflows/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setLoadError('Workflow not found');
          } else {
            setLoadError('Failed to load workflow');
          }
          return;
        }
        const workflow = await res.json();
        const graphData = workflow.graphData || { nodes: [], edges: [] };
        loadWorkflow(
          workflow.id,
          workflow.name,
          workflow.description || '',
          graphData.nodes || [],
          graphData.edges || [],
          (workflow.variables as Record<string, string>) || {}
        );
      } catch {
        setLoadError('Failed to load workflow');
      } finally {
        setIsLoading(false);
      }
    }

    fetchWorkflow();
  }, [id, loadWorkflow]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const graphData = { nodes, edges };
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflowId || '');

      let res: Response;
      if (isUUID && workflowId) {
        // Update existing
        res = await fetch(`/api/workflows/${workflowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workflowName, description: workflowDescription, graphData, variables }),
        });
      } else {
        // Create new
        res = await fetch('/api/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: workflowName, description: workflowDescription, graphData, variables }),
        });
      }

      if (!res.ok) throw new Error('Save failed');

      const saved = await res.json();
      setWorkflowMeta(saved.id, saved.name, saved.description || '');

      // Navigate to the real ID if we just created
      if (!isUUID || workflowId !== saved.id) {
        router.replace(`/workflows/${saved.id}`);
      }

      toast({ title: 'Workflow saved' });
    } catch {
      toast({ title: 'Failed to save workflow', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRun = async () => {
    // Validate graph before running
    const currentState = useWorkflowStore.getState();
    const graph = new Graph(currentState.nodes, currentState.edges);
    const validation = graph.validate();
    if (!validation.valid) {
      toast({
        title: 'Workflow has errors',
        description: validation.errors.slice(0, 3).join('. '),
        variant: 'destructive',
      });
      return;
    }

    // Save first if dirty
    if (isDirty) {
      await handleSave();
    }

    const currentId = useWorkflowStore.getState().workflowId;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentId || '');
    if (!isUUID || !currentId) {
      toast({ title: 'Save the workflow first before running', variant: 'destructive' });
      return;
    }

    try {
      const res = await fetch(`/api/workflows/${currentId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || body.details?.join('. ') || 'Failed to start run';
        throw new Error(msg);
      }

      const { runId } = await res.json();
      toast({ title: 'Workflow run started' });
      router.push(`/workflows/${currentId}/runs/${runId}`);
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Failed to start run', variant: 'destructive' });
    }
  };

  // Keyboard shortcuts
  const handleSaveRef = useRef(handleSave);
  const handleRunRef = useRef(handleRun);
  handleSaveRef.current = handleSave;
  handleRunRef.current = handleRun;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
      if (isMod && e.key === 'Enter') {
        e.preventDefault();
        handleRunRef.current();
      }
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Auto-save after 30s of inactivity when dirty
  useEffect(() => {
    if (!isDirty) return;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflowId || '');
    if (!isUUID) return; // Don't auto-save new workflows

    const timer = setTimeout(() => {
      handleSaveRef.current();
    }, 30_000);
    return () => clearTimeout(timer);
  }, [isDirty, workflowId, nodes, edges, variables]);

  // Warn on unsaved changes before leaving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)] -m-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)] -m-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-[15px] font-semibold text-foreground">Error</p>
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => router.push('/workflows')} className="text-sm text-accent hover:underline cursor-pointer">
            Back to workflows
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="flex flex-col h-[calc(100vh-7rem)] -m-6">
        <Toolbar onSave={handleSave} onRun={handleRun} isSaving={isSaving} />
        <div className="flex flex-1 overflow-hidden">
          <NodePalette />
          <GraphCanvas />
          {selectedNodeId && <ConfigPanel />}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
