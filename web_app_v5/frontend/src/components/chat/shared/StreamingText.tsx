'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatAssistantText } from './formatAssistantText';

interface StreamingTextProps {
  text: string;
  className?: string;
}

/**
 * StreamingText render trực tiếp nội dung SSE thay vì mô phỏng gõ chữ.
 */
export default function StreamingText({ text, className = '' }: StreamingTextProps) {
  const formattedText = formatAssistantText(text);
  return (
    <div className={`${className} markdown-output prose prose-slate prose-sm max-w-none
      prose-headings:text-slate-900 prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
      prose-p:my-2 prose-p:leading-relaxed
      prose-ul:my-2 prose-li:my-0.5 prose-li:text-slate-900 prose-ol:text-slate-900 prose-ol:marker:text-slate-900 prose-li:marker:font-bold prose-ol:marker:font-bold
      prose-strong:text-slate-900`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{formattedText}</ReactMarkdown>
      <span className="animate-pulse text-slate-400">|</span>
    </div>
  );
}
