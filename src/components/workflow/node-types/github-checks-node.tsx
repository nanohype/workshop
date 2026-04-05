'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GithubChecksNodeData {
  label: string;
  prNumberSource?: string;
  pollInterval?: number;
  checksTimeout?: number;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function GithubChecksNode({ data, selected }: NodeProps & { data: GithubChecksNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-all',
        selected && 'node-glow-sky',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full rounded-t-md bg-sky-500" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/15">
            <CheckCircle2 className="w-3 h-3 text-sky-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'GitHub Checks'}</p>
        </div>
        {data.prNumberSource && (
          <p className="text-[11px] text-dim mt-0.5 font-mono">from: {data.prNumberSource}</p>
        )}
        {data.pollInterval && data.pollInterval !== 30 && (
          <p className="text-[10px] text-dim mt-0.5">Poll: {data.pollInterval}s</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(GithubChecksNode);
