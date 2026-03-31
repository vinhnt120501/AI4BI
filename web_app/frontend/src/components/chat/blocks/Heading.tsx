'use client';

import React from 'react';

export default function Heading({ text, level = 'h3' }: { text: string; level?: 'h2' | 'h3' }) {
  const cls = level === 'h2'
    ? 'text-base font-bold text-slate-800'
    : 'text-sm font-semibold text-slate-600';

  return <div className={`${cls} pt-2`}>{text}</div>;
}
