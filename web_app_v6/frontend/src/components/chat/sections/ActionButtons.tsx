'use client';

import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface ActionButtonsProps {
  copyText: string;
}

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

export default function ActionButtons({ copyText, onRetry }: ActionButtonsProps & { onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        fallbackCopy(copyText);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      fallbackCopy(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-1 pr-1">
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        title={copied ? 'Đã copy' : 'Sao chép'}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>

      {onRetry && (
        <button
          onClick={onRetry}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
          title="Thử lại"
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
}
