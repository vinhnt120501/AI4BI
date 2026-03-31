'use client';

import React from 'react';

export default function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] bg-[#f4f4f4] rounded-3xl px-5 py-3 text-[15px] leading-relaxed text-slate-800">
        {content}
      </div>
    </div>
  );
}
