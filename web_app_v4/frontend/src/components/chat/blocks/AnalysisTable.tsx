'use client';

import React from 'react';
import { AnalysisTableBlock, TableColumn } from '@/types/types';

type Row = Record<string, string | number>;

/* ─── Cell formatting: purely render what LLM sends ─── */

function evaluateColorRule(value: string | number, colorRule?: {
  type: string;
  thresholds?: Array<{ value: number; color: string; label?: string }>;
  statusMap?: Record<string, string>;
  defaultColor?: string;
}): string | null {
  if (!colorRule) return null;

  const strVal = String(value).trim().toLowerCase();
  const numVal = typeof value === 'number' ? value : parseFloat(strVal.replace(/[%$,]/g, ''));
  const isNum = !isNaN(numVal);

  switch (colorRule.type) {
    case 'positive_negative':
      if (isNum) {
        if (numVal > 0) return '#10B981';
        if (numVal < 0) return '#EF4444';
      }
      return colorRule.defaultColor || null;

    case 'threshold':
      if (isNum && colorRule.thresholds) {
        for (const threshold of colorRule.thresholds) {
          if (numVal >= threshold.value) return threshold.color;
        }
      }
      return colorRule.defaultColor || null;

    case 'status':
      if (colorRule.statusMap && colorRule.statusMap[strVal]) {
        return colorRule.statusMap[strVal];
      }
      return colorRule.defaultColor || null;

    default:
      return null;
  }
}

function formatCell(value: string | number, col: TableColumn): React.ReactNode {
  const strVal = String(value).trim();

  // Color rule badge
  const customColor = evaluateColorRule(value, col.colorRule);
  if (customColor) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap"
        style={{ backgroundColor: `${customColor}15`, color: customColor, borderColor: `${customColor}30` }}
      >
        {strVal}
      </span>
    );
  }

  const numRaw = typeof value === 'string' ? Number(value.replace(/[%$,]/g, '')) : value;
  if (isNaN(numRaw) || col.format === 'text') {
    return <span className="break-words text-slate-700">{strVal}</span>;
  }

  const num = Number(numRaw);
  const isPercent = col.format === 'percent' || strVal.includes('%') || /rate|pct|tyle|conversion/i.test(col.key || '');

  if (isPercent) {
    const formatted = strVal.includes('%') ? strVal : `${num.toFixed(1)}%`;
    const color = num > 0 ? 'text-emerald-600 bg-emerald-50 border-emerald-200/60' :
                  num < 0 ? 'text-rose-600 bg-rose-50 border-rose-200/60' :
                  'text-slate-600 bg-slate-50 border-slate-200/60';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${color}`}>
        {formatted}
      </span>
    );
  }

  if (col.format === 'currency') {
    let formatted = '';
    if (Math.abs(num) >= 1e9) formatted = `${(num / 1e9).toFixed(1)}B`;
    else if (Math.abs(num) >= 1e6) formatted = `${(num / 1e6).toFixed(1)}M`;
    else if (Math.abs(num) >= 1e3) formatted = `${(num / 1e3).toFixed(1)}K`;
    else formatted = num.toLocaleString('vi-VN');
    return <span className="font-mono font-semibold text-slate-800">{formatted}</span>;
  }

  return <span className="font-mono text-slate-700">{num.toLocaleString('vi-VN')}</span>;
}

/* ─── Main Component ─── */

interface AnalysisTableProps {
  block: AnalysisTableBlock;
  data: Row[];
}

export default function AnalysisTable({ block, data }: AnalysisTableProps) {
  const { title, columns: rawColumns, rows: blockRows, sortBy, sortOrder, limit } = block;

  const columns: TableColumn[] = (rawColumns || []).map((col) => {
    if (typeof col === 'string') return { key: col, label: col };
    return col;
  });

  const sourceRows: Row[] = blockRows
    ? blockRows.map((row) => {
        const obj: Row = {};
        columns.forEach((col, idx) => {
          obj[col.key] = row[idx] ?? '';
        });
        return obj;
      })
    : [...data];

  let rows = [...sourceRows];
  if (sortBy) {
    rows.sort((a, b) => {
      const va = Number(a[sortBy]) || 0;
      const vb = Number(b[sortBy]) || 0;
      return sortOrder === 'asc' ? va - vb : vb - va;
    });
  }
  if (limit) rows = rows.slice(0, limit);
  if (rows.length === 0) return null;

  return (
    <div className="overflow-hidden bg-white">
      {title && (
        <div className="px-1 py-3">
          <h3 className="text-[13px] font-bold text-slate-700 tracking-tight uppercase">{title}</h3>
        </div>
      )}

      <div className="max-h-[450px] overflow-y-auto overflow-x-hidden">
        <table className="w-full table-fixed text-sm text-left border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50/80 backdrop-blur-sm">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="break-words px-3 py-2.5 align-top text-[11px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 whitespace-normal"
                >
                  {col.label || col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={`border-b border-slate-50 transition-colors hover:bg-blue-50/30 ${
                  ri % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                }`}
              >
                {columns.map((col, ci) => {
                  const val = row[col.key];
                  return (
                    <td key={ci} className="break-words px-3 py-2.5 align-top text-[13px] whitespace-normal">
                      {val !== undefined ? formatCell(val, col) : <span className="text-slate-300">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
