'use client';

import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { COLORS, shortenLabel, formatTooltip } from './utils';

export function renderPieChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  return (
    <PieChart>
      <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={120}
        label={({ name, percent }) =>
          `${shortenLabel(String(name ?? ''), 15)} (${((percent ?? 0) * 100).toFixed(1)}%)`
        }>
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={formatTooltip} />
      <Legend />
    </PieChart>
  );
}

export function renderDonutChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  return (
    <PieChart>
      <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%"
        innerRadius={60} outerRadius={120}
        label={({ name, percent }) =>
          `${shortenLabel(String(name ?? ''), 15)} (${((percent ?? 0) * 100).toFixed(1)}%)`
        }>
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={formatTooltip} />
      <Legend />
    </PieChart>
  );
}
