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

export default function StatCard({ items }: { items: StatCardItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)` }}>
      {items.map((item, i) => {
        const colorClass = item.color ? (DEFAULT_COLORS[item.color] || 'text-slate-800') : 'text-slate-800';
        return (
          <div key={i} className="border border-slate-200 rounded-xl px-4 py-3 bg-white">
            <div className="text-xs text-slate-500 mb-1">{item.label}</div>
            <div className={`text-xl font-bold ${colorClass}`}>{item.value}</div>
            {item.subtitle && (
              <div className="text-xs text-slate-400 mt-0.5">{item.subtitle}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
