'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Network } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Route {
  label: string;
  condition?: string;
}

interface RouterNodeData {
  label: string;
  routes?: Route[];
  isRunning?: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
  [key: string]: unknown;
}

function RouterNode({ data, selected }: NodeProps & { data: RouterNodeData }) {
  const routes = data.routes || [{ label: 'Route A' }, { label: 'Route B' }];

  return (
    <div
      className={cn(
        'relative rounded-md border border-border bg-card min-w-[180px] shadow-sm transition-shadow',
        selected && 'node-glow-teal',
        data.isCompleted && 'border-emerald-500/50',
        data.isFailed && 'border-rose-500/50'
      )}
    >
      <div className="h-[2px] w-full rounded-t-md bg-teal-500" />

      <Handle type="target" position={Position.Top} className="!bg-handle !w-2.5 !h-2.5 !border-2 !border-card !ring-1 !ring-border" />

      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-teal-500/15">
            <Network className="w-3 h-3 text-teal-400" />
          </div>
          <p className="text-sm font-medium text-foreground">{data.label || 'Router'}</p>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {routes.map((route, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400">
              {route.label}
            </span>
          ))}
        </div>
      </div>

      {/* Dynamic output handles — one per route */}
      {routes.map((route, i) => {
        const total = routes.length;
        const spacing = 100 / (total + 1);
        const leftPercent = spacing * (i + 1);
        return (
          <Handle
            key={route.label}
            type="source"
            position={Position.Bottom}
            id={route.label}
            className="!bg-teal-500 !w-2 !h-2 !border-2 !border-card !ring-1 !ring-border"
            style={{ left: `${leftPercent}%` }}
          />
        );
      })}
    </div>
  );
}

export default memo(RouterNode);
