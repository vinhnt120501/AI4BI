'use client';

import React from 'react';
import { Message, TokenUsage } from '@/types/types';
import CollapsibleBox from '../shared/CollapsibleBox';

function TokenRow({ label, value, indent = false }: { label: string; value?: number; indent?: boolean }) {
  if (value === undefined) return null;
  return (
    <>
      <span className={`${indent ? 'pl-4 text-[12px] opacity-70' : ''}`}>{label}</span>
      <span className={`${indent ? 'text-[12px] opacity-70' : ''}`}>{value.toLocaleString()}</span>
    </>
  );
}

export default function TokenSection({ tokenUsage, replyTokenUsage }: { tokenUsage?: TokenUsage; replyTokenUsage?: TokenUsage }) {
  if (!tokenUsage) return null;

  const totalAll = tokenUsage.total + (replyTokenUsage?.total || 0);

  return (
    <CollapsibleBox title="Token usage" badge={`${totalAll.toLocaleString()} total`} defaultOpen={false}>
      <div className="px-4 py-3 text-sm font-mono text-slate-500 space-y-4">
        {/* Stage 1 */}
        <div>
          <div className="font-medium text-slate-600 mb-1">SQL Generation:</div>
          <div className="grid grid-cols-[120px_1fr] gap-x-2 pl-2">
            <TokenRow label="Input:" value={tokenUsage.input} />
            <TokenRow label="- Schema:" value={tokenUsage.schema} indent />
            <TokenRow label="- Rules:" value={tokenUsage.rules} indent />
            <TokenRow label="- Instruction:" value={tokenUsage.instruction} indent />
            <TokenRow label="- Memory:" value={tokenUsage.memory} indent />
            <TokenRow label="- Question:" value={tokenUsage.question} indent />
            
            {tokenUsage.thinking > 0 && <TokenRow label="Thinking:" value={tokenUsage.thinking} />}
            <TokenRow label="Output:" value={tokenUsage.output} />
            <TokenRow label="Subtotal:" value={tokenUsage.total} />
          </div>
        </div>

        {/* Stage 2 */}
        {replyTokenUsage && (
          <div>
            <div className="font-medium text-slate-600 mb-1">Analysis & Reply:</div>
            <div className="grid grid-cols-[120px_1fr] gap-x-2 pl-2">
              <TokenRow label="Input:" value={replyTokenUsage.input} />
              <TokenRow label="- Rules:" value={replyTokenUsage.rules} indent />
              <TokenRow label="- Instruction:" value={replyTokenUsage.instruction} indent />
              <TokenRow label="- Memory:" value={replyTokenUsage.memory} indent />
              <TokenRow label="- Question:" value={replyTokenUsage.question} indent />
              <TokenRow label="- Data:" value={replyTokenUsage.data} indent />
              
              {replyTokenUsage.thinking > 0 && <TokenRow label="Thinking:" value={replyTokenUsage.thinking} />}
              <TokenRow label="Output:" value={replyTokenUsage.output} />
              <TokenRow label="Subtotal:" value={replyTokenUsage.total} />
            </div>
          </div>
        )}

        <div className="font-semibold text-slate-700 pt-2 border-t border-slate-200">
          Grand total: {totalAll.toLocaleString()}
        </div>
      </div>
    </CollapsibleBox>
  );
}
