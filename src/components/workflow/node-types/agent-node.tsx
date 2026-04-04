'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentNodeData {
  label: string;
  systemPrompt?: string;
  permissionMode?: string;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function AgentNode({ data, selected }: NodeProps & { data: AgentNodeData }) {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-all',
        selected && 'node-glow-indigo',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full rounded-t-md bg-indigo-500" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/15">
            <Brain className="w-3 h-3 text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Claude Code'}</p>
        </div>
        <p className="text-[11px] text-dim mt-0.5">Claude Code</p>

        {data.systemPrompt && (
          <p className="text-[11px] text-dim mt-0.5 line-clamp-2">{data.systemPrompt}</p>
        )}

        {data.permissionMode && data.permissionMode !== 'default' && (
          <span className={cn(
            'inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded-full',
            data.permissionMode === 'full' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'
          )}>
            {data.permissionMode === 'full' ? 'Full Autonomy' : 'Accept Edits'}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(AgentNode);
