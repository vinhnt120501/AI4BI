'use client';

import React from 'react';
import CollapsibleBox from '../shared/CollapsibleBox';

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

const LABELS: Record<string, string> = {
  total: 'Total',
  memory_sql: 'Memory (SQL)',
  sql_stage: 'SQL generation',
  memory_reply: 'Memory (reply)',
  llm_reply: 'LLM reply',
  llm_followup: 'Follow-up',
  memory_update: 'Memory update',
};

export default function TimingSection({ timings }: { timings?: Record<string, number> }) {
  console.log('[TimingSection render]', timings);
  if (!timings) return null;

  const total = timings.total;
  const keyOrder = ['sql_stage', 'llm_reply', 'memory_sql', 'memory_reply', 'llm_followup', 'memory_update'];
  const mainKeys = keyOrder.filter((k) => timings[k] !== undefined);
  const subKeys = Object.keys(timings).filter(
    (k) => k.startsWith('sql__') || k.startsWith('agentic_')
  );

  return (
    <CollapsibleBox
      title="Timing"
      badge={total !== undefined ? fmt(total) : undefined}
      defaultOpen={true}
    >
      <div className="px-4 py-3 text-sm font-mono text-slate-500 space-y-1">
        {/* Summary bar */}
        {total !== undefined && mainKeys.length > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden mb-3 gap-px">
            {mainKeys.map((k) => {
              const pct = (timings[k] / total) * 100;
              const colors: Record<string, string> = {
                sql_stage: 'bg-blue-400',
                llm_reply: 'bg-violet-400',
                memory_sql: 'bg-amber-300',
                memory_reply: 'bg-amber-300',
                llm_followup: 'bg-emerald-400',
                memory_update: 'bg-slate-300',
              };
              return (
                <div
                  key={k}
                  className={`${colors[k] || 'bg-slate-200'} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${LABELS[k] || k}: ${fmt(timings[k])}`}
                />
              );
            })}
          </div>
        )}

        {/* Main timings */}
        <div className="grid grid-cols-[160px_1fr] gap-x-2">
          {mainKeys.map((k) => (
            <React.Fragment key={k}>
              <span className="text-slate-400">{LABELS[k] || k}:</span>
              <span className="text-slate-600">{fmt(timings[k])}</span>
            </React.Fragment>
          ))}
        </div>

        {/* Sub-timings (agentic / sql internals) */}
        {subKeys.length > 0 && (
          <div className="grid grid-cols-[160px_1fr] gap-x-2 pt-2 border-t border-slate-100 mt-2">
            {subKeys.map((k) => (
              <React.Fragment key={k}>
                <span className="pl-3 text-[12px] opacity-70">{k.replace(/^sql__|^agentic_/, '')}:</span>
                <span className="text-[12px] opacity-70">{fmt(timings[k])}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {total !== undefined && (
          <div className="font-semibold text-slate-700 pt-2 border-t border-slate-200 mt-2">
            Total: {fmt(total)}
          </div>
        )}
      </div>
    </CollapsibleBox>
  );
}
