'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { COLORS, shortenLabel, formatYAxis, formatTooltip } from './utils';

export function renderBarChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <BarChart data={data} margin={{ bottom: 60 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={80}
        tickFormatter={(v) => shortenLabel(v)} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) => (
        <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
      ))}
    </BarChart>
  );
}

export function renderStackedBarChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <BarChart data={data} margin={{ bottom: 60 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={80}
        tickFormatter={(v) => shortenLabel(v)} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) => (
        <Bar key={key} dataKey={key} stackId="stack" fill={COLORS[i % COLORS.length]} />
      ))}
    </BarChart>
  );
}

export function renderHorizontalBarChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis type="number" tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11 }} width={95}
        tickFormatter={(v) => shortenLabel(v, 15)} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) => (
        <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
      ))}
    </BarChart>
  );
}
