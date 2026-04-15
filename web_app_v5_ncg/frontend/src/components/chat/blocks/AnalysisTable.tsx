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
  
  // Safety limit: if LLM didn't define specific rows, don't dump everything.
  const finalLimit = limit || (blockRows ? undefined : 15);
  if (finalLimit) rows = rows.slice(0, finalLimit);
  
  if (rows.length === 0) return null;

  // Helper to determine if a column should be right-aligned (numbers, percentages, currencies)
  const isNumericColumn = (key: string) => {
    const sample = rows.find(r => r[key] !== undefined && r[key] !== '')?.[key];
    if (sample === undefined) return false;
    if (typeof sample === 'number') return true;
    return !isNaN(Number(String(sample).replace(/[%$,\s]/g, ''))) && String(sample).trim() !== '';
  };

  return (
    <div className="overflow-hidden bg-white border border-slate-200 shadow-sm rounded-xl">
      {title && (
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-[15px] font-bold text-slate-800 tracking-tight">{title}</h2>
        </div>
      )}

      <div className="max-h-[400px] overflow-auto scrollbar-thin scrollbar-thumb-slate-200">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-white/95 backdrop-blur-md">
              {columns.map((col, i) => {
                const isNum = isNumericColumn(col.key);
                return (
                  <th
                    key={i}
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b-2 border-slate-100 ${isNum ? 'text-right' : 'text-left'}`}
                    style={{ minWidth: isNum ? '70px' : '90px' }}
                  >
                    {col.label || col.key}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className="group transition-colors hover:bg-slate-50/80"
              >
                {columns.map((col, ci) => {
                  const val = row[col.key];
                  const isNum = isNumericColumn(col.key);
                  const strVal = String(val || '');
                  const isLongText = !isNum && strVal.length > 20;
                  
                  return (
                    <td 
                      key={ci} 
                      className={`px-3 py-2 align-top text-[12px] text-slate-600 transition-colors ${isNum ? 'text-right' : 'text-left'} ${isLongText ? 'whitespace-normal' : 'whitespace-nowrap'}`}
                      style={{ 
                        minWidth: isNum ? '70px' : '90px',
                        maxWidth: isLongText ? '250px' : 'none',
                      }}
                    >
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
