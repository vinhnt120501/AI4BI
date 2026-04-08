'use client';

import React from 'react';

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
  variant?: 'default' | 'landing';
}

export default function FollowUpSuggestions({ suggestions, onSelect, variant = 'default' }: FollowUpSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  const isLanding = variant === 'landing';

  return (
    <div className="w-full">
      <div className={isLanding ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'grid grid-cols-1 gap-2 md:grid-cols-2'}>
        {suggestions.map((text, idx) => (
          <button
            key={`${idx}-${text}`}
            type="button"
            onClick={() => onSelect(text)}
            title={text}
            className={[
              'group flex w-full transform-gpu items-start rounded-2xl border border-slate-200 bg-white text-left shadow-sm shadow-slate-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-md hover:shadow-slate-900/10 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10',
              isLanding ? 'px-5 py-4' : 'px-4 py-3',
            ].join(' ')}
          >
            <span
              className={isLanding ? 'min-w-0 flex-1 text-[14px] leading-snug text-slate-800' : 'min-w-0 flex-1 text-[13px] leading-snug text-slate-800'}
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {text}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
