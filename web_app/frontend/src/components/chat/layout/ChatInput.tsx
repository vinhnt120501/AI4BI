'use client';

import React from 'react';
import { UI_STRINGS } from '@/types/types';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

/**
 * ChatInput — Ô nhập tin nhắn
 * Gồm: nút thêm (+), ô nhập text, nút micro, nút gửi
 */
export default function ChatInput({ value, onChange, onSend }: ChatInputProps) {
  return (
    <div className="max-w-[48rem] mx-auto w-full">
      <div className="bg-white rounded-full px-4 py-2.5 flex items-center gap-3 border border-slate-200 shadow-sm">
        {/* Nút thêm (+) */}
        <button className="text-slate-700 hover:text-slate-900 transition-colors shrink-0 p-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Ô nhập text */}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) onSend(); }}
          placeholder={UI_STRINGS.INPUT_PLACEHOLDER}
          className="flex-1 bg-transparent border-none focus:outline-none text-base text-slate-700 placeholder:text-slate-400"
        />

        {/* Nút micro (giọng nói) */}
        <button className="text-slate-700 hover:text-slate-900 transition-colors shrink-0 p-1" title={UI_STRINGS.ACTION_VOICE}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Nút gửi */}
        <button
          onClick={onSend}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 ${
            value.trim()
              ? 'bg-slate-900 text-white hover:bg-slate-700'
              : 'bg-slate-800 text-white cursor-default'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
