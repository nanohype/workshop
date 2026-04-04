'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GateNodeData {
  label: string;
  gateMessage?: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  isWaiting?: boolean;
  [key: string]: unknown;
}

function GateNode({ data, selected }: NodeProps & { data: GateNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-all',
        selected && 'node-glow-amber',
        data.isWaiting && 'border-amber-500/50 animate-pulse',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full rounded-t-md bg-amber-500" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15">
            <ShieldCheck className="w-3 h-3 text-amber-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Gate'}</p>
        </div>
        {data.gateMessage && (
          <p className="text-[11px] text-dim mt-0.5 line-clamp-2">{data.gateMessage}</p>
        )}
        {data.isWaiting && (
          <span className="inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
            Awaiting approval
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(GateNode);
