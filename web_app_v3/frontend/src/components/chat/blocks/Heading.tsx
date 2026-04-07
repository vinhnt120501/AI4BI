'use client';

import React from 'react';

export default function Heading({ text, level = 'h3', color }: { text: string; level?: 'h1' | 'h2' | 'h3'; color?: string }) {
  const sizeMap = {
    h1: 'text-xl font-extrabold tracking-tight',
    h2: 'text-lg font-bold tracking-tight',
    h3: 'text-[15px] font-semibold',
  };

  const colorMap: Record<string, string> = {
    blue: 'text-blue-800',
    green: 'text-emerald-800',
    slate: 'text-slate-800',
  };

  const sizeCls = sizeMap[level];
  const colorCls = colorMap[color || ''] || 'text-slate-800';

  return (
    <div className={`${sizeCls} ${colorCls} flex items-center gap-2`}>
      {level === 'h1' && <div className="w-1 h-5 bg-blue-500 rounded-full" />}
      {text}
    </div>
  );
}
