'use client';

import React from 'react';
import { AnalysisTableBlock } from '@/types/types';

type Row = Record<string, string | number>;

function formatCell(value: string | number, format?: string): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (isNaN(num) || format === 'text') return String(value);

  if (format === 'currency') {
    if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(1)} tỷ`;
    if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(1)} triệu`;
    if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
    return num.toLocaleString('vi-VN');
  }
  if (format === 'percent') return `${num > 0 ? '+' : ''}${num.toFixed(1)}%`;
  if (format === 'number') return num.toLocaleString('vi-VN');

  // Auto-detect: nếu giá trị nhỏ có thể là %, nếu lớn là số
  if (Math.abs(num) < 200 && num !== Math.floor(num)) return `${num.toFixed(1)}%`;
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toLocaleString('vi-VN');
}

function getHighlightClass(value: string | number, highlight?: string): string {
  if (highlight !== 'positive_negative') return '';
  const num = typeof value === 'string' ? Number(value) : value;
  if (isNaN(num)) return '';
  if (num > 0) return 'text-emerald-600 font-semibold';
  if (num < 0) return 'text-red-500 font-semibold';
  return 'text-slate-400';
}

interface AnalysisTableProps {
  block: AnalysisTableBlock;
  data: Row[];
}

export default function AnalysisTable({ block, data }: AnalysisTableProps) {
  const { title, columns, sortBy, sortOrder, limit } = block;

  // Sort — validate sortBy key exists in data
  let rows = [...data];
  if (sortBy && rows.length > 0 && sortBy in rows[0]) {
    rows.sort((a, b) => {
      const va = Number(a[sortBy]) || 0;
      const vb = Number(b[sortBy]) || 0;
      return sortOrder === 'asc' ? va - vb : vb - va;
    });
  }

  // Limit
  if (limit) rows = rows.slice(0, limit);

  if (rows.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      <div className="overflow-auto max-h-[500px]">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} className="px-4 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap border-b border-slate-200 bg-slate-50 sticky top-0 text-xs uppercase tracking-wide">
                  {col.label || col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri % 2 === 0 ? '' : 'bg-slate-50/50'}>
                {columns.map((col, ci) => {
                  const val = row[col.key];
                  if (val === undefined) return <td key={ci} className="px-4 py-2 text-slate-300">—</td>;
                  const hlClass = getHighlightClass(val, col.highlight);
                  const isNum = typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '');
                  return (
                    <td key={ci} className={`px-4 py-2.5 whitespace-nowrap border-b border-slate-100 ${isNum ? 'font-mono' : ''} ${hlClass || 'text-slate-700'}`}>
                      {formatCell(val, col.format)}
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
