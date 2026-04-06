'use client';

import React, { useState } from 'react';

interface CollapsibleBoxProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/**
 * CollapsibleBox — Box thu gọn, click để mở/đóng nội dung
 */
export default function CollapsibleBox({ title, badge, defaultOpen = true, children }: CollapsibleBoxProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
      >
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{title}</span>
        {badge && <span className="text-xs text-slate-400">({badge})</span>}
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {children}
        </div>
      )}
    </div>
  );
}
