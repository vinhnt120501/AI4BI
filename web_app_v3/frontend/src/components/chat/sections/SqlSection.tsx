'use client';

import React from 'react';
import CollapsibleBox from '../shared/CollapsibleBox';

export default function SqlSection({ sql }: { sql: string }) {
  return (
    <CollapsibleBox title="Câu truy vấn SQL" defaultOpen={false}>
      <div className="px-4 py-3">
        <div className="flex justify-end mb-1">
          <button
            onClick={() => navigator.clipboard.writeText(sql)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Sao chép
          </button>
        </div>
        <pre className="text-sm text-slate-600 font-mono whitespace-pre-wrap">{sql}</pre>
      </div>
    </CollapsibleBox>
  );
}
