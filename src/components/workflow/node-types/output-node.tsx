'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowUpFromLine } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OutputNodeData {
  label: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  [key: string]: unknown;
}

function OutputNode({ data, selected }: NodeProps & { data: OutputNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-all',
        selected && 'node-glow-cyan',
        data.isCompleted && 'border-emerald-500/50'
      )}
    >
      <div className="h-[2px] w-full bg-emerald-400 rounded-t-md" />

      <Handle type="target" position={Position.Top} className="!bg-emerald-400 !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-400/15">
            <ArrowUpFromLine className="w-3 h-3 text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Output'}</p>
        </div>
      </div>
    </div>
  );
}

export default memo(OutputNode);
