'use client';

import React from 'react';
import { Treemap } from 'recharts';
import { COLORS, shortenLabel, formatYAxis } from './utils';

export function renderTreemapChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  const treemapData = data.map((d, i) => ({
    name: String(d[xKey]),
    size: Number(d[yKey]) || 0,
    fill: COLORS[i % COLORS.length],
  }));
  return (
    <Treemap
      data={treemapData}
      dataKey="size"
      nameKey="name"
      aspectRatio={4 / 3}
      stroke="#fff"
      content={({ x, y, width, height, name, value }: { x: number; y: number; width: number; height: number; name?: string; value?: number }) => (
        <g>
          <rect x={x} y={y} width={width} height={height} fill={treemapData.find(d => d.name === name)?.fill || COLORS[0]}
            stroke="#fff" strokeWidth={2} rx={4} />
          {width > 50 && height > 30 && (
            <>
              <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={600}>
                {shortenLabel(String(name ?? ''), 12)}
              </text>
              <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fontSize={10} fill="#ffffffcc">
                {formatYAxis(Number(value ?? 0))}
              </text>
            </>
          )}
        </g>
      )}
    />
  );
}
