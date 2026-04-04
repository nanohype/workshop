'use client';

import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from '@xyflow/react';

export default function ConditionalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const { setEdges } = useReactFlow();
  const label = (data as Record<string, unknown>)?.label as string | undefined;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#5B8DEF' : '#3B4A5C',
          strokeWidth: selected ? 2.5 : 1.5,
          ...style,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="flex items-center gap-1"
        >
          {label && (
            <span className={`rounded-md px-2 py-0.5 text-xs border ${
              selected
                ? 'bg-accent/10 text-accent border-accent/50'
                : 'bg-card text-muted-foreground border-border'
            }`}>
              {label}
            </span>
          )}
          {selected && (
            <button
              className="rounded-full bg-rose-600 hover:bg-rose-500 text-white w-4 h-4 flex items-center justify-center text-xs leading-none cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setEdges((edges) => edges.filter((edge) => edge.id !== id));
              }}
              title="Delete edge"
            >
              ×
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
