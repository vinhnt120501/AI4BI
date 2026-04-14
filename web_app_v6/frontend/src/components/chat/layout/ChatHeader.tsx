'use client';

import React from 'react';
import { UI_STRINGS } from '@/types/types';

/**
 * ChatHeader — Thanh tiêu đề phía trên cùng
 * Hiển thị tên app
 */
export default function ChatHeader() {
  return (
    <header className="h-12 flex items-center justify-between px-5 flex-shrink-0 w-full">
      <div className="flex items-center gap-1.5">
        <span className="text-base font-semibold text-slate-800">{UI_STRINGS.APP_NAME}</span>
      </div>
    </header>
  );
}
