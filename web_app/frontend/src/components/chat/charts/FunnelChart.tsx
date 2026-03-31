'use client';

import React from 'react';
import { FunnelChart, Funnel, LabelList, Tooltip } from 'recharts';
import { COLORS, formatTooltip } from './utils';

export function renderFunnelChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  const funnelData = data.map((d, i) => ({
    name: String(d[xKey]),
    value: Number(d[yKey]) || 0,
    fill: COLORS[i % COLORS.length],
  }));
  return (
    <FunnelChart>
      <Tooltip formatter={formatTooltip} />
      <Funnel dataKey="value" data={funnelData} isAnimationActive>
        <LabelList position="right" fill="#333" stroke="none" dataKey="name" fontSize={12} />
      </Funnel>
    </FunnelChart>
  );
}
