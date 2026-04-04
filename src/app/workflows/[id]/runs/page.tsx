'use client';

import React, { useEffect, useState, use } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Zap, ArrowLeft, Loader2, FolderOpen, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatDate, formatTokens, formatCost } from '@/lib/utils';

interface RunItem {
  id: string;
  workflowId: string;
  status: string;
  tokenUsage: { input: number; output: number; cost: number };
  startedAt: string;
  completedAt: string | null;
}

const statusVariant: Record<string, 'success' | 'destructive' | 'warning' | 'default'> = {
  completed: 'success',
  failed: 'destructive',
  running: 'warning',
  pending: 'default',
  cancelled: 'destructive',
};

export default function RunHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: workflowId } = use(params);
  const router = useRouter();
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchRuns() {
      try {
        const res = await fetch(`/api/runs?workflowId=${workflowId}`);
        if (res.ok) {
          setRuns(await res.json());
        }
      } catch {
        // silently handle
      } finally {
        setIsLoading(false);
      }
    }
    fetchRuns();
  }, [workflowId]);

  const getDuration = (run: RunItem): string => {
    if (!run.completedAt || !run.startedAt) return '-';
    const ms = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/workflows/${workflowId}`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">Run History</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {isLoading ? 'Loading...' : `${runs.length} run${runs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="h-10 w-10 text-dim mb-3" />
          <h3 className="text-[15px] font-semibold text-foreground mb-1">No runs yet</h3>
          <p className="text-sm text-muted-foreground">Execute this workflow to see run history here.</p>
        </div>
      )}

      {!isLoading && runs.length > 0 && (
        <>
        <div className="flex items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dim" />
            <Input
              placeholder="Search by run ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-xs"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {['all', 'completed', 'failed', 'running', 'cancelled'].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs capitalize"
              onClick={() => setStatusFilter(s)}
            >
              {s}
              {s !== 'all' && (
                <span className="ml-1 text-dim">{runs.filter(r => r.status === s).length}</span>
              )}
            </Button>
          ))}
        </div>
        <div className="space-y-3">
          {runs.filter(r => (statusFilter === 'all' || r.status === statusFilter) && (!searchQuery || r.id.includes(searchQuery))).length === 0 && (
            <p className="text-sm text-dim text-center py-8">No matching runs</p>
          )}
          {runs.filter(r => (statusFilter === 'all' || r.status === statusFilter) && (!searchQuery || r.id.includes(searchQuery))).map((run) => {
            const tokens = run.tokenUsage || { input: 0, output: 0, cost: 0 };
            const totalTokensCount = (tokens.input || 0) + (tokens.output || 0);
            return (
              <Card
                key={run.id}
                className="cursor-pointer hover:border-input-border transition-colors"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  router.push(`/workflows/${workflowId}/runs/${run.id}`);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Badge variant={statusVariant[run.status] || 'default'}>{run.status}</Badge>
                      <span className="font-mono text-muted-foreground text-xs">{run.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        <span>{formatTokens(totalTokensCount)} tokens</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{getDuration(run)}</span>
                      </div>
                      <span className="text-emerald-400 font-mono">{formatCost(tokens.cost || 0)}</span>
                      <span className="text-dim">{formatDate(run.startedAt)}</span>
                      <Link href={`/workflows/${workflowId}/runs/${run.id}`}>
                        <Button variant="ghost" size="sm">View</Button>
                      </Link>
                      {run.status !== 'running' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-dim hover:text-rose-400"
                          onClick={async () => {
                            if (!confirm('Delete this run?')) return;
                            const res = await fetch(`/api/runs/${run.id}`, { method: 'DELETE' });
                            if (res.ok) setRuns(prev => prev.filter(r => r.id !== run.id));
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
