'use client';

import React from 'react';

export default function TopBar() {
  return (
    <div className="flex shrink-0 items-center bg-[var(--color-background-primary)] px-6 py-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#19226D]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
        </div>
        <span className="text-[14px] font-bold text-[color:var(--color-text-primary)]">FPT BI</span>
      </div>
    </div>
  );
}
