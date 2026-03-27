'use client';

import React from 'react';
import { Message, UI_STRINGS } from '@/types/types';
import StreamingText from './StreamingText';
import CollapsibleBox from './CollapsibleBox';
import ChartRenderer from './ChartRenderer';

interface MessageBubbleProps {
  message: Message;
}

/**
 * UserBubble — Tin nhắn của user: căn phải, nền xám
 */
function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[70%] bg-[#f4f4f4] rounded-3xl px-5 py-3 text-[15px] leading-relaxed text-slate-800">
        {content}
      </div>
    </div>
  );
}

/**
 * ThinkingSection — Nội dung thinking (collapsible)
 */
function ThinkingSection({ thinking, tokens }: { thinking: string; tokens?: number }) {
  return (
    <CollapsibleBox title="Suy nghĩ" badge={tokens ? `${tokens.toLocaleString()} tokens` : undefined}>
      <div className="px-4 py-3 text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">
        {thinking}
      </div>
    </CollapsibleBox>
  );
}

/**
 * SqlSection — Câu SQL (collapsible, đồng nhất style)
 */
function SqlSection({ sql }: { sql: string }) {
  return (
    <CollapsibleBox title="Câu truy vấn SQL">
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

/**
 * TableSection — Bảng kết quả (collapsible)
 */
function TableSection({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <CollapsibleBox title="Dữ liệu chi tiết" badge={`${rows.length.toLocaleString()} dòng`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              {columns.map((col, i) => (
                <th key={i} className="px-4 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap border-b border-slate-200">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-slate-700 whitespace-nowrap border-b border-slate-100">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleBox>
  );
}

/**
 * TokenSection — Token usage (collapsible)
 */
function TokenSection({ tokenUsage, replyTokenUsage }: { tokenUsage?: Message['tokenUsage']; replyTokenUsage?: Message['replyTokenUsage'] }) {
  if (!tokenUsage) return null;

  const totalAll = tokenUsage.total + (replyTokenUsage?.total || 0);

  return (
    <CollapsibleBox title="Token usage" badge={`${totalAll.toLocaleString()} total`}>
      <div className="px-4 py-3 text-sm font-mono text-slate-500 space-y-1">
        <div className="font-medium text-slate-600 mb-1">SQL Generation:</div>
        <div className="pl-2">Input    : {tokenUsage.input.toLocaleString()}</div>
        <div className="pl-4">Schema     : {tokenUsage.schema.toLocaleString()}</div>
        <div className="pl-4">Instruction: {tokenUsage.instruction.toLocaleString()}</div>
        <div className="pl-4">Question   : {tokenUsage.question.toLocaleString()}</div>
        {tokenUsage.thinking > 0 && <div className="pl-2">Thinking : {tokenUsage.thinking.toLocaleString()}</div>}
        <div className="pl-2">Output   : {tokenUsage.output.toLocaleString()}</div>
        <div className="pl-2">Subtotal : {tokenUsage.total.toLocaleString()}</div>

        {replyTokenUsage && (
          <>
            <div className="font-medium text-slate-600 mt-2 mb-1">Phân tích &amp; trả lời:</div>
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

/**
 * ActionButtons — Copy, Like, Dislike, Regenerate
 */
function ActionButtons() {
  return (
    <div className="flex items-center gap-1 text-slate-400">
      <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_COPY}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_LIKE}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
        </svg>
      </button>
      <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_DISLIKE}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 15V19a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
          <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
        </svg>
      </button>
      <button className="p-1.5 hover:bg-slate-100 rounded-lg hover:text-slate-600 transition-colors" title={UI_STRINGS.ACTION_REGENERATE}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>
  );
}

/**
 * MessageBubble — Component chính hiển thị tin nhắn
 */
export default function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return <UserBubble content={message.content} />;
  }

  const { content, sql, thinking, tokenUsage, replyTokenUsage, columns, rows, chartConfig } = message;

  return (
    <div className="space-y-3">
      {/* 1. Collapsible boxes — chi tiết kỹ thuật */}
      {thinking && <ThinkingSection thinking={thinking} tokens={tokenUsage?.thinking} />}
      {sql && <SqlSection sql={sql} />}
      {columns && rows && rows.length > 0 && <TableSection columns={columns} rows={rows} />}
      <TokenSection tokenUsage={tokenUsage} replyTokenUsage={replyTokenUsage} />

      {/* 2. Biểu đồ — trực quan hoá dữ liệu */}
      {chartConfig && columns && rows && rows.length > 1 && (
        <ChartRenderer columns={columns} rows={rows} config={chartConfig} />
      )}

      {/* 3. Câu trả lời chính — streaming, hiện cuối cùng */}
      {content && (
        <div className="text-[15px] leading-relaxed text-slate-800 bg-slate-50 rounded-xl px-5 py-4">
          <StreamingText text={content} speed={12} />
        </div>
      )}

      {/* 4. Action buttons */}
      <ActionButtons />
    </div>
  );
}
