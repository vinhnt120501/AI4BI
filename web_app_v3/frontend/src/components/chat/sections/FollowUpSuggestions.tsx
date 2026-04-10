'use client';

import React from 'react';

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
}

export default function FollowUpSuggestions({ suggestions, onSelect }: FollowUpSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {suggestions.map((text, idx) => (
          <button
            key={`${idx}-${text}`}
            type="button"
            onClick={() => onSelect(text)}
            title={text}
            className="group flex w-full items-start rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm shadow-slate-900/5 transition-colors hover:border-slate-300 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10"
          >
            <span
              className="min-w-0 flex-1 text-[13px] leading-snug text-slate-800"
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
