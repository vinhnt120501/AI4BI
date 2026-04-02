'use client';

import React from 'react';
import { StatCardItem } from '@/types/types';

const DEFAULT_COLORS: Record<string, string> = {
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  red: 'text-red-500',
  orange: 'text-orange-500',
  purple: 'text-violet-600',
  cyan: 'text-cyan-600',
};

const BORDER_COLORS: Record<string, string> = {
  blue: 'border-t-blue-500',
  green: 'border-t-emerald-500',
  red: 'border-t-red-500',
  orange: 'border-t-orange-500',
  purple: 'border-t-violet-500',
  cyan: 'border-t-cyan-500',
};

const TREND_CONFIG: Record<string, { icon: string; label: string; cls: string }> = {
  up:      { icon: '↑', label: 'Tăng',     cls: 'text-emerald-500' },
  down:    { icon: '↓', label: 'Giảm',     cls: 'text-red-500' },
  neutral: { icon: '→', label: 'Ổn định',  cls: 'text-slate-400' },
};

export default function StatCard({ items }: { items: StatCardItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)` }}>
      {items.map((item, i) => {
        const colorClass = item.color ? (DEFAULT_COLORS[item.color] || 'text-slate-800') : 'text-slate-800';
        const borderClass = item.color ? (BORDER_COLORS[item.color] || '') : '';
        const trend = item.trend ? TREND_CONFIG[item.trend] : null;

        return (
          <div key={i} className={`border border-slate-200 rounded-xl px-4 py-3 bg-white border-t-[3px] ${borderClass}`}>
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">{item.label}</div>
            <div className={`text-2xl font-bold tracking-tight ${colorClass}`}>{item.value}</div>
            {(item.subtitle || trend) && (
              <div className="flex items-center gap-1.5 mt-1">
                {trend && (
                  <span className={`text-xs font-semibold ${trend.cls}`}>
                    {trend.icon} {trend.label}
                  </span>
                )}
                {item.subtitle && (
                  <span className="text-xs text-slate-400">{item.subtitle}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
