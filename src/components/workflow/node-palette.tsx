'use client';

import React, { useState } from 'react';
import { Brain, GitBranch, ArrowDownToLine, ArrowUpFromLine, RotateCcw, Network, Wand2, ShieldCheck, Blocks, PanelLeftClose, PanelLeftOpen, GitCommitHorizontal, GitPullRequest, CircleDot, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkflowStore } from '@/lib/store/workflow-store';
import type { WorkflowNode } from '@/lib/engine/types';

const paletteItems = [
  { type: 'agent', label: 'Agent', icon: Brain, description: 'AI agent execution', accentColor: 'border-l-indigo-500', textColor: 'text-indigo-400', borderColor: 'border-indigo-500/20' },
  { type: 'condition', label: 'Condition', icon: GitBranch, description: 'True/false branching', accentColor: 'border-l-amber-500', textColor: 'text-amber-400', borderColor: 'border-amber-500/20' },
  { type: 'router', label: 'Router', icon: Network, description: 'Multi-way branching', accentColor: 'border-l-teal-500', textColor: 'text-teal-400', borderColor: 'border-teal-500/20' },
  { type: 'transform', label: 'Transform', icon: Wand2, description: 'Data shaping', accentColor: 'border-l-violet-500', textColor: 'text-violet-400', borderColor: 'border-violet-500/20' },
  { type: 'gate', label: 'Gate', icon: ShieldCheck, description: 'Manual approval', accentColor: 'border-l-yellow-600', textColor: 'text-yellow-500', borderColor: 'border-yellow-600/20' },
  { type: 'loop', label: 'Loop', icon: RotateCcw, description: 'Repeat until condition', accentColor: 'border-l-pink-500', textColor: 'text-pink-400', borderColor: 'border-pink-500/20' },
  { type: 'input', label: 'Input', icon: ArrowDownToLine, description: 'Workflow input', accentColor: 'border-l-cyan-500', textColor: 'text-cyan-400', borderColor: 'border-cyan-500/20' },
  { type: 'output', label: 'Output', icon: ArrowUpFromLine, description: 'Workflow output', accentColor: 'border-l-emerald-500', textColor: 'text-emerald-500', borderColor: 'border-emerald-500/20' },
  { type: 'scaffold', label: 'Scaffold', icon: Blocks, description: 'nanohype template', accentColor: 'border-l-emerald-500', textColor: 'text-emerald-500', borderColor: 'border-emerald-500/20' },
  { type: 'git-commit', label: 'Git Commit', icon: GitCommitHorizontal, description: 'Stage and commit', accentColor: 'border-l-orange-500', textColor: 'text-orange-400', borderColor: 'border-orange-500/20' },
  { type: 'github-pr', label: 'GitHub PR', icon: GitPullRequest, description: 'Create pull request', accentColor: 'border-l-blue-500', textColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
  { type: 'github-issue', label: 'GitHub Issue', icon: CircleDot, description: 'Create or close issue', accentColor: 'border-l-green-500', textColor: 'text-green-400', borderColor: 'border-green-500/20' },
  { type: 'github-checks', label: 'GitHub Checks', icon: CheckCircle2, description: 'Wait for CI checks', accentColor: 'border-l-sky-500', textColor: 'text-sky-400', borderColor: 'border-sky-500/20' },
  { type: 'validate', label: 'Validate', icon: ClipboardCheck, description: 'Run validation steps', accentColor: 'border-l-rose-500', textColor: 'text-rose-400', borderColor: 'border-rose-500/20' },
];

export function NodePalette() {
  const nodes = useWorkflowStore((s) => s.nodes);
  const [collapsed, setCollapsed] = useState(false);

  const addNode = useWorkflowStore((s) => s.addNode);

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleKeyboardAdd = (nodeType: string, label: string) => {
    addNode({
      id: `${nodeType}-${crypto.randomUUID().slice(0, 8)}`,
      type: nodeType as WorkflowNode['type'],
      position: { x: 250, y: 250 },
      data: { label },
    });
  };

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border bg-card flex flex-col items-center pt-3">
        <button
          onClick={() => setCollapsed(false)}
          className="text-dim hover:text-foreground transition-colors cursor-pointer"
          title="Show node palette"
          aria-label="Expand node palette"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const typeCounts = new Map<string, number>();
  for (const n of nodes) {
    typeCounts.set(n.type, (typeCounts.get(n.type) || 0) + 1);
  }

  return (
    <div className="w-48 border-r border-border bg-card p-2.5 flex flex-col gap-1" role="region" aria-label="Node palette">
      <div className="flex items-center justify-between px-2 mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-dim">
          Nodes
        </h3>
        <button
          onClick={() => setCollapsed(true)}
          className="text-dim hover:text-foreground transition-colors cursor-pointer"
          title="Collapse palette"
          aria-label="Collapse node palette"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>
      {paletteItems.map((node) => {
        const count = typeCounts.get(node.type) || 0;
        return (
          <div
            key={node.type}
            role="listitem"
            tabIndex={0}
            aria-label={`Add ${node.label} node: ${node.description}`}
            draggable
            onDragStart={(e) => onDragStart(e, node.type, node.label)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleKeyboardAdd(node.type, node.label);
              }
            }}
            className={cn(
              'flex items-center gap-2.5 rounded-md border border-l-[3px] bg-card px-2.5 py-2 cursor-grab active:cursor-grabbing transition-colors hover:bg-hover focus:outline-none focus:ring-2 focus:ring-indigo-500',
              node.accentColor,
              node.borderColor
            )}
          >
            <node.icon className={cn('w-4 h-4 shrink-0', node.textColor)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{node.label}</p>
              <p className="text-xs text-dim truncate">{node.description}</p>
            </div>
            {count > 0 && (
              <span className="text-[10px] font-medium bg-input text-muted-foreground rounded-md w-5 h-5 flex items-center justify-center shrink-0">
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
