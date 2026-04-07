'use client';

import React from 'react';
import { LlmDebugPayload } from '@/types/types';
import CollapsibleBox from '../shared/CollapsibleBox';

export default function LlmPayloadSection({ payloads }: { payloads: LlmDebugPayload[] }) {
  if (!payloads || payloads.length === 0) return null;

  return (
    <CollapsibleBox title="LLM Payload (Debug)" badge={`${payloads.length} stage`} defaultOpen={false}>
      <div className="px-4 py-3 space-y-4">
        {payloads.map((p, idx) => (
          <div key={`${p.stage}-${idx}`} className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
            <div className="text-xs text-slate-500">
              Stage: <span className="font-medium">{p.stage}</span>
              {p.model ? <> · Model: <span className="font-medium">{p.model}</span></> : null}
            </div>
            {typeof p.schemaChars === 'number' && (
              <div className="text-xs text-slate-500">Schema chars: {p.schemaChars}</div>
            )}
            {p.systemPrompt && (
              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">System Prompt</div>
                <pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{p.systemPrompt}</pre>
              </div>
            )}
            {p.userContent && (
              <div>
                <div className="text-xs font-medium text-slate-600 mb-1">User Content</div>
                <pre className="text-xs leading-relaxed text-slate-700 whitespace-pre-wrap break-words">{p.userContent}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </CollapsibleBox>
  );
}

