'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Blocks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScaffoldNodeData {
  label: string;
  templateName?: string;
  templateVariables?: Record<string, string | boolean | number>;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function ScaffoldNode({ data, selected }: NodeProps & { data: ScaffoldNodeData }) {
  const varCount = data.templateVariables ? Object.keys(data.templateVariables).length : 0;
  const isBrief = data.templateName?.startsWith('brief-') ?? false;

  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-shadow',
        selected && (isBrief ? 'node-glow-orange' : 'node-glow-emerald'),
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className={cn('h-[2px] w-full rounded-t-md', isBrief ? 'bg-orange-500' : 'bg-emerald-500')} />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className={cn('flex items-center justify-center w-5 h-5 rounded-full', isBrief ? 'bg-orange-500/15' : 'bg-emerald-500/15')}>
            <Blocks className={cn('w-3 h-3', isBrief ? 'text-orange-400' : 'text-emerald-400')} />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || (isBrief ? 'Brief' : 'Scaffold')}</p>
          {isBrief && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400">brief</span>
          )}
        </div>
        {data.templateName && (
          <p className="text-[11px] text-dim mt-0.5 font-mono">{data.templateName}</p>
        )}
        {varCount > 0 && (
          <p className="text-[10px] text-dim mt-0.5">{varCount} variable{varCount !== 1 ? 's' : ''}</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(ScaffoldNode);
