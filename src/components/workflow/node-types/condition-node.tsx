'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConditionNodeData {
  label: string;
  condition?: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function ConditionNode({ data, selected }: NodeProps & { data: ConditionNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-shadow',
        selected && 'node-glow-amber',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full bg-amber-500 rounded-t-md" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/15">
            <GitBranch className="w-3 h-3 text-amber-400" />
          </div>
          <p className="text-sm font-medium text-foreground truncate">{data.label || 'Condition'}</p>
        </div>

        {data.condition && (
          <div className="mt-1.5 rounded bg-input px-1.5 py-0.5">
            <code className="text-[11px] text-amber-300 font-mono">{data.condition}</code>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} className="!bg-emerald-500 !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} className="!bg-rose-500 !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(ConditionNode);
