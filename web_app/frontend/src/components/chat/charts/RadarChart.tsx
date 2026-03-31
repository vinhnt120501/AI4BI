'use client';

import React from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, Legend } from 'recharts';
import { COLORS, formatYAxis, formatTooltip } from './utils';

export function renderRadarChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
      <PolarGrid />
      <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <PolarRadiusAxis tickFormatter={formatYAxis} tick={{ fontSize: 10 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) => (
        <Radar key={key} name={key} dataKey={key} stroke={COLORS[i % COLORS.length]}
          fill={COLORS[i % COLORS.length]} fillOpacity={0.15} />
      ))}
    </RadarChart>
  );
}
