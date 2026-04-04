'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, GitBranch, Clock, MoreVertical, Play, Pencil, Trash2, Loader2, FolderOpen, Copy, ArrowUpDown,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/utils';

interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  graphData: { nodes: unknown[]; edges: unknown[] };
  createdAt: string;
  updatedAt: string;
}

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'nodes'>('updated');
  const [deleteTarget, setDeleteTarget] = useState<WorkflowItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [lastRunStatus, setLastRunStatus] = useState<Record<string, string>>({});

  const fetchWorkflows = useCallback(async () => {
    try {
      const [wRes, rRes] = await Promise.all([
        fetch('/api/workflows'),
        fetch('/api/runs'),
      ]);
      if (wRes.ok) {
        const data = await wRes.json();
        setWorkflows(data);
      }
      if (rRes.ok) {
        const runs: { workflowId: string; status: string; startedAt: string }[] = await rRes.json();
        // Get most recent run per workflow
        const statusMap: Record<string, string> = {};
        for (const run of runs) {
          if (!statusMap[run.workflowId]) {
            statusMap[run.workflowId] = run.status;
          }
        }
        setLastRunStatus(statusMap);
      }
    } catch {
      toast({ title: 'Failed to load workflows', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workflows/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        setWorkflows((prev) => prev.filter((w) => w.id !== deleteTarget.id));
        toast({ title: `Deleted "${deleteTarget.name}"` });
      } else {
        throw new Error();
      }
    } catch {
      toast({ title: 'Failed to delete workflow', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleDuplicate = async (workflow: WorkflowItem) => {
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${workflow.name} (Copy)`,
          description: workflow.description,
          graphData: workflow.graphData,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setWorkflows((prev) => [created, ...prev]);
        toast({ title: `Duplicated "${workflow.name}"` });
      } else {
        throw new Error();
      }
    } catch {
      toast({ title: 'Failed to duplicate workflow', variant: 'destructive' });
    }
  };

  const filtered = workflows
    .filter(
      (w) =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        (w.description || '').toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'nodes': return (b.graphData?.nodes?.length || 0) - (a.graphData?.nodes?.length || 0);
        default: return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

  const getNodeCount = (w: WorkflowItem) => {
    try {
      return (w.graphData?.nodes || []).length;
    } catch {
      return 0;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Workflows</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {isLoading ? 'Loading...' : `${workflows.length} workflow${workflows.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Link href="/workflows/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Workflow
          </Button>
        </Link>
      </div>

      {/* Search & Sort */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
          <Input
            placeholder="Search workflows..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSortBy('updated')} className={sortBy === 'updated' ? 'bg-input' : ''}>
              Last updated
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name')} className={sortBy === 'name' ? 'bg-input' : ''}>
              Name (A-Z)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('nodes')} className={sortBy === 'nodes' ? 'bg-input' : ''}>
              Most nodes
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && workflows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-input flex items-center justify-center mb-4">
            <FolderOpen className="h-8 w-8 text-dim" />
          </div>
          <h3 className="text-[15px] font-semibold text-foreground mb-1">No workflows yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md">
            Create your first agent workflow to get started with orchestration.
          </p>
          <Link href="/workflows/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Workflow
            </Button>
          </Link>
        </div>
      )}

      {/* No results state */}
      {!isLoading && workflows.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">No workflows match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((workflow) => (
            <Card
              key={workflow.id}
              className="group hover:border-input-border transition-colors cursor-pointer"
              onClick={(e) => {
                // Don't navigate if clicking inside a dropdown or button
                if ((e.target as HTMLElement).closest('[role="menu"], button')) return;
                router.push(`/workflows/${workflow.id}`);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-md bg-accent/5 flex items-center justify-center text-accent">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <div>
                      <Link
                        href={`/workflows/${workflow.id}`}
                        className="text-sm font-semibold text-foreground hover:text-white/90 transition-colors"
                      >
                        {workflow.name}
                      </Link>
                      <p className="text-xs text-dim">{getNodeCount(workflow)} nodes</p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/workflows/${workflow.id}`)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(workflow)}>
                        <Copy className="h-4 w-4 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push(`/workflows/${workflow.id}/runs`)}>
                        <Play className="h-4 w-4 mr-2" /> View Runs
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-400"
                        onClick={() => setDeleteTarget(workflow)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {workflow.description || 'No description'}
                </p>
                <div className="flex items-center justify-between text-xs text-dim">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Updated {formatDate(workflow.updatedAt)}</span>
                  </div>
                  {lastRunStatus[workflow.id] && (
                    <span className={`flex items-center gap-1 ${
                      lastRunStatus[workflow.id] === 'completed' ? 'text-emerald-400' :
                      lastRunStatus[workflow.id] === 'failed' ? 'text-rose-400' :
                      lastRunStatus[workflow.id] === 'running' ? 'text-cyan-400' :
                      'text-dim'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        lastRunStatus[workflow.id] === 'completed' ? 'bg-emerald-400' :
                        lastRunStatus[workflow.id] === 'failed' ? 'bg-rose-400' :
                        lastRunStatus[workflow.id] === 'running' ? 'bg-cyan-400 animate-pulse' :
                        'bg-dim'
                      }`} />
                      {lastRunStatus[workflow.id]}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This action cannot be undone.
              All associated runs will also be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
