'use client';

import React from 'react';
import { DetailCardItem } from '@/types/types';

const TAG_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  red: 'bg-red-100 text-red-700',
  green: 'bg-emerald-100 text-emerald-700',
  orange: 'bg-orange-100 text-orange-700',
  purple: 'bg-violet-100 text-violet-700',
  gray: 'bg-slate-100 text-slate-600',
};

export default function DetailCard({ items }: { items: DetailCardItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)` }}>
      {items.map((item, i) => {
        const tagClass = item.tagColor ? (TAG_COLORS[item.tagColor] || TAG_COLORS.gray) : TAG_COLORS.gray;
        return (
          <div key={i} className="border border-slate-200 rounded-xl px-4 py-3 bg-white">
            <div className="font-semibold text-sm text-slate-800 mb-2">{item.name}</div>
            <div className="space-y-1">
              {Object.entries(item.metrics).map(([key, val]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-slate-500">{key}</span>
                  <span className="font-medium text-slate-700">{val}</span>
                </div>
              ))}
            </div>
            {item.tag && (
              <div className="mt-2">
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${tagClass}`}>
                  {item.tag}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
