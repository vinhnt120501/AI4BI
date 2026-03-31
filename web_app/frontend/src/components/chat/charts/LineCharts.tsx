'use client';

import React from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { COLORS, formatYAxis, formatTooltip } from './utils';

export function renderLineChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) => (
        <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]}
          strokeWidth={2} dot={{ r: 3 }} />
      ))}
    </LineChart>
  );
}

export function renderAreaChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <AreaChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) => (
        <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]}
          fill={COLORS[i % COLORS.length]} fillOpacity={0.2} />
      ))}
    </AreaChart>
  );
}
