'use client';

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface StreamingTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

/**
 * StreamingText — Hiệu ứng streaming + render markdown
 */
export default function StreamingText({ text, speed = 12, onComplete, className = '' }: StreamingTextProps) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);

    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return (
    <div className={`${className} prose prose-slate prose-sm max-w-none
      prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
      prose-p:my-2 prose-p:leading-relaxed
      prose-ul:my-2 prose-li:my-0.5
      prose-strong:text-slate-800`}
    >
      <ReactMarkdown>{displayed}</ReactMarkdown>
      {!done && <span className="animate-pulse text-slate-400">|</span>}
    </div>
  );
}
