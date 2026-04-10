'use client';

import React from 'react';
import { Message } from '@/types/types';
import CollapsibleBox from '../shared/CollapsibleBox';

export default function TokenSection({ tokenUsage, replyTokenUsage }: { tokenUsage?: Message['tokenUsage']; replyTokenUsage?: Message['replyTokenUsage'] }) {
  if (!tokenUsage) return null;

  const totalAll = tokenUsage.total + (replyTokenUsage?.total || 0);

  return (
    <CollapsibleBox title="Token usage" badge={`${totalAll.toLocaleString()} total`} defaultOpen={false}>
      <div className="px-4 py-3 text-sm font-mono text-slate-500 space-y-1">
        <div className="font-medium text-slate-600 mb-1">SQL Generation:</div>
        <div className="pl-2">Input    : {(tokenUsage.input ?? 0).toLocaleString()}</div>
        <div className="pl-4">Schema     : {(tokenUsage.schema ?? 0).toLocaleString()}</div>
        <div className="pl-4">Instruction: {(tokenUsage.instruction ?? 0).toLocaleString()}</div>
        <div className="pl-4">Question   : {(tokenUsage.question ?? 0).toLocaleString()}</div>
        {(tokenUsage.thinking ?? 0) > 0 && <div className="pl-2">Thinking : {tokenUsage.thinking.toLocaleString()}</div>}
        <div className="pl-2">Output   : {(tokenUsage.output ?? 0).toLocaleString()}</div>
        <div className="pl-2">Subtotal : {(tokenUsage.total ?? 0).toLocaleString()}</div>

        {replyTokenUsage && (
          <>
            <div className="font-medium text-slate-600 mt-2 mb-1">Phan tich &amp; tra loi:</div>
            <div className="pl-2">Input    : {replyTokenUsage.input.toLocaleString()}</div>
            {replyTokenUsage.thinking > 0 && <div className="pl-2">Thinking : {replyTokenUsage.thinking.toLocaleString()}</div>}
            <div className="pl-2">Output   : {replyTokenUsage.output.toLocaleString()}</div>
            <div className="pl-2">Subtotal : {replyTokenUsage.total.toLocaleString()}</div>
          </>
        )}

        <div className="font-semibold text-slate-700 pt-1 border-t border-slate-200 mt-2">
          Grand total: {totalAll.toLocaleString()}
        </div>
      </div>
    </CollapsibleBox>
  );
}
