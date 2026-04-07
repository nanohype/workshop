'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoopNodeData {
  label: string;
  condition?: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  [key: string]: unknown;
}

function LoopNode({ data, selected }: NodeProps & { data: LoopNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-shadow',
        selected && 'node-glow-pink',
        data.isCompleted && 'border-emerald-500/50'
      )}
    >
      <div className="h-[2px] w-full bg-pink-500 rounded-t-md" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-pink-500/15">
            <RotateCcw className="w-3 h-3 text-pink-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{data.label || 'Loop'}</p>
            <p className="text-[11px] text-dim">
              {data.condition ? `until: ${data.condition.slice(0, 20)}` : 'Repeat until condition'}
            </p>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(LoopNode);
