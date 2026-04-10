'use client';

import React from 'react';
import { StatCardItem } from '@/types/types';

export default function StatCard({ items }: { items: StatCardItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 4)}, 1fr)` }}>
      {items.map((item, i) => (
        <div
          key={i}
          className="border border-slate-200 rounded-xl px-4 py-3 bg-white"
          style={{ borderTopWidth: 3, borderTopColor: item.borderColor || '#e2e8f0' }}
        >
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">
            {item.label}
          </div>
          <div className="text-2xl font-bold tracking-tight" style={{ color: item.color || '#1e293b' }}>
            {item.value}
          </div>
          {(item.subtitle || item.trendLabel) && (
            <div className="flex items-center gap-1.5 mt-1">
              {item.trendIcon && (
                <span className="text-xs font-semibold" style={{ color: item.trendColor || '#64748b' }}>
                  {item.trendIcon}
                </span>
              )}
              {item.trendLabel && (
                <span className="text-xs font-semibold" style={{ color: item.trendColor || '#64748b' }}>
                  {item.trendLabel}
                </span>
              )}
              {item.subtitle && (
                <span className="text-xs text-slate-400">{item.subtitle}</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
