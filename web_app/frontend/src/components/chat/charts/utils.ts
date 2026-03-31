import { ChartConfig } from '@/types/types';

export const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
  '#14b8a6', '#a855f7', '#84cc16', '#e11d48',
];

export function buildChartData(columns: string[], rows: string[][]): Record<string, string | number>[] {
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

export function resolveYKeys(data: Record<string, string | number>[], xKey: string, config: ChartConfig): string[] {
  if (config.yKeys && config.yKeys.length > 0) {
    const valid = config.yKeys.filter((k) => data.length > 0 && k in data[0]);
    if (valid.length > 0) return valid;
  }
  if (config.yKey && data.length > 0 && config.yKey in data[0]) {
    return [config.yKey];
  }
  if (data.length === 0) return [];
  return Object.keys(data[0]).filter(
    (k) => k !== xKey && typeof data[0][k] === 'number'
  );
}

export function shortenLabel(label: string, maxLen: number = 20): string {
  if (typeof label !== 'string') return String(label);
  return label.length > maxLen ? label.slice(0, maxLen) + '\u2026' : label;
}

export function formatYAxis(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(value % 1 === 0 ? 0 : 2);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatTooltip(v: any) {
  if (v == null) return '';
  return typeof v === 'number' ? v.toLocaleString() : String(v);
}
