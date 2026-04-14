'use client';

import React from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ComposedChart, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap, Brush, ReferenceLine as RLine, ReferenceArea as RArea, ReferenceDot as RDot,
  RadialBarChart, RadialBar, ZAxis,
  FunnelChart, Funnel, LabelList,
  Sankey, SunburstChart,
} from 'recharts';
import { ChartBlock, ChartOptions } from '@/types/types';
import { CHART_COLOR_POOL } from '@/lib/colors';

const COLOR_POOL = CHART_COLOR_POOL;

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

function parseLooseNumber(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (!text) return null;

  // Handle accounting negatives: (1234) => -1234
  let isNegative = false;
  const parenMatch = text.match(/^\((.*)\)$/);
  if (parenMatch) {
    isNegative = true;
    text = parenMatch[1].trim();
  }

  // Support for K/M/B suffixes (case-insensitive)
  let multiplier = 1;
  const suffixMatch = text.match(/([0-9.,]+)\s*([kmb])\b/i);
  if (suffixMatch) {
    const rawNumPart = suffixMatch[1];
    const suffix = suffixMatch[2].toLowerCase();
    if (suffix === 'k') multiplier = 1e3;
    else if (suffix === 'm') multiplier = 1e6;
    else if (suffix === 'b') multiplier = 1e9;
    text = rawNumPart;
  }

  // Strip common currency/percent symbols and whitespace.
  let cleaned = text.replace(/[%₫$]/g, '').replace(/\s+/g, '');
  if (!cleaned) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  let normalized = cleaned;
  if (lastDot !== -1 && lastComma !== -1) {
    // Decide decimal separator by last occurrence.
    if (lastComma > lastDot) {
      // 1.234,56 -> 1234.56
      normalized = cleaned.replace(/\./g, '').replace(/,/g, '.');
    } else {
      // 1,234.56 -> 1234.56
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (lastDot !== -1) {
    // Vietnamese thousands (17.701.000) vs Decimal (123.45)
    // If it's 1-3 digits followed by groups of exactly 3 dots (e.g. 1.234 or 1.234.567)
    if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/\./g, '');
    }
  } else if (lastComma !== -1) {
    // US thousands (1,234,567) or Decimal comma (12,34)
    if (/^-?\d{1,3}(,\d{3})+$/.test(cleaned)) {
      normalized = cleaned.replace(/,/g, '');
    } else {
      // Decimal comma: 12,34 -> 12.34
      normalized = cleaned.replace(/,/g, '.');
    }
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return isNegative ? -(num * multiplier) : (num * multiplier);
}

function buildChartData(columns: string[], rows: Array<Array<string | number>>): Row[] {
  return rows.map((row) => {
    const obj: Row = {};
    columns.forEach((col, i) => {
      const val = row[i];
      const num = parseLooseNumber(val);
      obj[col] = num === null ? String(val ?? '') : num;
    });
    return obj;
  });
}

function ensureCountMetric(data: Row[], xKey: string): Row[] {
  const grouped = new Map<string, number>();
  data.forEach((row) => {
    const key = String(row[xKey] ?? '');
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });
  return Array.from(grouped.entries()).map(([key, count]) => ({
    [xKey]: key,
    __count__: count,
  }));
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
  if (data.length === 0) return [];
  const availableKeys = Object.keys(data[0]);

  if (yKeys && yKeys.length > 0) {
    const valid = yKeys.map(k => {
      // 1. Exact match
      if (k in data[0]) return k;
      // 2. Case-insensitive match
      const lowerK = k.toLowerCase().trim();
      const found = availableKeys.find(ak => ak.toLowerCase().trim() === lowerK);
      if (found) return found;
      // 3. Normalized match (remove underscores/spaces)
      const normK = lowerK.replace(/[_\s-]+/g, '');
      const foundNorm = availableKeys.find(ak => ak.toLowerCase().replace(/[_\s-]+/g, '') === normK);
      return foundNorm || null;
    }).filter((k): k is string => k !== null);

    if (valid.length > 0) return valid;
  }
  
  // Fallback: detect numeric columns automatically
  return availableKeys.filter((k) => k !== xKey && typeof data[0][k] === 'number');
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

function inferPrimaryMetricKey(data: Row[], xKey: string, hintText: string, candidates: string[]): string | undefined {
  if (!data.length) return undefined;
  const hint = hintText.toLowerCase();

  const wantsLoss = /(mất|giảm|sụt|tụt|âm|negative|decrease|drop|loss)/i.test(hint);
  const wantsGrowth = /(tăng trưởng|growth|rate|tỷ lệ|percent|pct|ratio|margin)/i.test(hint);
  const mentionsRevenue = /(doanh thu|revenue|rev|sales|gmv|mrr|arr)/i.test(hint);

  const keyBonus = (key: string) => {
    let bonus = 0;
    const k = key.toLowerCase();
    if (mentionsRevenue && /(rev|revenue|sales|gmv|mrr|arr)/i.test(k)) bonus += 3;
    if (wantsLoss && /(delta|diff|change|gap|loss|drop|decrease|neg|growth|rate)/i.test(k)) bonus += 3;
    if (wantsGrowth && /(growth|rate|pct|percent|ratio|margin)/i.test(k)) bonus += 3;
    return bonus;
  };

  const scoreKey = (key: string) => {
    const values = data.map((r) => Number(r[key])).filter((v) => Number.isFinite(v));
    if (values.length === 0) return -Infinity;

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = Math.abs(max - min);
    const absSum = values.reduce((s, v) => s + Math.abs(v), 0);
    const negCount = values.filter((v) => v < 0).length;
    const negRatio = negCount / values.length;

    // Prefer informative metrics.
    let score = Math.log10(absSum + 1) + Math.log10(range + 1);
    // If we're talking about loss, prefer metrics with negatives.
    if (wantsLoss) score += negRatio * 4;
    // If growth/percent, prefer bounded values.
    if (wantsGrowth) {
      const bounded = values.filter((v) => Math.abs(v) <= 1.5 || Math.abs(v) <= 150).length / values.length;
      score += bounded * 2;
    }

    score += keyBonus(key);
    // Never pick the xKey.
    if (key === xKey) score = -Infinity;
    return score;
  };

  const sorted = [...candidates].sort((a, b) => scoreKey(b) - scoreKey(a));
  return sorted[0];
}

function extractTopN(hintText: string): number | undefined {
  const hint = hintText.toLowerCase();
  const m = hint.match(/\btop\s*(\d{1,3})\b/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n <= 200) return n;
  }
  return undefined;
}

function inferSunburstDataFromTable(chartData: Row[], columns: string[], valueKey?: string) {
  if (!chartData.length || columns.length < 2) return null;

  const numericKey = valueKey && typeof chartData[0]?.[valueKey] === 'number'
    ? valueKey
    : columns.find((c) => typeof chartData[0]?.[c] === 'number');
  if (!numericKey) return null;

  const stringCols = columns.filter((c) => c !== numericKey && typeof chartData[0]?.[c] !== 'number');
  if (stringCols.length === 0) return null;

  // Prefer a single "path" column with separators.
  const pathCol = stringCols.find((c) => {
    const sample = String(chartData[0]?.[c] ?? '');
    return sample.includes('/') || sample.includes('>') || sample.includes('→');
  });

  const root: any = { name: 'root', children: [] as any[] };
  const getOrCreateChild = (node: any, name: string) => {
    let child = node.children?.find((c: any) => c.name === name);
    if (!child) {
      child = { name, children: [] as any[], value: 0 };
      node.children.push(child);
    }
    return child;
  };

  const addPath = (parts: string[], value: number) => {
    let node = root;
    for (const partRaw of parts) {
      const part = String(partRaw || '').trim();
      if (!part) continue;
      node = getOrCreateChild(node, part);
      node.value = (Number(node.value) || 0) + value;
    }
  };

  chartData.forEach((row) => {
    const value = Number(row[numericKey]) || 0;
    if (pathCol) {
      const raw = String(row[pathCol] ?? '');
      const parts = raw.split(/\/|>|→/g).map((p) => p.trim()).filter(Boolean);
      if (parts.length) addPath(parts, value);
      return;
    }

    // Otherwise: use up to 4 level columns.
    const levelCols = stringCols.slice(0, 4);
    const parts = levelCols.map((c) => String(row[c] ?? '').trim()).filter(Boolean);
    if (parts.length) addPath(parts, value);
  });

  // Clean: collapse nodes with no children into leaf nodes (remove empty children array).
  const cleanup = (node: any) => {
    if (!node.children || node.children.length === 0) {
      delete node.children;
      return;
    }
    node.children.forEach(cleanup);
  };
  cleanup(root);

  return root;
}

function chooseSortOrder(hintText: string, values: number[]): 'asc' | 'desc' {
  const hint = hintText.toLowerCase();
  if (/(thấp nhất|bottom|nhỏ nhất|ít nhất|lowest|smallest|minimum)/i.test(hint)) return 'asc';

  const wantsLoss = /(mất|giảm|sụt|tụt|âm|negative|decrease|drop|loss)/i.test(hint);
  if (wantsLoss) {
    const hasNegative = values.some((v) => v < 0);
    return hasNegative ? 'asc' : 'desc';
  }

  if (/(top|cao nhất|lớn nhất|nhiều nhất|highest|largest|maximum)/i.test(hint)) return 'desc';
  return 'desc';
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

// ─── Pie data helper (shared by pie/donut/half_pie) ───
const MAX_PIE_SLICES = 7;
function buildPieData(chartData: Row[], xKey: string, yKey: string) {
  const raw = chartData
    .map((r) => ({ name: String(r[xKey]), value: Number(r[yKey]) || 0 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  if (raw.length <= MAX_PIE_SLICES) return raw;
  const top = raw.slice(0, MAX_PIE_SLICES - 1);
  const rest = raw.slice(MAX_PIE_SLICES - 1);
  return [...top, { name: `Khác (${rest.length})`, value: rest.reduce((s, d) => s + d.value, 0) }];
}

// ─── Main Component ───
export default function DynamicChart({ block, columns, rows }: DynamicChartProps) {
  const { xKey, options, series, referenceLine, config: transformConfig } = block;
  const hintText = `${block.title || ''} ${block.purpose || ''}`.trim();

  // ─── Normalize chartType: map truly unknown aliases to a known type ───
  const rawChartType = String((block as unknown as { chartType?: string }).chartType || 'bar').toLowerCase().trim().replace(/[\s-]+/g, '_');
  const opts = { ...(options || {}) };

  const normalizeChartType = (raw: string): string => {
    // All known types that have their own switch case — pass through directly
    const knownTypes = new Set([
      'bar', 'line', 'area', 'pie', 'scatter', 'composed', 'radar', 'radial_bar',
      'treemap', 'funnel', 'waterfall', 'sankey', 'sunburst',
      // Bar variants
      'horizontal_bar', 'stacked_bar', 'grouped_bar', 'normalized_bar',
      'positive_negative_bar', 'stacked_by_sign', 'population_pyramid',
      'ranged_bar', 'timeline_bar', 'tiny_bar', 'multi_x_axis',
      // Pie variants
      'donut', 'half_pie', 'two_level_pie', 'needle_gauge', 'gradient_pie',
      // Scatter variants
      'bubble', 'joint_line_scatter', 'multi_scatter',
      // Area variants
      'stacked_area', 'normalized_area', 'fill_by_value_area',
      // Line variants
      'step_line', 'sparkline', 'vertical_line',
      // Composed variants
      'vertical_composed', 'banded_chart', 'target_chart', 'scatter_line',
      // Other
      'gauge', 'nested_treemap', 'candlestick', 'box_plot',
    ]);
    if (knownTypes.has(raw)) return raw;

    // ─── Aliases → known types ───
    // Bar
    if (/bar.?horizontal|hbar/.test(raw)) return 'horizontal_bar';
    if (/bar.?stacked/.test(raw)) return 'stacked_bar';
    if (/bar.?grouped|clustered/.test(raw)) return 'grouped_bar';
    if (/percent.?bar|100.?bar|bar.?normalized/.test(raw)) return 'normalized_bar';
    if (/pos.*neg.*bar|neg.*pos.*bar|diverging.?bar/.test(raw)) return 'positive_negative_bar';
    if (/stacked.*sign|sign.*stack/.test(raw)) return 'stacked_by_sign';
    if (/pyramid|mirror.*bar|butterfly/.test(raw)) return 'population_pyramid';
    if (/column/.test(raw)) return 'bar';
    // Line
    if (/stepped/.test(raw)) return 'step_line';
    if (/spark/.test(raw)) return 'sparkline';
    if (/vertical.?line/.test(raw)) return 'vertical_line';
    if (/multi.?line|dual.?line|biaxial.?line/.test(raw)) { opts.dualAxis = true; return 'line'; }
    // Area
    if (/area.?stacked/.test(raw)) return 'stacked_area';
    if (/percent.?area|100.?area|area.?normalized|stream|streamgraph/.test(raw)) return 'normalized_area';
    if (/gradient.?area/.test(raw)) { opts.gradient = true; return 'area'; }
    if (/fill.?by.?value|split.?area|pos.?neg.?area/.test(raw)) return 'fill_by_value_area';
    // Pie
    if (/doughnut|ring/.test(raw)) return 'donut';
    if (/semi.?circle|semi.?pie/.test(raw)) return 'half_pie';
    if (/two.?level|concentric|nested.?pie|multi.?ring/.test(raw)) return 'two_level_pie';
    if (/needle|dial/.test(raw)) return 'needle_gauge';
    if (/rose|nightingale/.test(raw)) return 'pie';
    // Scatter
    if (/joint.?line|connected.?scatter|line.?scatter/.test(raw)) return 'joint_line_scatter';
    if (/multi.?scatter|multi.?y.?scatter/.test(raw)) return 'multi_scatter';
    if (/scatter.?line|best.?fit|regression|trend.?line/.test(raw)) return 'scatter_line';
    if (/bubble/.test(raw)) return 'bubble';
    // Composed
    if (/vertical.?composed/.test(raw)) return 'vertical_composed';
    if (/banded|confidence|band.?chart/.test(raw)) return 'banded_chart';
    if (/target.?price|target.?chart/.test(raw)) return 'target_chart';
    if (/mixed|combo|combined|bar.?line|line.?bar|pareto/.test(raw)) return 'composed';
    if (/biaxial.?bar/.test(raw)) { opts.dualAxis = true; return 'bar'; }
    // Bar extra
    if (/ranged|range.?bar/.test(raw)) return 'ranged_bar';
    if (/timeline|gantt/.test(raw)) return 'timeline_bar';
    if (/tiny.?bar|mini.?bar/.test(raw)) return 'tiny_bar';
    if (/multi.?x|dual.?x|two.?x/.test(raw)) return 'multi_x_axis';
    if (/candle|ohlc|stock/.test(raw)) return 'candlestick';
    if (/box.?plot|box.?whisker|quartile/.test(raw)) return 'box_plot';
    // Pie extra
    if (/gradient.?pie|pie.?gradient/.test(raw)) return 'gradient_pie';
    // Polar
    if (/spider|polar/.test(raw)) return 'radar';
    if (/meter|speedometer|progress.?ring|circular.?bar/.test(raw)) return 'gauge';
    if (/radial/.test(raw)) return 'radial_bar';
    // Tree/Flow
    if (/nested.?tree/.test(raw)) return 'nested_treemap';
    if (/heatmap|heat.?map|matrix/.test(raw)) return 'treemap';
    if (/flow|alluvial/.test(raw)) return 'sankey';
    if (/hierarchy|hierarchical|tree.?chart|drill.?down/.test(raw)) return 'sunburst';

    return 'bar';
  };

  const chartType = normalizeChartType(rawChartType);
  // Build & transform data
  const actualRows = normalizeBlockRows(block, rows);
  let chartData = buildChartData(columns, actualRows);
  if (chartData.length === 0) return null;

  const resolvedXKey = (() => {
    if (xKey && chartData.length > 0 && xKey in chartData[0]) return xKey;
    const nonNumeric = columns.find((c) => {
      const v = chartData[0]?.[c];
      return typeof v !== 'number';
    });
    return nonNumeric || columns[0] || xKey;
  })();

  let pivotedCategories: string[] | null = null;

  // Pivot if color_field
  if (transformConfig?.color_field && transformConfig.x_field && transformConfig.y_fields?.length === 1) {
    const piv = pivotData(chartData, transformConfig.x_field, transformConfig.color_field, transformConfig.y_fields[0]);
    chartData = piv.data;
    pivotedCategories = piv.categories;
  } else if (transformConfig) {
    chartData = aggregateData(chartData, transformConfig);
  }

  let yKeys = pivotedCategories || resolveYKeys(chartData, resolvedXKey, block.yKeys);
  if (yKeys.length === 0 && xKey) {
    chartData = ensureCountMetric(chartData, resolvedXKey);
    yKeys = ['__count__'];
  }

  const numericCandidates = chartData.length > 0
    ? Object.keys(chartData[0]).filter((k) => k !== resolvedXKey && typeof chartData[0][k] === 'number')
    : [];
  const primaryMetricKey = inferPrimaryMetricKey(chartData, resolvedXKey, hintText, numericCandidates.length ? numericCandidates : yKeys) || yKeys[0];

  const maxSeries = typeof opts.maxSeries === 'number' && opts.maxSeries > 0 ? opts.maxSeries : 8;
  const activeYKeysBase = selectTopYKeys(chartData, yKeys, maxSeries);
  const activeYKeys = (chartType === 'bar' && !opts.stacked && primaryMetricKey && activeYKeysBase.length <= 1)
    ? [primaryMetricKey]
    : activeYKeysBase;
  if (activeYKeys.length === 0 && !['pie', 'treemap', 'funnel', 'radial_bar', 'sankey', 'sunburst'].includes(chartType)) {
    console.warn('[DynamicChart] No numeric yKeys found to plot. block.yKeys:', block.yKeys, 'available:', Object.keys(chartData[0] || {}).map(k => `${k}(${typeof chartData[0][k]})`));
    return null;
  }
  const yKey = activeYKeys[0] || block.yKey || '';

  // Auto sort + topN when LLM didn't provide transform sort/limit.
  if (!transformConfig?.sort_by && yKey && (chartType === 'bar' || chartType === 'line' || chartType === 'area' || chartType === 'composed')) {
    const values = chartData.map((r) => Number(r[yKey])).filter((v) => Number.isFinite(v));
    const order = chooseSortOrder(hintText, values);
    chartData = [...chartData].sort((a, b) => {
      const av = Number(a[yKey]) || 0;
      const bv = Number(b[yKey]) || 0;
      return order === 'asc' ? av - bv : bv - av;
    });
  }
  if (!transformConfig?.limit) {
    const topN = extractTopN(hintText);
    if (topN && chartData.length > topN) {
      chartData = chartData.slice(0, topN);
    }
  }

  // Common props
  const xAxisProps = {
    dataKey: resolvedXKey,
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
  // Default: disable brush selection unless explicitly enabled by LLM (and only when it adds value).
  const showBrush = opts.brush === true && chartData.length > 18;
  const isStacked = opts.stacked;
  const isPercent = opts.stackOffset === 'expand';
  const isVertical = opts.layout === 'vertical';
  const showValueLabels = opts.valueLabels === true;
  const showBackground = opts.background === true;
  const curveType = opts.curveType || 'monotone';

  const renderBrush = () => (
    <Brush
      dataKey={resolvedXKey}
      height={18}
      travellerWidth={10}
      stroke="#94a3b8"
      fill="#eef2ff"
      tickFormatter={() => ''}
    />
  );

  const xLabelMaxLen = chartData.reduce((max, row) => {
    const raw = row?.[resolvedXKey];
    const len = String(raw ?? '').length;
    return Math.max(max, len);
  }, 0);

  const xAxisTickAngle = typeof opts.xAxisAngle === 'number'
    ? opts.xAxisAngle
    : xLabelMaxLen > 10 || chartData.length > 10
      ? -35
      : 0;
  const xAxisTickHeight = xAxisTickAngle ? 70 : 44;
  const barMargin = {
    top: showValueLabels ? 22 : 12,
    right: 12,
    left: 8,
    bottom: xAxisTickAngle ? 40 : 22,
  };

  // ─── Reference overlays (shared across cartesian charts) ───
  const renderReferenceOverlays = (yAxisId?: string) => (
    <>
      {opts.referenceLines?.map((rl, i) => (
        <RLine key={`rl-${i}`} yAxisId={yAxisId}
          {...(rl.axis === 'x' ? { x: rl.value } : { y: rl.value })}
          stroke={rl.color || '#ef4444'} strokeDasharray="5 5"
          label={rl.label ? { value: rl.label, position: 'insideTopRight', fontSize: 11 } : undefined} />
      ))}
      {opts.referenceAreas?.map((ra, i) => (
        <RArea key={`ra-${i}`} x1={ra.x1} x2={ra.x2} y1={ra.y1} y2={ra.y2}
          fill={ra.color || '#6366f1'} fillOpacity={ra.opacity ?? 0.1}
          label={ra.label ? { value: ra.label, fontSize: 11 } : undefined} />
      ))}
      {opts.referenceDots?.map((rd, i) => (
        <RDot key={`rd-${i}`} x={rd.x} y={rd.y} r={rd.radius || 5}
          fill={rd.color || '#ef4444'} stroke="none"
          label={rd.label ? { value: rd.label, fontSize: 10 } : undefined} />
      ))}
    </>
  );

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
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 10, right: 12, bottom: 10, left: 100 }}
              stackOffset={isPercent ? 'expand' : undefined}
            >
              <CartesianGrid {...gridProps} />
              <XAxis type="number" {...yAxisProps} tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
              <YAxis type="category" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95}
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
          <BarChart data={chartData} margin={barMargin} stackOffset={isPercent ? 'expand' : undefined}>
            <CartesianGrid {...gridProps} />
            <XAxis
              {...xAxisProps}
              angle={xAxisTickAngle}
              textAnchor={xAxisTickAngle ? 'end' : 'middle'}
              height={xAxisTickHeight}
            />
            <YAxis yAxisId={hasDualAxis ? 'left' : undefined} {...yAxisProps}
              tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
            {hasDualAxis && <YAxis yAxisId="right" orientation="right" {...yAxisProps}
              tickFormatter={(v) => `${v}%`} />}
            <Tooltip formatter={fmtTooltip} />
            {!isCategorical && (
              <Legend
                verticalAlign={showBrush ? 'top' : 'bottom'}
                height={showBrush ? 28 : undefined}
                wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
              />
            )}
            {referenceLine && (
              <RLine yAxisId={hasDualAxis ? 'left' : undefined} y={referenceLine.value}
                stroke={referenceLine.color || '#ef4444'} strokeDasharray="5 5"
                label={{ value: referenceLine.label || '', position: 'insideTopRight', fontSize: 11 }} />
            )}
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]}
                yAxisId={hasDualAxis ? (i === 0 ? 'left' : 'right') : undefined}
                stackId={isStacked ? 'stack' : undefined}
                background={showBackground ? { fill: '#f1f5f9' } : undefined}
                radius={isStacked ? 0 : [4, 4, 0, 0]} opacity={0.9}>
                {isCategorical && chartData.map((_, di) => (
                  <Cell key={di} fill={colors[di % colors.length]} />
                ))}
                {showValueLabels && <LabelList dataKey={f} position="top" fill="#64748b" fontSize={10} />}
              </Bar>
            ))}
            {renderReferenceOverlays(hasDualAxis ? 'left' : undefined)}
            {showBrush && renderBrush()}
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
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
            {activeYKeys.map((f, i) => (
              <Line key={f} type={curveType} dataKey={f} stroke={colors[i % colors.length]}
                yAxisId={hasDualAxis ? (i === 0 ? 'left' : 'right') : undefined}
                strokeWidth={2.5} strokeDasharray={opts.dashed ? '8 4' : undefined}
                dot={opts.showDots !== false ? { r: 3, fill: '#fff', strokeWidth: 2 } : false}
                connectNulls={opts.connectNulls}
                activeDot={{ r: 5, strokeWidth: 0, fill: colors[i % colors.length] }}>
                {showValueLabels && <LabelList dataKey={f} position="top" fill="#64748b" fontSize={10} />}
              </Line>
            ))}
            {renderReferenceOverlays(hasDualAxis ? 'left' : undefined)}
            {showBrush && renderBrush()}
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
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
            {yKeys.map((f, i) => (
              <Area key={f} type={curveType} dataKey={f} stroke={colors[i % colors.length]}
                stackId={isStacked || isPercent ? '1' : undefined}
                connectNulls={opts.connectNulls}
                fill={opts.gradient !== false ? `url(#grad-${f}-${block.title})` : colors[i % colors.length]}
                fillOpacity={opts.gradient !== false ? 1 : 0.2} strokeWidth={2} />
            ))}
            {renderReferenceOverlays()}
            {showBrush && renderBrush()}
          </AreaChart>
        );
      }

      // ═══ PIE ═══
      case 'pie': {
        const pieData = buildPieData(chartData, xKey, yKey);
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
            <Scatter name={`${xF} vs ${yF}`} data={chartData} fill={colors[0]} opacity={0.8}
              line={opts.jointLine ? { stroke: colors[0], strokeWidth: 1.5 } : undefined}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
              {showValueLabels && <LabelList dataKey={yF} position="top" fill="#64748b" fontSize={10} />}
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
          <ComposedChart data={chartData} margin={{ top: showBrush ? 18 : 0, bottom: 60, right: hasDual ? 20 : 5 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis yAxisId="left" {...yAxisProps} />
            {hasDual && <YAxis yAxisId="right" orientation="right" {...yAxisProps}
              tickFormatter={(v) => `${v}%`} />}
            <Tooltip formatter={fmtTooltip} />
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
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
            {renderReferenceOverlays('left')}
            {showBrush && renderBrush()}
          </ComposedChart>
        );
      }

      // ═══ RADAR ═══
      case 'radar': {
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
            <PolarGrid stroke="#e2e8f0" />
            <PolarAngleAxis dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} />
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
        const funnelData = sorted.map((row, i) => ({
          name: String(row[resolvedXKey]),
          value: Number(row[yKey]) || 0,
          fill: colors[i % colors.length],
        }));
        return (
          <FunnelChart>
            <Tooltip formatter={fmtTooltip} />
            <Funnel dataKey="value" data={funnelData} isAnimationActive>
              <LabelList position="right" fill="#64748b" fontSize={11} dataKey="name" />
            </Funnel>
          </FunnelChart>
        );
      }

      // ═══ SANKEY ═══
      case 'sankey': {
        const maybeData = (block as unknown as { data?: any }).data;
        const tableColumns = columns;

        const lowerCols = tableColumns.map((c) => c.toLowerCase());
        const pickCol = (patterns: RegExp[]) => {
          const idx = lowerCols.findIndex((c) => patterns.some((p) => p.test(c)));
          return idx >= 0 ? tableColumns[idx] : undefined;
        };

        const sourceKey = pickCol([/^source$/, /from/, /src/]) || tableColumns[0];
        const targetKey = pickCol([/^target$/, /to/, /dst/]) || tableColumns[1] || tableColumns[0];
        const fallbackNumeric = tableColumns.find((c) => typeof chartData[0]?.[c] === 'number');
        const valueKey = pickCol([/^value$/, /amount/, /count/, /weight/, /volume/]) || yKey || fallbackNumeric || tableColumns[2] || tableColumns[0];

        const buildFromTable = () => {
          const nodeIndex = new Map<string, number>();
          const nodes: Array<{ name: string }> = [];
          const links: Array<{ source: number; target: number; value: number }> = [];

          chartData.forEach((row) => {
            const sName = String(row[sourceKey] ?? '');
            const tName = String(row[targetKey] ?? '');
            if (!sName || !tName) return;
            const v = Number(row[valueKey]) || 0;
            if (!nodeIndex.has(sName)) {
              nodeIndex.set(sName, nodes.length);
              nodes.push({ name: sName });
            }
            if (!nodeIndex.has(tName)) {
              nodeIndex.set(tName, nodes.length);
              nodes.push({ name: tName });
            }
            links.push({ source: nodeIndex.get(sName)!, target: nodeIndex.get(tName)!, value: v });
          });

          return { nodes, links };
        };

        const sankeyData = (maybeData && typeof maybeData === 'object' && maybeData.nodes && maybeData.links)
          ? maybeData
          : buildFromTable();

        return (
          <Sankey
            data={sankeyData}
            nodePadding={12}
            nodeWidth={12}
            linkCurvature={0.55}
          >
            <Tooltip formatter={fmtTooltip} />
          </Sankey>
        );
      }

      // ═══ SUNBURST ═══
      case 'sunburst': {
        const maybeData = (block as unknown as { data?: any }).data;
        const inferred = (!maybeData || typeof maybeData !== 'object')
          ? inferSunburstDataFromTable(chartData, columns, yKey)
          : null;
        const sunburstData = (maybeData && typeof maybeData === 'object') ? maybeData : inferred;
        if (!sunburstData) {
          return (
            <div className="text-[12px] text-slate-500 px-2 py-1">
              Sunburst cần dữ liệu phân cấp. Hãy để LLM trả `data`, hoặc trả bảng có cột path/level + cột value.
            </div>
          );
        }

        return (
          <SunburstChart data={sunburstData as any} responsive />
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

      // ═══ HORIZONTAL BAR ═══
      case 'horizontal_bar': {
        const isCategorical = activeYKeys.length === 1;
        return (
          <BarChart data={chartData} layout="vertical" margin={{ left: 100 }} stackOffset={isPercent ? 'expand' : undefined}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} tickFormatter={isPercent ? (v) => `${(v * 100).toFixed(0)}%` : smartFormat} />
            <YAxis type="category" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95}
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

      // ═══ STACKED BAR ═══
      case 'stacked_bar': {
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]}
                stackId="stack" radius={0} opacity={0.9} />
            ))}
            {showBrush && renderBrush()}
          </BarChart>
        );
      }

      // ═══ GROUPED BAR ═══
      case 'grouped_bar': {
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]}
                radius={[4, 4, 0, 0]} opacity={0.9} />
            ))}
            {showBrush && renderBrush()}
          </BarChart>
        );
      }

      // ═══ NORMALIZED BAR (100% stacked) ═══
      case 'normalized_bar': {
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }} stackOffset="expand">
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]}
                stackId="stack" radius={0} opacity={0.9} />
            ))}
          </BarChart>
        );
      }

      // ═══ DONUT ═══
      case 'donut': {
        const pieData = buildPieData(chartData, xKey, yKey);
        return (
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%"
              innerRadius="55%" outerRadius="75%"
              paddingAngle={3} dataKey="value"
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

      // ═══ HALF PIE (semi-circle) ═══
      case 'half_pie': {
        const pieData = buildPieData(chartData, xKey, yKey);
        const inner = opts.innerRadius || 0;
        return (
          <PieChart>
            <Pie data={pieData} cx="50%" cy="80%"
              innerRadius={inner} outerRadius="90%"
              startAngle={180} endAngle={0}
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

      // ═══ BUBBLE (scatter + ZAxis sizing) ═══
      case 'bubble': {
        const xF = activeYKeys[0] || xKey;
        const yF = activeYKeys[1] || activeYKeys[0];
        const zF = opts.zField || activeYKeys[2];
        return (
          <ScatterChart>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xF} name={xF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <YAxis dataKey={yF} name={yF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            {zF && <ZAxis dataKey={zF} name={zF} range={[40, 600]} />}
            <Tooltip formatter={fmtTooltip} cursor={{ strokeDasharray: '3 3' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Scatter name={`${xF} vs ${yF}${zF ? ` (size: ${zF})` : ''}`} data={chartData} fill={colors[0]} opacity={0.7}>
              {chartData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Scatter>
          </ScatterChart>
        );
      }

      // ═══ STACKED AREA ═══
      case 'stacked_area': {
        return (
          <AreaChart data={chartData}>
            <defs>
              {activeYKeys.map((f, i) => (
                <linearGradient key={f} id={`grad-sa-${f}-${block.title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
            {activeYKeys.map((f, i) => (
              <Area key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]}
                stackId="1" fill={`url(#grad-sa-${f}-${block.title})`} fillOpacity={1} strokeWidth={2} />
            ))}
            {showBrush && renderBrush()}
          </AreaChart>
        );
      }

      // ═══ NORMALIZED AREA (100% stacked) ═══
      case 'normalized_area': {
        return (
          <AreaChart data={chartData} stackOffset="expand">
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip formatter={(v) => `${(Number(v) * 100).toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activeYKeys.map((f, i) => (
              <Area key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]}
                stackId="1" fill={colors[i % colors.length]} fillOpacity={0.6} strokeWidth={2} />
            ))}
          </AreaChart>
        );
      }

      // ═══ STEP LINE ═══
      case 'step_line': {
        return (
          <LineChart data={chartData}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend
              verticalAlign={showBrush ? 'top' : 'bottom'}
              height={showBrush ? 28 : undefined}
              wrapperStyle={{ fontSize: 12, paddingBottom: showBrush ? 6 : undefined }}
            />
            {activeYKeys.map((f, i) => (
              <Line key={f} type="stepAfter" dataKey={f} stroke={colors[i % colors.length]}
                strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }}
                activeDot={{ r: 5, strokeWidth: 0, fill: colors[i % colors.length] }} />
            ))}
            {showBrush && renderBrush()}
          </LineChart>
        );
      }

      // ═══ SPARKLINE (minimal line, no axes/grid/legend) ═══
      case 'sparkline': {
        return (
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            {activeYKeys.map((f, i) => (
              <Line key={f} type="monotone" dataKey={f} stroke={colors[i % colors.length]}
                strokeWidth={2} dot={false} />
            ))}
            <Tooltip formatter={fmtTooltip} />
          </LineChart>
        );
      }

      // ═══ GAUGE (semi-circle radial bar) ═══
      case 'gauge': {
        const gaugeData = chartData.slice(0, 5).map((r, i) => ({
          name: String(r[xKey]), value: Number(r[yKey]) || 0, fill: colors[i % colors.length],
        }));
        return (
          <RadialBarChart cx="50%" cy="70%" innerRadius="30%" outerRadius="90%" barSize={16}
            startAngle={180} endAngle={0} data={gaugeData}>
            <RadialBar dataKey="value" background={{ fill: '#f1f5f9' }} cornerRadius={8}
              label={{ position: 'insideStart', fill: '#475569', fontSize: 11 }} />
            <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right"
              wrapperStyle={{ fontSize: 11 }} />
            <Tooltip formatter={fmtTooltip} />
          </RadialBarChart>
        );
      }

      // ═══ POSITIVE NEGATIVE BAR ═══
      case 'positive_negative_bar': {
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <RLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            {activeYKeys.map((f) => (
              <Bar key={f} dataKey={f} radius={[4, 4, 0, 0]}>
                {chartData.map((row, i) => (
                  <Cell key={i} fill={Number(row[f]) >= 0 ? (opts.positiveColor || '#10b981') : (opts.negativeColor || '#ef4444')} />
                ))}
                {showValueLabels && <LabelList dataKey={f} position="top" fill="#64748b" fontSize={10} />}
              </Bar>
            ))}
          </BarChart>
        );
      }

      // ═══ STACKED BY SIGN ═══
      case 'stacked_by_sign': {
        return (
          <BarChart data={chartData} margin={{ bottom: 60 }} stackOffset="sign">
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <RLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]} stackId="stack" />
            ))}
          </BarChart>
        );
      }

      // ═══ POPULATION PYRAMID (mirrored horizontal bars) ═══
      case 'population_pyramid': {
        const leftKey = activeYKeys[0] || yKey;
        const rightKey = activeYKeys[1] || activeYKeys[0];
        const pyramidData = chartData.map((row) => ({
          ...row,
          [`__neg_${leftKey}`]: -(Number(row[leftKey]) || 0),
        }));
        return (
          <BarChart data={pyramidData} layout="vertical" stackOffset="sign"
            margin={{ left: 80 }} barCategoryGap={1}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps}
              tickFormatter={(v) => smartFormat(Math.abs(v))} />
            <YAxis type="category" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} width={75}
              tickFormatter={(v) => shortenLabel(v, 12)} />
            <Tooltip formatter={(v) => fmtTooltip(Math.abs(Number(v)))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={`__neg_${leftKey}`} name={leftKey} fill={colors[0]} stackId="stack" radius={[4, 0, 0, 4]} />
            <Bar dataKey={rightKey} fill={colors[1]} stackId="stack" radius={[0, 4, 4, 0]} />
          </BarChart>
        );
      }

      // ═══ TWO LEVEL PIE (concentric rings) ═══
      case 'two_level_pie': {
        const outerData = buildPieData(chartData, xKey, yKey);
        const innerKey = activeYKeys[1] || activeYKeys[0];
        const innerData = innerKey !== yKey
          ? buildPieData(chartData, xKey, innerKey)
          : outerData.slice(0, Math.min(4, outerData.length));
        return (
          <PieChart>
            <Pie data={innerData} cx="50%" cy="50%" outerRadius="40%" fill={colors[0]}
              dataKey="value" isAnimationActive={false}>
              {innerData.map((_, i) => (
                <Cell key={i} fill={colors[(i + 2) % colors.length]} opacity={0.7} />
              ))}
            </Pie>
            <Pie data={outerData} cx="50%" cy="50%" innerRadius="48%" outerRadius="75%"
              dataKey="value" paddingAngle={2}
              label={({ name, percent }) => `${shortenLabel(String(name ?? ''), 12)} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#94a3b8' }} fontSize={11}>
              {outerData.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} opacity={0.9} />
              ))}
            </Pie>
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        );
      }

      // ═══ NEEDLE GAUGE (pie with needle indicator) ═══
      case 'needle_gauge': {
        const gaugeValue = Number(chartData[0]?.[yKey]) || 0;
        const maxVal = Math.max(...chartData.map((r) => Number(r[yKey]) || 0), gaugeValue * 1.2);
        const angleRange = 180;
        const needleAngle = 180 - (gaugeValue / maxVal) * angleRange;
        const needleLen = 0.65;
        const RADIAN = Math.PI / 180;
        const cx = 200, cy = 180, or = 140;
        const nx = cx + or * needleLen * Math.cos(-RADIAN * needleAngle);
        const ny = cy + or * needleLen * Math.sin(-RADIAN * needleAngle);
        const arcData = [
          { name: 'value', value: gaugeValue, fill: colors[0] },
          { name: 'remainder', value: Math.max(0, maxVal - gaugeValue), fill: '#e2e8f0' },
        ];
        return (
          <PieChart width={400} height={240}>
            <Pie data={arcData} cx={cx} cy={cy} startAngle={180} endAngle={0}
              innerRadius={80} outerRadius={or} dataKey="value" stroke="none">
              {arcData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <text x={cx} y={cy + 20} textAnchor="middle" fill="#334155" fontSize={22} fontWeight="bold">
              {smartFormat(gaugeValue)}
            </text>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#334155" strokeWidth={3} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={6} fill="#334155" />
          </PieChart>
        );
      }

      // ═══ JOINT LINE SCATTER (scatter with connecting lines) ═══
      case 'joint_line_scatter': {
        const xF = activeYKeys[0] || xKey;
        const yF = activeYKeys[1] || activeYKeys[0];
        const zF = opts.zField;
        return (
          <ScatterChart>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xF} name={xF} type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <YAxis dataKey={yF} name={yF} type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            {zF && <ZAxis dataKey={zF} name={zF} range={[40, 400]} />}
            <Tooltip formatter={fmtTooltip} cursor={{ strokeDasharray: '3 3' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Scatter name={`${xF} vs ${yF}`} data={chartData} fill={colors[0]}
              line={{ stroke: colors[0], strokeWidth: 1.5 }} lineJointType="monotoneX">
              {showValueLabels && <LabelList dataKey={yF} position="top" fill="#64748b" fontSize={10} />}
            </Scatter>
          </ScatterChart>
        );
      }

      // ═══ MULTI SCATTER (multiple scatter series with separate Y axes) ═══
      case 'multi_scatter': {
        const scatterKeys = activeYKeys.length >= 2 ? activeYKeys : [yKey];
        const xF = resolvedXKey;
        return (
          <ScatterChart>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xF} name={xF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            {scatterKeys.length > 1 && (
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            )}
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {scatterKeys.map((k, i) => (
              <Scatter key={k} name={k} data={chartData} fill={colors[i % colors.length]}
                yAxisId={i === 0 ? 'left' : 'right'} dataKey={k}>
                {showValueLabels && <LabelList dataKey={k} position="top" fill="#64748b" fontSize={10} />}
              </Scatter>
            ))}
          </ScatterChart>
        );
      }

      // ═══ FILL BY VALUE AREA (positive green / negative red) ═══
      case 'fill_by_value_area': {
        const gradId = `splitColor-${block.title}`;
        const posColor = opts.positiveColor || '#10b981';
        const negColor = opts.negativeColor || '#ef4444';
        // Compute zero-crossing offset for gradient
        const values = chartData.map((r) => Number(r[yKey]) || 0);
        const maxV = Math.max(...values, 0);
        const minV = Math.min(...values, 0);
        const range = maxV - minV || 1;
        const zeroOffset = maxV / range;
        return (
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={posColor} stopOpacity={0.6} />
                <stop offset={zeroOffset} stopColor={posColor} stopOpacity={0.1} />
                <stop offset={zeroOffset} stopColor={negColor} stopOpacity={0.1} />
                <stop offset={1} stopColor={negColor} stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <RLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
            <Area type={curveType} dataKey={yKey} stroke="#64748b" fill={`url(#${gradId})`}
              strokeWidth={2} connectNulls={opts.connectNulls} />
          </AreaChart>
        );
      }

      // ═══ VERTICAL LINE ═══
      case 'vertical_line': {
        return (
          <LineChart data={chartData} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} />
            <YAxis type="category" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} width={75}
              tickFormatter={(v) => shortenLabel(v, 12)} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activeYKeys.map((f, i) => (
              <Line key={f} type={curveType} dataKey={f} stroke={colors[i % colors.length]}
                strokeWidth={2.5} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
            ))}
          </LineChart>
        );
      }

      // ═══ SCATTER LINE (ComposedChart: scatter + line of best fit) ═══
      case 'scatter_line': {
        const xF = activeYKeys[0] || resolvedXKey;
        const yF = activeYKeys[1] || activeYKeys[0] || yKey;
        // Simple linear regression for trend line
        const points = chartData.map((r) => ({ x: Number(r[xF]) || 0, y: Number(r[yF]) || 0 }));
        const n = points.length;
        const sumX = points.reduce((s, p) => s + p.x, 0);
        const sumY = points.reduce((s, p) => s + p.y, 0);
        const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
        const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
        const slope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) : 0;
        const intercept = n > 0 ? (sumY - slope * sumX) / n : 0;
        const trendData = points.map((p) => ({ ...chartData[points.indexOf(p)], __trend__: slope * p.x + intercept }));
        return (
          <ComposedChart data={trendData}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey={xF} name={xF} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={smartFormat} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Scatter name={`${xF} vs ${yF}`} dataKey={yF} fill={colors[0]} />
            <Line name="Trend" type="linear" dataKey="__trend__" stroke={colors[1]}
              strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={false} legendType="none" />
          </ComposedChart>
        );
      }

      // ═══ NESTED TREEMAP (interactive drill-down) ═══
      case 'nested_treemap': {
        // Build hierarchical data if flat
        const tmGroups: Record<string, { name: string; children: Array<{ name: string; size: number; fill: string }> }> = {};
        const groupCol = columns.find((c) => c !== resolvedXKey && c !== yKey && typeof chartData[0]?.[c] !== 'number') || resolvedXKey;
        chartData.forEach((row, i) => {
          const group = String(row[groupCol] ?? 'Other');
          if (!tmGroups[group]) tmGroups[group] = { name: group, children: [] };
          tmGroups[group].children.push({
            name: String(row[resolvedXKey] ?? ''),
            size: Number(row[yKey]) || 0,
            fill: colors[i % colors.length],
          });
        });
        const nestedData = Object.values(tmGroups);
        return (
          <Treemap data={nestedData} dataKey="size" nameKey="name" aspectRatio={4 / 3}
            stroke="#fff" fill={colors[0]} type="nest" isAnimationActive>
            <Tooltip formatter={fmtTooltip} />
          </Treemap>
        );
      }

      // ═══ RANGED BAR (bars with [start, end] range values) ═══
      case 'ranged_bar': {
        const y1 = activeYKeys[0] || yKey;
        const y2 = activeYKeys[1] || activeYKeys[0];
        const rangedData = chartData.map((row) => ({
          ...row,
          __range__: [Number(row[y1]) || 0, Number(row[y2]) || 0],
        }));
        return (
          <BarChart data={rangedData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="__range__" name={`${y1} → ${y2}`} fill={colors[0]} radius={[4, 4, 0, 0]} opacity={0.85} />
          </BarChart>
        );
      }

      // ═══ TIMELINE BAR (horizontal gantt-like bars) ═══
      case 'timeline_bar': {
        const startKey = activeYKeys[0] || yKey;
        const endKey = activeYKeys[1] || activeYKeys[0];
        const tlData = chartData.map((row) => ({
          ...row,
          __range__: [Number(row[startKey]) || 0, Number(row[endKey]) || 0],
        }));
        return (
          <BarChart data={tlData} layout="vertical" margin={{ left: 100 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} />
            <YAxis type="category" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} width={95}
              tickFormatter={(v) => shortenLabel(v, 15)} />
            <Tooltip formatter={fmtTooltip} />
            <Bar dataKey="__range__" name={`${startKey} → ${endKey}`} fill={colors[0]} radius={[0, 4, 4, 0]} barSize={14}>
              {tlData.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Bar>
          </BarChart>
        );
      }

      // ═══ TINY BAR (minimal bar, no axes/grid like sparkline) ═══
      case 'tiny_bar': {
        return (
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            {activeYKeys.map((f, i) => (
              <Bar key={f} dataKey={f} fill={colors[i % colors.length]} radius={[2, 2, 0, 0]}>
                {chartData.map((_, di) => <Cell key={di} fill={colors[di % colors.length]} />)}
              </Bar>
            ))}
            <Tooltip formatter={fmtTooltip} />
          </BarChart>
        );
      }

      // ═══ MULTI X AXIS (bar chart with 2 X axes) ═══
      case 'multi_x_axis': {
        const x2Key = columns.find((c) => c !== resolvedXKey && typeof chartData[0]?.[c] !== 'number') || resolvedXKey;
        return (
          <BarChart data={chartData} margin={{ bottom: 80 }}>
            <CartesianGrid {...gridProps} />
            <XAxis xAxisId="0" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={(v) => shortenLabel(v)} />
            <XAxis xAxisId="1" dataKey={x2Key} tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickLine={false} axisLine={false} orientation="bottom" dy={25} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activeYKeys.map((f, i) => (
              <Bar key={f} xAxisId="0" dataKey={f} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} opacity={0.9} />
            ))}
          </BarChart>
        );
      }

      // ═══ CANDLESTICK (OHLC chart) ═══
      case 'candlestick': {
        // Expects columns: xKey, open, high, low, close (or first 4 numeric cols)
        const numCols = columns.filter((c) => c !== resolvedXKey && typeof chartData[0]?.[c] === 'number');
        const [openK, highK, lowK, closeK] = numCols.length >= 4
          ? numCols.slice(0, 4)
          : [numCols[0] || yKey, numCols[1] || yKey, numCols[2] || yKey, numCols[3] || yKey];
        const csData = chartData.map((row) => {
          const o = Number(row[openK]) || 0, h = Number(row[highK]) || 0;
          const l = Number(row[lowK]) || 0, c = Number(row[closeK]) || 0;
          return {
            name: String(row[resolvedXKey]),
            body: [Math.min(o, c), Math.max(o, c)],
            wick: [l, h],
            bullish: c >= o,
          };
        });
        return (
          <BarChart data={csData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-35} textAnchor="end" height={80}
              tickFormatter={(v) => shortenLabel(v)} />
            <YAxis {...yAxisProps} domain={['auto', 'auto']} />
            <Tooltip formatter={fmtTooltip} />
            <Bar dataKey="wick" fill="none" barSize={2}>
              {csData.map((d, i) => <Cell key={i} fill={d.bullish ? '#10b981' : '#ef4444'} />)}
            </Bar>
            <Bar dataKey="body" barSize={12} radius={[2, 2, 2, 2]}>
              {csData.map((d, i) => <Cell key={i} fill={d.bullish ? '#10b981' : '#ef4444'} />)}
            </Bar>
          </BarChart>
        );
      }

      // ═══ BOX PLOT ═══
      case 'box_plot': {
        // Expects: xKey, min, q1, median, q3, max (or first 5 numeric cols)
        const numCols = columns.filter((c) => c !== resolvedXKey && typeof chartData[0]?.[c] === 'number');
        const [minK, q1K, medK, q3K, maxK] = numCols.length >= 5
          ? numCols.slice(0, 5)
          : [numCols[0] || yKey, numCols[1] || yKey, numCols[2] || yKey, numCols[3] || yKey, numCols[4] || yKey];
        const bpData = chartData.map((row) => ({
          name: String(row[resolvedXKey]),
          box: [Number(row[q1K]) || 0, Number(row[q3K]) || 0],
          whisker: [Number(row[minK]) || 0, Number(row[maxK]) || 0],
          median: Number(row[medK]) || 0,
        }));
        return (
          <BarChart data={bpData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-35} textAnchor="end" height={80}
              tickFormatter={(v) => shortenLabel(v)} />
            <YAxis {...yAxisProps} domain={['auto', 'auto']} />
            <Tooltip formatter={fmtTooltip} />
            <Bar dataKey="whisker" fill="none" barSize={2}>
              {bpData.map((_, i) => <Cell key={i} fill={colors[0]} />)}
            </Bar>
            <Bar dataKey="box" fill={colors[0]} barSize={20} radius={[2, 2, 2, 2]} opacity={0.7}>
              <LabelList dataKey="median" position="center" fill="#fff" fontSize={10} formatter={(v) => smartFormat(Number(v))} />
            </Bar>
          </BarChart>
        );
      }

      // ═══ GRADIENT PIE ═══
      case 'gradient_pie': {
        const pieData = buildPieData(chartData, xKey, yKey);
        return (
          <PieChart>
            <defs>
              {pieData.map((_, i) => (
                <linearGradient key={i} id={`pieGrad-${i}-${block.title}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={1} />
                  <stop offset="100%" stopColor={colors[(i + 1) % colors.length]} stopOpacity={0.7} />
                </linearGradient>
              ))}
            </defs>
            <Pie data={pieData} cx="50%" cy="50%"
              innerRadius={opts.innerRadius || 0} outerRadius="75%"
              paddingAngle={2} dataKey="value"
              label={({ name, percent }) => `${shortenLabel(String(name ?? ''), 14)} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={{ stroke: '#94a3b8' }} fontSize={11}>
              {pieData.map((_, i) => (
                <Cell key={i} fill={`url(#pieGrad-${i}-${block.title})`} />
              ))}
            </Pie>
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        );
      }

      // ═══ VERTICAL COMPOSED ═══
      case 'vertical_composed': {
        return (
          <ComposedChart data={chartData} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...yAxisProps} />
            <YAxis type="category" dataKey={resolvedXKey} tick={{ fill: '#64748b', fontSize: 11 }} width={75}
              tickFormatter={(v) => shortenLabel(v, 12)} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {activeYKeys.map((f, i) => {
              if (i === 0) return <Bar key={f} dataKey={f} fill={colors[i % colors.length]} barSize={16} radius={[0, 4, 4, 0]} />;
              return <Line key={f} type={curveType} dataKey={f} stroke={colors[i % colors.length]} strokeWidth={2.5} />;
            })}
            {renderReferenceOverlays()}
          </ComposedChart>
        );
      }

      // ═══ BANDED CHART (confidence band / range area + line) ═══
      case 'banded_chart': {
        // Expects: xKey, lower, upper, main line (3 numeric cols)
        const sortedKeys = [...activeYKeys];
        const mainKey = sortedKeys[0] || yKey;
        const lowerKey = sortedKeys[1] || sortedKeys[0];
        const upperKey = sortedKeys[2] || sortedKeys[1] || sortedKeys[0];
        const bandData = chartData.map((row) => ({
          ...row,
          __band__: [Number(row[lowerKey]) || 0, Number(row[upperKey]) || 0],
        }));
        return (
          <ComposedChart data={bandData}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type={curveType} dataKey="__band__" name={`${lowerKey} – ${upperKey}`}
              fill={colors[0]} fillOpacity={0.15} stroke="none" connectNulls />
            <Line type={curveType} dataKey={mainKey} stroke={colors[0]} strokeWidth={2.5}
              dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} connectNulls />
            {renderReferenceOverlays()}
          </ComposedChart>
        );
      }

      // ═══ TARGET CHART (composed chart with target reference lines) ═══
      case 'target_chart': {
        const valueKey = activeYKeys[0] || yKey;
        const targetKey = activeYKeys[1] || activeYKeys[0];
        return (
          <ComposedChart data={chartData} margin={{ bottom: 60 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...xAxisProps} angle={-35} textAnchor="end" height={80} />
            <YAxis {...yAxisProps} />
            <Tooltip formatter={fmtTooltip} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey={valueKey} fill={colors[0]} radius={[4, 4, 0, 0]} opacity={0.85}>
              {showValueLabels && <LabelList dataKey={valueKey} position="top" fill="#64748b" fontSize={10} />}
            </Bar>
            <Line type="monotone" dataKey={targetKey} stroke={colors[1]} strokeWidth={2.5}
              strokeDasharray="6 3" dot={{ r: 4, fill: colors[1], strokeWidth: 0 }} />
            {renderReferenceOverlays()}
          </ComposedChart>
        );
      }

      default:
        return (
          <BarChart data={chartData} margin={barMargin}>
            <CartesianGrid {...gridProps} />
            <XAxis
              {...xAxisProps}
              angle={xAxisTickAngle}
              textAnchor={xAxisTickAngle ? 'end' : 'middle'}
              height={xAxisTickHeight}
            />
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
    radar: 400, radial_bar: 400, treemap: 350, gauge: 300, half_pie: 280, sparkline: 120,
    needle_gauge: 260, population_pyramid: 400, nested_treemap: 380, two_level_pie: 380,
    tiny_bar: 120, gradient_pie: 380, banded_chart: 350, vertical_composed: 380,
    candlestick: 380, box_plot: 380,
  };
  let chartHeight = heightMap[chartType] || 320;
  if ((isVertical || chartType === 'funnel' || chartType === 'horizontal_bar'
    || chartType === 'population_pyramid' || chartType === 'timeline_bar'
    || chartType === 'vertical_composed') && chartData.length > 0)
    chartHeight = Math.max(300, chartData.length * 35);
  else if (chartData.length > 8) chartHeight = 400;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      {renderChart()}
    </ResponsiveContainer>
  );
}
