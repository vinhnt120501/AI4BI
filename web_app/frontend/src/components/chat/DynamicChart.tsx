'use client';

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ComposedChart, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap, Brush, ReferenceLine as RLine, RadialBarChart, RadialBar, ZAxis,
} from 'recharts';
import { ChartBlock, SeriesConfig } from '@/types/types';

// ─── Default Fallback Colors (dùng khi AI không chỉ định) ───
const FALLBACK_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#14b8a6', '#a855f7', '#84cc16', '#e11d48',
];

const NO_DATA = <div className="text-xs text-slate-400 italic px-3 py-4">Không đủ dữ liệu để vẽ biểu đồ</div>;

// ─── Format Helpers ───
function smartFormat(val: number): string {
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val % 1 === 0 ? val.toLocaleString('vi-VN') : val.toFixed(2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtTooltip(v: any) {
  return typeof v === 'number' ? v.toLocaleString('vi-VN') : String(v ?? '');
}

function shortenLabel(label: string, max = 20): string {
  if (typeof label !== 'string') return String(label);
  return label.length > max ? label.slice(0, max) + '…' : label;
}

// ─── Data Processing ───
type Row = Record<string, string | number>;

function buildChartData(columns: string[], rows: string[][]): Row[] {
  return rows.map((row) => {
    const obj: Row = {};
    columns.forEach((col, i) => {
      if (i >= row.length) return; // guard: row shorter than columns
      const val = row[i];
      const num = Number(val);
      obj[col] = isNaN(num) ? val : num;
    });
    return obj;
  });
}

function aggregateData(data: Row[], config: ChartBlock['config']): Row[] {
  if (!config || data.length === 0) return data;
  let processed = [...data];
  const { x_field, y_fields, group_by, aggregate, sort_by, sort_order, limit } = config;

  // Validate fields exist in data
  const sampleKeys = Object.keys(data[0]);
  const validGroupBy = group_by && sampleKeys.includes(group_by) ? group_by : undefined;
  const validXField = x_field && sampleKeys.includes(x_field) ? x_field : undefined;

  if (validGroupBy && aggregate) {
    const groups: Record<string, Row[]> = {};
    processed.forEach((row) => {
      const key = String(row[validGroupBy] ?? row[validXField ?? ''] ?? '');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    processed = Object.entries(groups).map(([key, gRows]) => {
      const result: Row = { [validGroupBy || validXField || 'group']: key };
      (y_fields || []).forEach((f) => {
        const vals = gRows.map((r) => r[f]).filter((v): v is number => typeof v === 'number');
        if (aggregate === 'sum') result[f] = vals.reduce((s, v) => s + v, 0);
        else if (aggregate === 'avg') result[f] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
        else if (aggregate === 'count') result[f] = gRows.length;
        else result[f] = vals[0] ?? 0;
      });
      return result;
    });
  }

  if (sort_by && processed.length > 0 && sort_by in processed[0]) {
    processed.sort((a, b) => sort_order === 'asc'
      ? (a[sort_by] > b[sort_by] ? 1 : -1)
      : (a[sort_by] < b[sort_by] ? 1 : -1));
  }
  if (limit) processed = processed.slice(0, limit);
  return processed;
}

function pivotData(data: Row[], xField: string, colorField: string, yField: string) {
  // Validate fields exist
  if (data.length === 0) return { data: [], categories: [] };
  const sampleKeys = Object.keys(data[0]);
  if (!sampleKeys.includes(xField) || !sampleKeys.includes(colorField)) {
    return { data, categories: [] };
  }

  const pivoted: Record<string, Row> = {};
  const categories = [...new Set(data.map((r) => String(r[colorField])))];
  data.forEach((row) => {
    const x = String(row[xField]);
    if (!pivoted[x]) pivoted[x] = { [xField]: x };
    pivoted[x][String(row[colorField])] = row[yField] ?? 0;
  });
  return { data: Object.values(pivoted), categories };
}

// ─── Resolve keys ───
function resolveKey(data: Row[], key: string): string | null {
  if (data.length === 0 || !key) return null;
  if (key in data[0]) return key;
  // Case-insensitive
  const found = Object.keys(data[0]).find((k) => k.toLowerCase() === key.toLowerCase());
  return found || null;
}

function resolveYKeys(data: Row[], xKey: string, yKeys?: string[]): string[] {
  if (data.length === 0) return [];
  const allKeys = Object.keys(data[0]);

  if (yKeys && yKeys.length > 0) {
    // Exact match
    const exact = yKeys.filter((k) => k in data[0]);
    if (exact.length > 0) return exact;
    // Case-insensitive
    const resolved = yKeys.map((k) => resolveKey(data, k)).filter((k): k is string => !!k);
    if (resolved.length > 0) return resolved;
  }

  // Auto-detect: cột số trừ xKey, tối đa 3 để chart không bị rối
  return allKeys.filter((k) => k !== xKey && typeof data[0][k] === 'number').slice(0, 3);
}

function resolveYKey(data: Row[], xKey: string, yKey: string | undefined, yKeys: string[]): string {
  if (yKeys.length > 0 && resolveKey(data, yKeys[0])) return resolveKey(data, yKeys[0])!;
  if (yKey && resolveKey(data, yKey)) return resolveKey(data, yKey)!;
  // Fallback: first numeric column not xKey
  if (data.length === 0) return yKey || '';
  return Object.keys(data[0]).find((k) => k !== xKey && typeof data[0][k] === 'number') || yKey || '';
}

// ─── Props ───
interface DynamicChartProps {
  block: ChartBlock;
  columns: string[];
  rows: string[][];
}

// ─── Main Component ───
export default function DynamicChart({ block, columns, rows }: DynamicChartProps) {
  const { chartType, options, series, referenceLine, config: transformConfig } = block;
  const opts = options || {};
  const COLORS = (block.colors && block.colors.length > 0) ? block.colors : FALLBACK_COLORS;

  // Build & transform data
  let chartData = buildChartData(columns, rows);
  if (chartData.length === 0) return null;

  let pivotedCategories: string[] | null = null;

  // Pivot if color_field — validate fields exist before attempting
  if (transformConfig?.color_field && transformConfig.x_field && transformConfig.y_fields?.length === 1) {
    const piv = pivotData(chartData, transformConfig.x_field, transformConfig.color_field, transformConfig.y_fields[0]);
    if (piv.categories.length > 0) {
      chartData = piv.data;
      pivotedCategories = piv.categories;
    } else if (transformConfig) {
      chartData = aggregateData(chartData, transformConfig);
    }
  } else if (transformConfig) {
    chartData = aggregateData(chartData, transformConfig);
  }

  if (chartData.length === 0) return NO_DATA;

  // Resolve xKey — sau pivot dùng config.x_field, fallback tìm cột phù hợp
  let xKey = (pivotedCategories && transformConfig?.x_field) ? transformConfig.x_field : block.xKey;
  const resolvedX = resolveKey(chartData, xKey);
  if (resolvedX) {
    xKey = resolvedX;
  } else {
    // Fallback: cột string đầu tiên hoặc cột đầu tiên
    const allKeys = Object.keys(chartData[0]);
    xKey = allKeys.find((k) => typeof chartData[0][k] === 'string') || allKeys[0] || xKey;
  }

  // Resolve yKeys — áp dụng cho mọi chart type (kể cả pie/treemap/funnel/radial_bar)
  const yKeys = pivotedCategories || resolveYKeys(chartData, xKey, block.yKeys);
  if (yKeys.length === 0) {
    const fallbackYKeys = Object.keys(chartData[0]).filter((k) => k !== xKey && typeof chartData[0][k] === 'number').slice(0, 3);
    if (fallbackYKeys.length === 0) return NO_DATA;
    yKeys.push(...fallbackYKeys);
  }

  // Resolve yKey cho single-series charts (pie, treemap, funnel, radial_bar, waterfall)
  const yKey = resolveYKey(chartData, xKey, block.yKey, yKeys);

  // Common props
  const xAxisProps = {
    dataKey: xKey,
    tick: { fill: '#64748b', fontSize: 11 },
    tickFormatter: (v: string) => shortenLabel(v),
    tickLine: false,
  };
  const yAxisProps = {
    tick: { fill: '#64748b', fontSize: 11 },
    tickLine: false,
    axisLine: false,
    tickFormatter: smartFormat,
  };
  const gridProps = { strokeDasharray: '3 3' as const, stroke: '#e2e8f0', opacity: 0.7 };
  const hasDualAxis = opts.dualAxis && yKeys.length > 1;
  const showBrush = opts.brush ?? chartData.length > 12;
  const isStacked = opts.stacked;
  const isPercent = opts.stackOffset === 'expand';
  const isVertical = opts.layout === 'vertical';

  // ─── Render by type ───
  const renderChart = (): React.ReactElement => {
    switch (chartType) {

      // ═══ BAR ═══
      case 'bar': {
        if (isVertical) {
          return (
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }} stackOffset={isPercent ? 'expand' : undefined}>
              <CartesianGrid {...gridProps} />
              <XAxis type="number" {...yAxisProps} tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
              <YAxis type="category" dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95}
                tickFormatter={(v) => shortenLabel(v, 15)} />
              <Tooltip formatter={fmtTooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {yKeys.map((f, i) => (
                <Bar key={f} dataKey={f} fill={COLORS[i % COLORS.length]}
                  stackId={isStacked ? 'stack' : undefined} radius={[0, 4, 4, 0]} opacity={0.9} />
              ))}
            </BarChart>
          );
        }
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }} stackOffset={isPercent ? 'expand' : undefined}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis yAxisId={hasDualAxis ? 'left' : undefined} {...yAxisProps}
              tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
            {hasDualAxis && <YAxis yAxisId="right" orientation="right" {...yAxisProps} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {referenceLine && (
              <RLine yAxisId={hasDualAxis ? 'left' : undefined} y={referenceLine.value}
                stroke={referenceLine.color || '#ef4444'} strokeDasharray="5 5"
                label={{ value: referenceLine.label || '', position: 'insideTopRight', fontSize: 11 }} />
            )}
            {yKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={COLORS[i % COLORS.length]}
                yAxisId={hasDualAxis ? (i === 0 ? 'left' : 'right') : undefined}
                stackId={isStacked ? 'stack' : undefined}
                radius={isStacked ? 0 : [4, 4, 0, 0]} opacity={0.9} />
            ))}
            {showBrush && <Brush dataKey={xKey} height={25} stroke="#6366f1" />}
          </BarChart>
        );
      }

      // ═══ LINE ═══
      case 'line': {
        return (
          <LineChart data={chartData}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis yAxisId={hasDualAxis ? 'left' : undefined} {...yAxisProps} />
            {hasDualAxis && <YAxis yAxisId="right" orientation="right" {...yAxisProps} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {yKeys.map((f, i) => (
              <Line key={f} type="monotone" dataKey={f} stroke={COLORS[i % COLORS.length]}
                yAxisId={hasDualAxis ? (i === 0 ? 'left' : 'right') : undefined}
                strokeWidth={2.5} strokeDasharray={opts.dashed ? '8 4' : undefined}
                dot={opts.showDots !== false ? { r: 3, fill: '#fff', strokeWidth: 2 } : false}
                activeDot={{ r: 5, strokeWidth: 0, fill: COLORS[i % COLORS.length] }} />
            ))}
            {showBrush && <Brush dataKey={xKey} height={25} stroke="#6366f1" />}
          </LineChart>
        );
      }

      // ═══ AREA ═══
      case 'area': {
        return (
          <AreaChart data={chartData} stackOffset={isPercent ? 'expand' : undefined}>
            <defs>
              {yKeys.map((f, i) => (
                <linearGradient key={f} id={`grad-${f}-${block.title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
            <Tooltip formatter={isPercent ? (v) => `${(Number(v) * 100).toFixed(1)}%` : fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {yKeys.map((f, i) => (
              <Area key={f} type="monotone" dataKey={f} stroke={COLORS[i % COLORS.length]}
                stackId={isStacked || isPercent ? '1' : undefined}
                fill={opts.gradient !== false ? `url(#grad-${f}-${block.title})` : COLORS[i % COLORS.length]}
                fillOpacity={opts.gradient !== false ? 1 : 0.2} strokeWidth={2} />
            ))}
            {showBrush && <Brush dataKey={xKey} height={25} stroke="#6366f1" />}
          </AreaChart>
        );
      }

      // ═══ PIE ═══
      case 'pie': {
        const pieData = chartData.map((r) => ({ name: String(r[xKey] ?? ''), value: Number(r[yKey]) || 0 }))
          .filter((d) => d.value > 0);
        if (pieData.length === 0) return NO_DATA as React.ReactElement;
        const inner = opts.innerRadius || 0;
        const sAngle = opts.startAngle ?? 0;
        const eAngle = opts.endAngle ?? 360;
        return (
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%"
              innerRadius={inner} outerRadius="75%"
              startAngle={sAngle} endAngle={eAngle}
              paddingAngle={inner ? 3 : 1} dataKey="value"
              label={({ name, percent }) => `${shortenLabel(String(name ?? ''), 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#94a3b8' }} fontSize={11}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.9} />
              ))}
            </Pie>
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        );
      }

      // ═══ SCATTER ═══
      case 'scatter': {
        const numericKeys = Object.keys(chartData[0] || {}).filter((k) => typeof chartData[0][k] === 'number');
        const xF = resolveKey(chartData, yKeys[0]) || numericKeys[0] || xKey;
        const yF = resolveKey(chartData, yKeys[1] || yKeys[0]) || numericKeys[1] || numericKeys[0] || xKey;
        const zF = opts.zField ? resolveKey(chartData, opts.zField) : null;
        return (
          <ScatterChart>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xF} name={xF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <YAxis dataKey={yF} name={yF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            {zF && <ZAxis dataKey={zF} name={zF} range={[40, 400]} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Scatter name={`${xF} vs ${yF}`} data={chartData} fill={COLORS[0]} opacity={0.8}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        );
      }

      // ═══ COMPOSED ═══
      case 'composed': {
        const seriesConfig: SeriesConfig[] = series || yKeys.map((k, i) => ({
          key: k,
          renderAs: (i === 0 ? 'bar' : 'line') as 'bar' | 'line' | 'area',
          yAxisId: (hasDualAxis ? (i === 0 ? 'left' : 'right') : 'left') as 'left' | 'right',
        }));
        // Filter series whose key actually exists in data
        const validSeries = seriesConfig.filter((s) => !chartData[0] || resolveKey(chartData, s.key));
        if (validSeries.length === 0) return NO_DATA as React.ReactElement;
        const hasDual = validSeries.some((s) => s.yAxisId === 'right');

        return (
          <ComposedChart data={chartData} margin={{ bottom: 60, right: hasDual ? 20 : 5 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis yAxisId="left" {...yAxisProps} />
            {hasDual && <YAxis yAxisId="right" orientation="right" {...yAxisProps} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {referenceLine && (
              <RLine yAxisId="left" y={referenceLine.value}
                stroke={referenceLine.color || '#ef4444'} strokeDasharray="5 5"
                label={{ value: referenceLine.label || '', position: 'insideTopRight', fontSize: 11 }} />
            )}
            {validSeries.map((s, i) => {
              const color = s.color || COLORS[i % COLORS.length];
              const axisId = s.yAxisId || 'left';
              const resolvedKey = resolveKey(chartData, s.key) || s.key;
              switch (s.renderAs) {
                case 'area':
                  return <Area key={resolvedKey} type="monotone" dataKey={resolvedKey} yAxisId={axisId}
                    stroke={color} fill={color} fillOpacity={0.15} />;
                case 'line':
                  return <Line key={resolvedKey} type="monotone" dataKey={resolvedKey} yAxisId={axisId}
                    stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />;
                default:
                  return <Bar key={resolvedKey} dataKey={resolvedKey} yAxisId={axisId}
                    fill={color} radius={[4, 4, 0, 0]} opacity={0.9} />;
              }
            })}
            {showBrush && <Brush dataKey={xKey} height={25} stroke="#6366f1" />}
          </ComposedChart>
        );
      }

      // ═══ RADAR ═══
      case 'radar': {
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} />
            <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
            {yKeys.map((f, i) => (
              <Radar key={f} name={f} dataKey={f} stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
            ))}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Tooltip formatter={fmtTooltip} />
          </RadarChart>
        );
      }

      // ═══ RADIAL BAR ═══
      case 'radial_bar': {
        const rbData = chartData.map((r, i) => ({
          name: String(r[xKey] ?? ''), value: Number(r[yKey]) || 0, fill: COLORS[i % COLORS.length],
        })).filter((d) => d.value > 0);
        if (rbData.length === 0) return NO_DATA as React.ReactElement;
        return (
          <RadialBarChart cx="50%" cy="50%" innerRadius="20%" outerRadius="90%" barSize={18} data={rbData}>
            <RadialBar dataKey="value" background={{ fill: '#f1f5f9' }}
              label={{ position: 'insideStart', fill: '#475569', fontSize: 11 }} />
            <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right"
              wrapperStyle={{ fontSize: 11 }} />
            <Tooltip formatter={fmtTooltip} />
          </RadialBarChart>
        );
      }

      // ═══ TREEMAP ═══
      case 'treemap': {
        const tmData = chartData.map((r, i) => ({
          name: String(r[xKey] ?? ''), size: Number(r[yKey]) || 0, fill: COLORS[i % COLORS.length],
        })).filter((d) => d.size > 0);
        if (tmData.length === 0) return NO_DATA as React.ReactElement;
        return (
          <Treemap data={tmData} dataKey="size" nameKey="name" aspectRatio={4 / 3}
            stroke="#fff" fill={COLORS[0]}>
            {tmData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
            <Tooltip formatter={fmtTooltip} />
          </Treemap>
        );
      }

      // ═══ FUNNEL (using horizontal stacked bar as visual) ═══
      case 'funnel': {
        const sorted = [...chartData].sort((a, b) => Number(b[yKey] ?? 0) - Number(a[yKey] ?? 0));
        return (
          <BarChart data={sorted} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} />
            <YAxis type="category" dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95} />
            <Tooltip formatter={fmtTooltip} />
            <Bar dataKey={yKey} radius={[0, 4, 4, 0]}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={0.9 - i * 0.05} />
              ))}
            </Bar>
          </BarChart>
        );
      }

      // ═══ WATERFALL ═══
      case 'waterfall': {
        let cumulative = 0;
        const wfData = chartData.map((row) => {
          const value = Number(row[yKey]) || 0;
          const start = cumulative;
          cumulative += value;
          return { name: String(row[xKey] ?? ''), value: [start, cumulative], rawValue: value };
        });
        return (
          <BarChart data={wfData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-35} textAnchor="end" height={80}
              tickFormatter={(v) => shortenLabel(v)} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={(v) => { const a = v as number[]; return fmtTooltip(a[1] - a[0]); }} />
            <RLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Bar dataKey="value" name={yKey} radius={[4, 4, 0, 0]}>
              {wfData.map((entry, i) => (
                <Cell key={i} fill={entry.rawValue >= 0
                  ? (opts.positiveColor || '#10b981')
                  : (opts.negativeColor || '#ef4444')} />
              ))}
            </Bar>
          </BarChart>
        );
      }

      default:
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {yKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
    }
  };

  // ─── Height (AI có thể chỉ định, fallback tự tính) ───
  let chartHeight = block.height || 320;
  if (!block.height) {
    const heightMap: Record<string, number> = { radar: 400, radial_bar: 400, treemap: 350 };
    chartHeight = heightMap[chartType] || 320;
    if (isVertical || chartType === 'funnel') chartHeight = Math.max(300, chartData.length * 35);
    else if (chartData.length > 8) chartHeight = 400;
  }

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      {renderChart()}
    </ResponsiveContainer>
  );
}
