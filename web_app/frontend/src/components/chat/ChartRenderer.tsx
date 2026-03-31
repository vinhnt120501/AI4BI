'use client';

import React from 'react';
import { ResponsiveContainer } from 'recharts';
import { ChartConfig } from '@/types/types';
import { buildChartData, resolveYKeys } from './charts/utils';
import { renderBarChart, renderStackedBarChart, renderHorizontalBarChart } from './charts/BarCharts';
import { renderLineChart, renderAreaChart } from './charts/LineCharts';
import { renderPieChart, renderDonutChart } from './charts/PieCharts';
import { renderScatterChart } from './charts/ScatterChart';
import { renderRadarChart } from './charts/RadarChart';
import { renderTreemapChart } from './charts/TreemapChart';
import { renderFunnelChart } from './charts/FunnelChart';
import { renderComposedChart } from './charts/ComposedChart';

interface ChartRendererProps {
  columns: string[];
  rows: string[][];
  config: ChartConfig;
}

export default function ChartRenderer({ columns, rows, config }: ChartRendererProps) {
  const data = buildChartData(columns, rows);
  if (data.length === 0) return null;

  const { type, xKey } = config;
  const yKeys = resolveYKeys(data, xKey, config);
  if (yKeys.length === 0) return null;

  const yKey = yKeys[0];

  const heightMap: Record<string, number> = {
    horizontal_bar: Math.max(300, data.length * 35),
    radar: 400,
    treemap: 350,
    funnel: Math.max(300, data.length * 45),
  };
  const chartHeight = heightMap[type] || (data.length > 8 ? 400 : 320);

  const chartMap: Record<string, () => React.ReactElement> = {
    bar:            () => renderBarChart(data, xKey, yKeys),
    stacked_bar:    () => renderStackedBarChart(data, xKey, yKeys),
    horizontal_bar: () => renderHorizontalBarChart(data, xKey, yKeys),
    line:           () => renderLineChart(data, xKey, yKeys),
    area:           () => renderAreaChart(data, xKey, yKeys),
    pie:            () => renderPieChart(data, xKey, yKey),
    donut:          () => renderDonutChart(data, xKey, yKey),
    scatter:        () => renderScatterChart(data, xKey, yKeys),
    radar:          () => renderRadarChart(data, xKey, yKeys),
    treemap:        () => renderTreemapChart(data, xKey, yKey),
    funnel:         () => renderFunnelChart(data, xKey, yKey),
    composed:       () => renderComposedChart(data, xKey, yKeys),
  };

  const renderFn = chartMap[type];
  if (!renderFn) return null;

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <ResponsiveContainer width="100%" height={chartHeight}>
        {renderFn()}
      </ResponsiveContainer>
    </div>
  );
}
