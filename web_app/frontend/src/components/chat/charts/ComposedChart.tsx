'use client';

import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { COLORS, shortenLabel, formatYAxis, formatTooltip } from './utils';

export function renderComposedChart(data: Record<string, string | number>[], xKey: string, yKeys: string[]) {
  return (
    <ComposedChart data={data} margin={{ bottom: 60 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 11 }} angle={-35} textAnchor="end" height={80}
        tickFormatter={(v) => shortenLabel(v)} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={formatTooltip} />
      <Legend />
      {yKeys.map((key, i) =>
        i === 0 ? (
          <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
        ) : (
          <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]}
            strokeWidth={2} dot={{ r: 3 }} />
        )
      )}
    </ComposedChart>
  );
}
