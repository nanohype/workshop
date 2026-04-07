'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValidateNodeData {
  label: string;
  validationSteps?: { name: string; command: string }[];
  templateDerived?: boolean;
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function ValidateNode({ data, selected }: NodeProps & { data: ValidateNodeData }) {
  const stepCount = data.validationSteps?.length || 0;

  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-shadow',
        selected && 'node-glow-rose',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full rounded-t-md bg-rose-500" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-500/15">
            <ClipboardCheck className="w-3 h-3 text-rose-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Validate'}</p>
          {data.templateDerived && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">auto</span>
          )}
        </div>
        {stepCount > 0 && (
          <p className="text-[11px] text-dim mt-0.5">
            {data.validationSteps!.map(s => s.name).join(', ')}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />
    </div>
  );
}

export default memo(ValidateNode);
