'use client';

import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { COLORS, formatYAxis, formatTooltip } from './utils';

export function renderScatterChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  const yKey = yKeys[0];
  return (
    <ScatterChart>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} name={xKey} tick={{ fontSize: 11 }} />
      <YAxis dataKey={yKey} name={yKey} tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      <Scatter name={yKey} data={data} fill={COLORS[0]} />
    </ScatterChart>
  );
}
