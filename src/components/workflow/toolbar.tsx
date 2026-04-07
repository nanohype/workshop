'use client';

import React, { useRef, useState } from 'react';
import { Save, Play, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Download, Upload, FileText, Variable, Plus, X, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useReactFlow } from '@xyflow/react';
import { useWorkflowStore } from '@/lib/store/workflow-store';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

const shortcuts = [
  { keys: 'Ctrl/Cmd + S', action: 'Save workflow' },
  { keys: 'Ctrl/Cmd + Enter', action: 'Run workflow' },
  { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
  { keys: 'Ctrl/Cmd + Shift + Z', action: 'Redo' },
  { keys: 'Ctrl/Cmd + C', action: 'Copy selected node' },
  { keys: 'Ctrl/Cmd + V', action: 'Paste node' },
  { keys: 'Ctrl/Cmd + D', action: 'Duplicate selected node' },
  { keys: 'Ctrl/Cmd + A', action: 'Select all nodes and edges' },
  { keys: 'Delete / Backspace', action: 'Delete selected node or edge' },
];

interface ToolbarProps {
  onSave: () => void;
  onRun: () => void;
  isSaving?: boolean;
}

export function Toolbar({ onSave, onRun, isSaving }: ToolbarProps) {
  const { workflowName, setWorkflowMeta, workflowId, workflowDescription, isDirty, nodes, edges, variables, setVariable, removeVariable, loadWorkflow, undo, redo, canUndo, canRedo } = useWorkflowStore();
  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const data = {
      name: workflowName,
      description: workflowDescription,
      nodes,
      edges,
      variables,
      exportedAt: new Date().toISOString(),
      version: 1,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Workflow exported' });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.nodes || !Array.isArray(data.nodes)) {
          toast({ title: 'Invalid workflow file', variant: 'destructive' });
          return;
        }
        loadWorkflow(
          workflowId || 'imported',
          data.name || 'Imported Workflow',
          data.description || '',
          data.nodes,
          data.edges || [],
          data.variables || {}
        );
        toast({ title: 'Workflow imported' });
      } catch {
        toast({ title: 'Failed to parse workflow file', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = '';
  };

  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2" role="toolbar" aria-label="Workflow toolbar">
      <div className="flex items-center gap-3">
        <Input
          value={workflowName}
          onChange={(e) => setWorkflowMeta(workflowId || '', e.target.value, workflowDescription)}
          className="h-7 w-52 bg-transparent border-none text-sm font-semibold text-foreground focus-visible:ring-0 px-0"
          placeholder="Workflow name"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-dim hover:text-foreground" title="Edit description">
              <FileText className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Description</p>
              <Textarea
                value={workflowDescription}
                onChange={(e) => setWorkflowMeta(workflowId || '', workflowName, e.target.value)}
                placeholder="Describe what this workflow does..."
                rows={3}
                className="text-sm"
              />
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-dim hover:text-foreground" title="Workflow variables">
              <Variable className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Variables</p>
              <p className="text-xs text-dim">Variables are passed to the execution context and can be referenced in prompts.</p>
              {Object.entries(variables).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <Input value={key} disabled className="h-7 text-xs flex-1 font-mono" />
                  <Input
                    value={value}
                    onChange={(e) => setVariable(key, e.target.value)}
                    className="h-7 text-xs flex-1"
                    placeholder="Value"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeVariable(key)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newVarKey}
                  onChange={(e) => setNewVarKey(e.target.value)}
                  className="h-7 text-xs flex-1 font-mono"
                  placeholder="Key"
                />
                <Input
                  value={newVarValue}
                  onChange={(e) => setNewVarValue(e.target.value)}
                  className="h-7 text-xs flex-1"
                  placeholder="Value"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={!newVarKey.trim()}
                  onClick={() => {
                    if (newVarKey.trim()) {
                      setVariable(newVarKey.trim(), newVarValue);
                      setNewVarKey('');
                      setNewVarValue('');
                    }
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {isDirty ? (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">Unsaved</Badge>
        ) : workflowId && /^[0-9a-f]{8}-/.test(workflowId) ? (
          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">Saved</Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-dim">New</Badge>
        )}
        <span className="text-xs text-dim">{nodes.length} nodes</span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo()} title="Undo (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo()} title="Redo (Ctrl+Shift+Z)">
          <Redo2 className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()} title="Zoom in">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()} title="Zoom out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fitView()} title="Fit to view">
          <Maximize2 className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExport} title="Export workflow">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} title="Import workflow">
          <Upload className="h-4 w-4" />
        </Button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" aria-hidden="true" />
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Keyboard shortcuts">
              <Keyboard className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Keyboard Shortcuts</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 mt-2">
              {shortcuts.map((s) => (
                <div key={s.keys} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.action}</span>
                  <kbd className="rounded bg-input px-2 py-0.5 text-xs font-mono text-foreground">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button
          variant="secondary"
          size="sm"
          onClick={onSave}
          disabled={isSaving || !isDirty}
          className="gap-1.5"
          title="Save (Ctrl+S)"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
        <Button
          size="sm"
          onClick={onRun}
          disabled={nodes.length === 0}
          className="gap-1.5"
          title="Run (Ctrl+Enter)"
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </Button>
      </div>
    </div>
  );
}
