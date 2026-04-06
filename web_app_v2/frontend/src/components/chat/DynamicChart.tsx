'use client';

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ComposedChart, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap, Brush, ReferenceLine as RLine, RadialBarChart, RadialBar, ZAxis,
} from 'recharts';
import { ChartBlock, ChartOptions } from '@/types/types';

// ─── Colors (harmonious modern palette — blue-dominant with warm accents) ───
const COLOR_POOL = [
  '#2563eb', '#0891b2', '#7c3aed', '#059669', '#d946ef', '#ea580c',
  '#0284c7', '#4f46e5', '#0d9488', '#c026d3', '#dc2626', '#ca8a04',
  '#6366f1', '#0e7490', '#15803d', '#9333ea',
];

function hexToRgb(hex: string): [number, number, number] | null {
  const cleaned = hex.replace('#', '').trim();
  if (![3, 6].includes(cleaned.length)) return null;
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}

function lightness(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (max + min) / 2;
}

function isTooLight(hex: string): boolean {
  const l = lightness(hex);
  return l > 0.8;
}

function normalizeColors(colors: string[] = []): string[] {
  return colors
    .map((c) => c.trim())
    .filter((c) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) && !isTooLight(c));
}

function getChartColors(options?: ChartOptions): string[] {
  const custom = normalizeColors(options?.colors || []);
  const base = [...custom, ...COLOR_POOL];
  return base.slice(0, 8);
}

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
      const val = row[i];
      const num = Number(val);
      obj[col] = isNaN(num) ? val : num;
    });
    return obj;
  });
}

function aggregateData(data: Row[], config: ChartBlock['config']): Row[] {
  if (!config) return data;
  let processed = [...data];
  const { x_field, y_fields, group_by, aggregate, sort_by, sort_order, limit } = config;

  if (group_by && aggregate) {
    const groups: Record<string, Row[]> = {};
    processed.forEach((row) => {
      const key = String(row[group_by] ?? row[x_field] ?? '');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });
    processed = Object.entries(groups).map(([key, gRows]) => {
      const result: Row = { [group_by || x_field]: key };
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

  if (sort_by) {
    processed.sort((a, b) => sort_order === 'asc'
      ? (a[sort_by] > b[sort_by] ? 1 : -1)
      : (a[sort_by] < b[sort_by] ? 1 : -1));
  }
  if (limit) processed = processed.slice(0, limit);
  return processed;
}

function pivotData(data: Row[], xField: string, colorField: string, yField: string) {
  const pivoted: Record<string, Row> = {};
  const categories = [...new Set(data.map((r) => String(r[colorField])))];
  data.forEach((row) => {
    const x = String(row[xField]);
    if (!pivoted[x]) pivoted[x] = { [xField]: x };
    pivoted[x][String(row[colorField])] = row[yField];
  });
  return { data: Object.values(pivoted), categories };
}

// ─── Resolve yKeys ───
function resolveYKeys(data: Row[], xKey: string, yKeys?: string[]): string[] {
  if (yKeys && yKeys.length > 0) {
    const valid = yKeys.filter((k) => data.length > 0 && k in data[0]);
    if (valid.length > 0) return valid;
  }
  if (data.length === 0) return [];
  return Object.keys(data[0]).filter((k) => k !== xKey && typeof data[0][k] === 'number');
}

function selectTopYKeys(data: Row[], yKeys: string[], maxSeries = 8): string[] {
  if (yKeys.length <= maxSeries) return yKeys;
  const totals = yKeys.map((key) => {
    const sum = data.reduce((acc, row) => {
      const value = Number(row[key]);
      return acc + (Number.isFinite(value) ? Math.abs(value) : 0);
    }, 0);
    return { key, score: sum };
  });
  return totals
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSeries)
    .map((item) => item.key);
}

// ─── Props ───
interface DynamicChartProps {
  block: ChartBlock;
  columns: string[];
  rows: string[][];
}

function normalizeBlockRows(block: ChartBlock, rows: string[][]) {
  if (block.rows && Array.isArray(block.rows) && block.rows.length > 0) {
    return block.rows as string[][];
  }
  return rows;
}

// ─── Main Component ───
export default function DynamicChart({ block, columns, rows }: DynamicChartProps) {
  const { xKey, options, series, referenceLine, config: transformConfig } = block;

  // Backward-compat: map legacy chart types from old prompt/backend to new dynamic types.
  const rawChartType = String((block as unknown as { chartType?: string }).chartType || 'bar');
  let chartType = rawChartType as ChartBlock['chartType'];
  const opts = { ...(options || {}) };
  if (rawChartType === 'horizontal_bar') {
    chartType = 'bar';
    if (!opts.layout) opts.layout = 'vertical';
  } else if (rawChartType === 'stacked_bar') {
    chartType = 'bar';
    opts.stacked = true;
  } else if (rawChartType === 'donut') {
    chartType = 'pie';
    if (!opts.innerRadius) opts.innerRadius = '55%';
  }

  // Build & transform data
  const actualRows = normalizeBlockRows(block, rows);
  let chartData = buildChartData(columns, actualRows);
  if (chartData.length === 0) return null;

  let pivotedCategories: string[] | null = null;

  // Pivot if color_field
  if (transformConfig?.color_field && transformConfig.x_field && transformConfig.y_fields?.length === 1) {
    const piv = pivotData(chartData, transformConfig.x_field, transformConfig.color_field, transformConfig.y_fields[0]);
    chartData = piv.data;
    pivotedCategories = piv.categories;
  } else if (transformConfig) {
    chartData = aggregateData(chartData, transformConfig);
  }

  const yKeys = pivotedCategories || resolveYKeys(chartData, xKey, block.yKeys);
  const maxSeries = typeof opts.maxSeries === 'number' && opts.maxSeries > 0 ? opts.maxSeries : 8;
  const activeYKeys = selectTopYKeys(chartData, yKeys, maxSeries);
  if (activeYKeys.length === 0 && !['pie', 'treemap', 'funnel', 'radial_bar'].includes(chartType)) return null;
  const yKey = activeYKeys[0] || block.yKey || '';

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

  // Auto-detect dual axis: when mixing % fields with large numeric fields
  const autoDualAxis = (() => {
    if (opts.dualAxis) return true;
    if (activeYKeys.length < 2 || chartData.length === 0) return false;
    const maxPerKey = activeYKeys.map((k) => {
      const vals = chartData.map((r) => Math.abs(Number(r[k]) || 0));
      return Math.max(...vals);
    });
    const isPercentKey = (k: string) => /rate|percent|pct|tyle|ratio|margin/i.test(k);
    const hasPercent = activeYKeys.some((k, i) => isPercentKey(k) || maxPerKey[i] <= 100);
    const hasLarge = maxPerKey.some((v) => v > 1000);
    return hasPercent && hasLarge;
  })();
  const hasDualAxis = autoDualAxis && activeYKeys.length > 1;
  // Default: disable brush selection unless explicitly enabled by LLM (to avoid blue overlay appearance)
  const showBrush = opts.brush === true;
  const isStacked = opts.stacked;
  const isPercent = opts.stackOffset === 'expand';
  const isVertical = opts.layout === 'vertical';

  // ─── Render by type ───
  const colors = getChartColors(opts);
  const renderChart = (): React.ReactElement => {
    switch (chartType) {

      // ═══ BAR ═══
      case 'bar': {
        // Single-series categorical comparison: color each bar differently
        const isCategorical = activeYKeys.length === 1 && !isStacked;

        if (isVertical) {
          return (
            <BarChart data={chartData} layout="vertical" margin={{ left: 100 }} stackOffset={isPercent ? 'expand' : undefined}>
              <CartesianGrid {...gridProps} />
              <XAxis type="number" {...yAxisProps} tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
              <YAxis type="category" dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95}
                tickFormatter={(v) => shortenLabel(v, 15)} />
              <Tooltip formatter={fmtTooltip} />
              {!isCategorical && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {activeYKeys.map((f, i) => (
                <Bar key={f} dataKey={f} fill={colors[i % colors.length]}
                  stackId={isStacked ? 'stack' : undefined} radius={[0, 4, 4, 0]} opacity={0.9}>
                  {isCategorical && chartData.map((_, di) => (
                    <Cell key={di} fill={colors[di % colors.length]} />
                  ))}
                </Bar>
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
            {hasDualAxis && <YAxis yAxisId="right" orientation="right" {...yAxisProps}
              tickFormatter={(v) => `${v}%`} />}
            <Tooltip formatter={fmtTooltip} />
            {!isCategorical && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {referenceLine && (
              <RLine yAxisId={hasDualAxis ? 'left' : undefined} y={referenceLine.value}
                stroke={referenceLine.color || '#ef4444'} strokeDasharray="5 5"
                label={{ value: referenceLine.label || '', position: 'insideTopRight', fontSize: 11 }} />
            )}
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]}
                yAxisId={hasDualAxis ? (i === 0 ? 'left' : 'right') : undefined}
                stackId={isStacked ? 'stack' : undefined}
                radius={isStacked ? 0 : [4, 4, 0, 0]} opacity={0.9}>
                {isCategorical && chartData.map((_, di) => (
                  <Cell key={di} fill={colors[di % colors.length]} />
                ))}
              </Bar>
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
            {hasDualAxis && <YAxis yAxisId="right" orientation="right" {...yAxisProps}
              tickFormatter={(v) => `${v}%`} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activeYKeys.map((f, i) => (
              <Line key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]}
                yAxisId={hasDualAxis ? (i === 0 ? 'left' : 'right') : undefined}
                strokeWidth={2.5} strokeDasharray={opts.dashed ? '8 4' : undefined}
                dot={opts.showDots !== false ? { r: 3, fill: '#fff', strokeWidth: 2 } : false}
                activeDot={{ r: 5, strokeWidth: 0, fill: colors[i % colors.length] }} />
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
              {activeYKeys.map((f, i) => (
                <linearGradient key={f} id={`grad-${f}-${block.title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
            <Tooltip formatter={isPercent ? (v) => `${(Number(v) * 100).toFixed(1)}%` : fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {yKeys.map((f, i) => (
              <Area key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]}
                stackId={isStacked || isPercent ? '1' : undefined}
                fill={opts.gradient !== false ? `url(#grad-${f}-${block.title})` : colors[i % colors.length]}
                fillOpacity={opts.gradient !== false ? 1 : 0.2} strokeWidth={2} />
            ))}
            {showBrush && <Brush dataKey={xKey} height={25} stroke="#6366f1" />}
          </AreaChart>
        );
      }

      // ═══ PIE ═══
      case 'pie': {
        const MAX_SLICES = 7;
        let rawPieData = chartData
          .map((r) => ({ name: String(r[xKey]), value: Number(r[yKey]) || 0 }))
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value);

        // Collapse small slices into "Khác" if too many
        let pieData = rawPieData;
        if (rawPieData.length > MAX_SLICES) {
          const top = rawPieData.slice(0, MAX_SLICES - 1);
          const rest = rawPieData.slice(MAX_SLICES - 1);
          const otherValue = rest.reduce((s, d) => s + d.value, 0);
          pieData = [...top, { name: `Khác (${rest.length})`, value: otherValue }];
        }

        const inner = opts.innerRadius || 0;
        const sAngle = opts.startAngle ?? 0;
        const eAngle = opts.endAngle ?? 360;
        return (
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%"
              innerRadius={inner} outerRadius="75%"
              startAngle={sAngle} endAngle={eAngle}
              paddingAngle={inner ? 3 : 1} dataKey="value"
              label={({ name, percent }) => `${shortenLabel(String(name ?? ''), 14)} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#94a3b8' }} fontSize={11}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} opacity={0.9} />
              ))}
            </Pie>
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        );
      }

      // ═══ SCATTER ═══
      case 'scatter': {
        const xF = activeYKeys[0] || xKey;
        const yF = activeYKeys[1] || activeYKeys[0];
        const zF = opts.zField;
        return (
          <ScatterChart>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xF} name={xF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <YAxis dataKey={yF} name={yF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            {zF && <ZAxis dataKey={zF} name={zF} range={[40, 400]} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Scatter name={`${xF} vs ${yF}`} data={chartData} fill={colors[0]} opacity={0.8}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        );
      }

      // ═══ COMPOSED ═══
      case 'composed': {
        const isPercentField = (k: string) => {
          if (/rate|percent|pct|tyle|ratio|margin/i.test(k)) return true;
          const vals = chartData.map((r) => Math.abs(Number(r[k]) || 0));
          const maxVal = Math.max(...vals);
          return maxVal > 0 && maxVal <= 100;
        };

        const seriesConfig = series || activeYKeys.map((k, i) => {
          const isPct = isPercentField(k);
          return {
            key: k,
            renderAs: (isPct ? 'line' : (i === 0 ? 'bar' : 'line')) as 'bar' | 'line' | 'area',
            yAxisId: (hasDualAxis ? (isPct ? 'right' : 'left') : 'left') as 'left' | 'right',
          };
        });
        const hasDual = seriesConfig.some((s) => s.yAxisId === 'right');

        return (
          <ComposedChart data={chartData} margin={{ bottom: 60, right: hasDual ? 20 : 5 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis yAxisId="left" {...yAxisProps} />
            {hasDual && <YAxis yAxisId="right" orientation="right" {...yAxisProps}
              tickFormatter={(v) => `${v}%`} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {referenceLine && (
              <RLine yAxisId="left" y={referenceLine.value}
                stroke={referenceLine.color || '#ef4444'} strokeDasharray="5 5"
                label={{ value: referenceLine.label || '', position: 'insideTopRight', fontSize: 11 }} />
            )}
            {seriesConfig.map((s, i) => {
              const color = colors[i % colors.length];
              const axisId = s.yAxisId || 'left';
              switch (s.renderAs) {
                case 'area':
                  return <Area key={s.key} type="monotone" dataKey={s.key} yAxisId={axisId}
                    stroke={color} fill={color} fillOpacity={0.15} />;
                case 'line':
                  return <Line key={s.key} type="monotone" dataKey={s.key} yAxisId={axisId}
                    stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />;
                default:
                  return <Bar key={s.key} dataKey={s.key} yAxisId={axisId}
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
            {activeYKeys.map((f, i) => (
              <Radar key={f} name={f} dataKey={f} stroke={colors[i % colors.length]}
                fill={colors[i % colors.length]} fillOpacity={0.2} strokeWidth={2} />
            ))}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Tooltip formatter={fmtTooltip} />
          </RadarChart>
        );
      }

      // ═══ RADIAL BAR ═══
      case 'radial_bar': {
        const rbData = chartData.map((r, i) => ({
          name: String(r[xKey]), value: Number(r[yKey]) || 0, fill: colors[i % colors.length],
        }));
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
          name: String(r[xKey]), size: Number(r[yKey]) || 0, fill: colors[i % colors.length],
        }));
        return (
          <Treemap data={tmData} dataKey="size" nameKey="name" aspectRatio={4 / 3}
            stroke="#fff" fill={colors[0]}>
            {tmData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
            <Tooltip formatter={fmtTooltip} />
          </Treemap>
        );
      }

      // ═══ FUNNEL (using horizontal stacked bar as visual) ═══
      case 'funnel': {
        const sorted = [...chartData].sort((a, b) => Number(b[yKey]) - Number(a[yKey]));
        return (
          <BarChart data={sorted} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} />
            <YAxis type="category" dataKey={xKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95} />
            <Tooltip formatter={fmtTooltip} />
            <Bar dataKey={yKey} radius={[0, 4, 4, 0]}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} opacity={0.9 - i * 0.05} />
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
          return { name: String(row[xKey]), value: [start, cumulative], rawValue: value };
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
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        );
    }
  };

  // ─── Height ───
  const heightMap: Record<string, number> = {
    radar: 400, radial_bar: 400, treemap: 350,
  };
  let chartHeight = heightMap[chartType] || 320;
  if (isVertical || chartType === 'funnel') chartHeight = Math.max(300, chartData.length * 35);
  else if (chartData.length > 8) chartHeight = 400;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      {renderChart()}
    </ResponsiveContainer>
  );
}
