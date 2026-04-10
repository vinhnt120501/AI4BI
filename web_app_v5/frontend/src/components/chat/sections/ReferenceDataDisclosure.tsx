'use client';

import React, { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

function normalizeIdentifier(text: string) {
  return text.replace(/^[`"'[]+/, '').replace(/[`"'\]]+$/, '').replace(/[;,]$/, '').trim();
}

function extractTableNames(sql?: string) {
  if (typeof sql !== 'string' || !sql.trim()) return [];

  const normalized = sql.replace(/\s+/g, ' ').trim();
  const results: string[] = [];
  const re = /\b(from|join)\s+([`"[\]\w.]+|\([^)]+?\))/gi;

  let match: RegExpExecArray | null = null;
  while ((match = re.exec(normalized))) {
    const raw = match[2] || '';
    if (!raw || raw.startsWith('(')) continue;
    const name = normalizeIdentifier(raw);
    if (name && !results.includes(name)) results.push(name);
  }

  return results;
}

interface ReferenceDataDisclosureProps {
  columns?: string[];
  rows?: string[][];
  sql?: string;
}

export default function ReferenceDataDisclosure({ columns, rows, sql }: ReferenceDataDisclosureProps) {
  void rows;

  const colNames = useMemo(() => (Array.isArray(columns) ? columns.filter(Boolean) : []), [columns]);
  const sqlText = useMemo(() => (typeof sql === 'string' ? sql.trim() : ''), [sql]);
  const tableNames = useMemo(() => extractTableNames(sqlText), [sqlText]);

  if (!sqlText && colNames.length === 0) return null;

  return (
    <details className="rounded-2xl bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 marker:content-none">
        <div className="min-w-0 text-[13px] font-medium text-slate-800">Dữ liệu được tham chiếu</div>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </summary>

      <div className="px-4 pb-4 pt-1">
        <div className="space-y-4 px-3 py-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tên bảng</div>
            {tableNames.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tableNames.map((name) => (
                  <span key={name} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-700">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-[12px] text-slate-500">N/A</div>
            )}
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tên cột</div>
            {colNames.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {colNames.map((name) => (
                  <span key={name} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-700">
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-[12px] text-slate-500">N/A</div>
            )}
          </div>

          {sqlText ? (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Câu SQL</div>
              <div className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-700">
                {sqlText}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </details>
  );
}
