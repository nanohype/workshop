'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TransformNodeData {
  label: string;
  template?: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function TransformNode({ data, selected }: NodeProps & { data: TransformNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-shadow',
        selected && 'node-glow-violet',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full rounded-t-md bg-violet-500" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-violet-500/15">
            <Wand2 className="w-3 h-3 text-violet-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Transform'}</p>
        </div>
        {data.template && (
          <p className="text-[11px] text-dim mt-0.5 line-clamp-2 font-mono">{data.template}</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(TransformNode);
