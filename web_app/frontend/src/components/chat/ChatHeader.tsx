'use client';

import React from 'react';
import { UI_STRINGS } from '@/types/types';

/**
 * ChatHeader — Thanh tiêu đề phía trên cùng
 * Hiển thị tên app, trạng thái online, và nút lịch sử
 */
export default function ChatHeader() {
  return (
    <header className="h-12 flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-1.5">
        <span className="text-base font-semibold text-slate-800">{UI_STRINGS.APP_NAME}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span className="w-2 h-2 rounded-full bg-blue-500 ml-0.5"></span>
      </div>
      <button className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l2 2" />
        </svg>
      </button>
    </header>
  );
}
