'use client';

import React from 'react';

interface FollowUpSuggestionsProps {
  suggestions: string[];
  onSelect: (question: string) => void;
}

export default function FollowUpSuggestions({ suggestions, onSelect }: FollowUpSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((text, idx) => (
        <button
          key={`${idx}-${text}`}
          onClick={() => onSelect(text)}
          className="px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 text-sm hover:bg-slate-50 hover:border-slate-300 transition-colors"
          title="Gửi câu hỏi gợi ý"
        >
          {text}
        </button>
      ))}
    </div>
  );
}
