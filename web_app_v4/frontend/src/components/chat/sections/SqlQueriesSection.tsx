'use client';

import React from 'react';
import type { SqlQueryEntry } from '@/types/types';
import CollapsibleBox from '../shared/CollapsibleBox';

interface SqlQueriesSectionProps {
  queries?: SqlQueryEntry[];
}

export default function SqlQueriesSection({ queries = [] }: SqlQueriesSectionProps) {
  const items = queries.filter((item) => item?.sql?.trim());
  if (items.length === 0) return null;

  return (
    <CollapsibleBox title="SQL queries" badge={`${items.length}`} defaultOpen={false}>
      <div className="space-y-3 px-4 py-3">
        <div className="mb-1 flex justify-end">
          <button
            onClick={() => navigator.clipboard.writeText(items.map((item) => item.sql).join('\n\n---\n\n'))}
            className="text-xs text-slate-400 transition-colors hover:text-slate-600"
          >
            Sao chép tất cả
          </button>
        </div>
        {items.map((item, index) => {
          const label = item.source === 'agentic'
            ? `Agentic query ${item.step ?? index + 1}`
            : `Primary query${item.attempt && item.attempt > 1 ? ` attempt ${item.attempt}` : index > 0 ? ` attempt ${index + 1}` : ''}`;

          return (
            <div key={`${item.source}-${item.step ?? 'main'}-${item.attempt ?? index}`} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-600">{label}</div>
                  {item.reason ? (
                    <div className="mt-0.5 text-[11px] text-slate-400">{item.reason}</div>
                  ) : null}
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(item.sql)}
                  className="shrink-0 text-xs text-slate-400 transition-colors hover:text-slate-600"
                >
                  Sao chép
                </button>
              </div>
              <pre className="whitespace-pre-wrap px-3 py-3 font-mono text-sm text-slate-600">{item.sql}</pre>
            </div>
          );
        })}
      </div>
    </CollapsibleBox>
  );
}
