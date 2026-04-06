'use client';

import React, { useState } from 'react';
import { UI_STRINGS } from '@/types/types';

interface ActionButtonsProps {
  onCopy?: () => void;
  showFeedback?: boolean;
}

export default function ActionButtons({ onCopy, showFeedback = true }: ActionButtonsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (onCopy) {
      onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-1 text-slate-400">
      <button 
        onClick={handleCopy}
        className={`p-1.5 hover:bg-slate-100 rounded-lg transition-colors ${copied ? 'text-green-500' : 'hover:text-slate-600'}`} 
        title={copied ? "Đã sao chép!" : UI_STRINGS.ACTION_COPY}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {showFeedback && (
        <>
          <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_LIKE}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
          <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_DISLIKE}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 15V19a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
              <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
            </svg>
          </button>
          <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_REGENERATE}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
