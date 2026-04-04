'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ArrowDownToLine } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InputNodeData {
  label: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  [key: string]: unknown;
}

function InputNode({ data, selected }: NodeProps & { data: InputNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-all',
        selected && 'node-glow-cyan',
        data.isCompleted && 'border-emerald-500/50'
      )}
    >
      <div className="h-[2px] w-full bg-cyan-500 rounded-t-md" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/15">
            <ArrowDownToLine className="w-3 h-3 text-cyan-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Input'}</p>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500 !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(InputNode);
