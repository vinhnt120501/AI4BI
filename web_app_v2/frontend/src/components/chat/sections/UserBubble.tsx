import React from 'react';
import ActionButtons from './ActionButtons';

export default function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex flex-col items-end gap-1 mb-2 group">
      <div className="max-w-[85%] bg-[#f4f4f4] rounded-2xl px-5 py-3 text-[15px] leading-relaxed text-slate-800 shadow-sm transition-all group-hover:bg-[#eeeeee]">
        {content}
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionButtons 
          showFeedback={false} 
          onCopy={() => navigator.clipboard.writeText(content)} 
        />
      </div>
    </div>
  );
}
