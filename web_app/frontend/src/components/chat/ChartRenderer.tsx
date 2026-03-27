'use client';

import React from 'react';
import { ChartConfig } from '@/types/types';
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

interface ChartRendererProps {
  columns: string[];
  rows: string[][];
  config: ChartConfig;
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

/**
 * Chuyển rows[][] thành data[] cho Recharts
 */
function buildChartData(columns: string[], rows: string[][]): Record<string, string | number>[] {
  return rows.map((row) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((col, i) => {
      const val = row[i];
      const num = Number(val);
      obj[col] = isNaN(num) ? val : num;
    });
    return obj;
  });
}

/**
 * Format số lớn cho trục Y (ví dụ 1,200,000 → 1.2M)
 */
function formatYAxis(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

/**
 * Render BarChart
 */
function renderBarChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  return (
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={(v) => Number(v).toLocaleString()} />
      <Legend />
      <Bar dataKey={yKey} fill="#6366f1" radius={[4, 4, 0, 0]} />
    </BarChart>
  );
}

/**
 * Render LineChart
 */
function renderLineChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  return (
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={(v) => Number(v).toLocaleString()} />
      <Legend />
      <Line type="monotone" dataKey={yKey} stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
    </LineChart>
  );
}

/**
 * Render AreaChart
 */
function renderAreaChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  return (
    <AreaChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
      <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
      <Tooltip formatter={(v) => Number(v).toLocaleString()} />
      <Legend />
      <Area type="monotone" dataKey={yKey} stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
    </AreaChart>
  );
}

/**
 * Render PieChart
 */
function renderPieChart(data: Record<string, string | number>[], xKey: string, yKey: string) {
  return (
    <PieChart>
      <Pie
        data={data}
        dataKey={yKey}
        nameKey={xKey}
        cx="50%"
        cy="50%"
        outerRadius={120}
        label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(1)}%)`}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(v) => Number(v).toLocaleString()} />
      <Legend />
    </PieChart>
  );
}

/**
 * ChartRenderer — Render biểu đồ Recharts dựa trên config từ AI
 */
export default function ChartRenderer({ columns, rows, config }: ChartRendererProps) {
  const data = buildChartData(columns, rows);
  const { type, xKey, yKey } = config;

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white">
      <ResponsiveContainer width="100%" height={320}>
        {type === 'bar' && renderBarChart(data, xKey, yKey)}
        {type === 'line' && renderLineChart(data, xKey, yKey)}
        {type === 'area' && renderAreaChart(data, xKey, yKey)}
        {type === 'pie' && renderPieChart(data, xKey, yKey)}
      </ResponsiveContainer>
    </div>
  );
}
