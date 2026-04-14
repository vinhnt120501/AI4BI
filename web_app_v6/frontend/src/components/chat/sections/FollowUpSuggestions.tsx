'use client';

import React from 'react';

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
  variant?: 'default' | 'landing';
  loading?: boolean;
  fullWidth?: boolean;
}

function SkeletonCard({ isLanding }: { isLanding: boolean }) {
  return (
    <div
      className={[
        'flex items-center rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/5',
        isLanding ? 'min-h-[52px] px-6 py-2.5' : 'min-h-[44px] px-5 py-2',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className={['h-[14px] animate-pulse rounded bg-slate-200', isLanding ? 'w-3/4' : 'w-2/3'].join(' ')} />
        <div className="h-[14px] w-1/2 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function FollowUpSuggestions({ suggestions, onSelect, variant = 'default', loading = false, fullWidth = false }: FollowUpSuggestionsProps) {
  const isLanding = variant === 'landing';
  const gridClass = fullWidth
    ? ['grid w-full grid-cols-2', isLanding ? 'gap-3' : 'gap-2'].join(' ')
    : ['inline-grid grid-cols-2', isLanding ? 'gap-3' : 'gap-2'].join(' ');
  const wrapperClass = fullWidth ? '' : 'flex w-full justify-center';

  if (loading) {
    return (
      <div className={wrapperClass}>
        <div className={gridClass}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} isLanding={isLanding} />
          ))}
        </div>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  const visible = suggestions.slice(0, 4);

  return (
    <div className={wrapperClass}>
      <div className={gridClass}>
        {visible.map((text, idx) => (
        <button
          key={`${idx}-${text}`}
          type="button"
          onClick={() => onSelect(text)}
          title={text}
          className={[
            'group flex transform-gpu items-center rounded-2xl border border-slate-200 bg-white text-left shadow-sm shadow-slate-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50/70 hover:shadow-md hover:shadow-slate-900/10 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10',
            isLanding ? 'min-h-[52px] px-6 py-2.5' : 'min-h-[44px] px-5 py-2',
          ].join(' ')}
        >
          <span
            className={[
              'min-w-0 flex-1 break-words text-slate-800',
              'line-clamp-2 leading-tight',
              isLanding ? 'text-[15px]' : 'text-[14px]',
            ].join(' ')}
          >
            {text}
          </span>
        </button>
      ))}
      </div>
    </div>
  );
}
