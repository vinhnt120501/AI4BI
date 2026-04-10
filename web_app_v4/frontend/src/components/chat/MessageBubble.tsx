'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, ChartBlock } from '@/types/types';
import StreamingText from './shared/StreamingText';
import { formatAssistantText, stripFollowUpSection } from './shared/formatAssistantText';
import DynamicChart from './DynamicChart';
import BlockRenderer from './blocks/BlockRenderer';
import UserBubble from './sections/UserBubble';
import ActionButtons from './sections/ActionButtons';
import ProgressTimeline from './sections/ProgressTimeline';
import { MarkdownTableWrapper } from './MarkdownTableRenderer';

interface MessageBubbleProps {
  message: Message;
  copyText?: string;
}

/**
 * Auto-detect chart config khi AI không trả chart_config nhưng data có cột số
 */
function detectChartConfig(columns: string[], rows: string[][]): ChartBlock | null {
  if (rows.length < 2) return null;
  let xKey = '';
  const yKeys: string[] = [];
  for (let i = 0; i < columns.length; i++) {
    const val = rows[0][i];
    if (!isNaN(Number(val)) && val !== '') {
      yKeys.push(columns[i]);
    } else if (!xKey) {
      xKey = columns[i];
    }
  }
  if (!xKey || yKeys.length === 0) return null;
  const chartType = 'bar' as const;
  const options = rows.length >= 15 ? { layout: 'vertical' as const } : undefined;
  return { type: 'chart', chartType, xKey, yKeys, options, title: 'Auto-detected chart' };
}

export default function MessageBubble({
  message,
  copyText,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return <UserBubble content={message.content} />;
  }

  const {
    content,
    columns,
    rows,
    chartConfig,
    blocks,
    isDone,
    currentStep,
    statusText,
    eventTimeline,
  } = message;

  const hasBlocks = blocks && blocks.length > 0;

  // Strip markdown tables from text when VIS_CONFIG blocks exist (prevent duplicate data)
  const displayContent = hasBlocks && content
    ? content.replace(/\n?\|[^\n]+\|(\n\|[^\n]+\|)*/g, '').trim()
    : content;

  const strippedContent = displayContent
    ? stripFollowUpSection(displayContent, message.followUpSuggestions || [])
    : displayContent;
  const formattedDoneContent = strippedContent ? formatAssistantText(strippedContent) : strippedContent;

  // Fallback: nếu không có blocks, tạo ChartBlock từ chartConfig hoặc auto-detect
  // Chỉ render fallback sau khi pipeline hoàn tất (tránh hiển thị chart "tạm" sơ sài khi mới có data).
  const fallbackBlock: ChartBlock | null = !hasBlocks && Boolean(isDone)
    ? (chartConfig
      ? { type: 'chart', chartType: chartConfig.type, xKey: chartConfig.xKey, yKeys: chartConfig.yKeys, yKey: chartConfig.yKey, options: chartConfig.options }
      : (columns && rows ? detectChartConfig(columns, rows) : null))
    : null;
  const canCopy = Boolean(copyText?.trim());

  const hasProgress = Boolean(
    (eventTimeline && eventTimeline.length > 0) ||
    (message.statusHistory && message.statusHistory.length > 0) ||
    statusText,
  );

  return (
    <div className="group/msg space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Progress timeline bám theo SSE events thật của backend */}
      {hasProgress ? (
        <ProgressTimeline
          currentStep={currentStep || 0}
          statusText={statusText}
          statusHistory={message.statusHistory}
          eventTimeline={eventTimeline}
          isDone={isDone}
          startedAt={message.startedAt}
          sql={message.sql}
          columns={message.columns}
          rows={message.rows}
          tokenUsage={message.tokenUsage}
          replyTokenUsage={message.replyTokenUsage}
        />
      ) : !isDone ? (
        <div className="flex items-center gap-2.5 py-2">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
        </div>
      ) : null}

      {/* Dashboard blocks (ưu tiên) hoặc fallback chart đơn */}
      {hasBlocks && columns && rows ? (
        <BlockRenderer blocks={blocks} columns={columns} rows={rows} />
      ) : (
        fallbackBlock && columns && rows && rows.length > 1 && (
          <div className="py-1">
            <DynamicChart block={fallbackBlock} columns={columns} rows={rows} />
          </div>
        )
      )}

      {strippedContent && (
        <div className="overflow-hidden px-1 py-1 text-[15px] leading-relaxed text-slate-800">
          <div className="markdown-output prose prose-slate max-w-none prose-p:my-2 prose-headings:mb-3 prose-headings:mt-6 first:prose-headings:mt-0 prose-table:my-4 prose-table:text-sm prose-headings:font-bold prose-headings:text-slate-900 prose-strong:text-slate-900 prose-li:text-slate-900 prose-ol:text-slate-900 prose-ol:marker:text-slate-900 prose-li:marker:font-bold prose-ol:marker:font-bold">
            {message.isDone ? (
              <MarkdownTableWrapper>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <div className="my-4 overflow-x-auto rounded-lg">
                        <table className="w-full text-sm border-collapse min-w-[600px]">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
                    th: ({ children }) => <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 text-[13px] text-slate-700 border-b border-slate-100 whitespace-nowrap">{children}</td>,
                    tr: ({ children }) => <tr className="even:bg-slate-50/30 hover:bg-blue-50/30 transition-colors">{children}</tr>,
                  }}
                >
                  {formattedDoneContent}
                </ReactMarkdown>
              </MarkdownTableWrapper>
            ) : (
              <StreamingText text={strippedContent} />
            )}
          </div>
          {canCopy && (
            <div className="mt-3 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200">
              <ActionButtons copyText={copyText || ''} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
