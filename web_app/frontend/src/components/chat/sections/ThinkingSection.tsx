'use client';

import React from 'react';
import CollapsibleBox from '../shared/CollapsibleBox';

export default function ThinkingSection({ thinking, tokens }: { thinking: string; tokens?: number }) {
  return (
    <CollapsibleBox title="Suy nghi" badge={tokens ? `${tokens.toLocaleString()} tokens` : undefined} defaultOpen={false}>
      <div className="px-4 py-3 text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">
        {thinking}
      </div>
    </CollapsibleBox>
  );
}
