'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface StreamingTextProps {
  text: string;
  className?: string;
}

/**
 * StreamingText render trực tiếp nội dung SSE thay vì mô phỏng gõ chữ.
 */
export default function StreamingText({ text, className = '' }: StreamingTextProps) {
  return (
    <div className={`${className} prose prose-slate prose-sm max-w-none
      prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
      prose-p:my-2 prose-p:leading-relaxed
      prose-ul:my-2 prose-li:my-0.5
      prose-strong:text-slate-800`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      <span className="animate-pulse text-slate-400">|</span>
    </div>
  );
}
