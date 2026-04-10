'use client';

import React from 'react';
import { DetailCardItem } from '@/types/types';

export default function DetailCard({ items }: { items: DetailCardItem[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)` }}>
      {items.map((item, i) => (
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
              <span
                className="inline-block text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: item.tagColor ? `${item.tagColor}20` : '#f1f5f9',
                  color: item.tagColor || '#64748b',
                }}
              >
                {item.tag}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
