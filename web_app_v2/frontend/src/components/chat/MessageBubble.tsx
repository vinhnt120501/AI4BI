'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, ChartBlock } from '@/types/types';
import StreamingText from './shared/StreamingText';
import DynamicChart from './DynamicChart';
import BlockRenderer from './blocks/BlockRenderer';
import UserBubble from './sections/UserBubble';
import SqlSection from './sections/SqlSection';
import TableSection from './sections/TableSection';
import TokenSection from './sections/TokenSection';
import TimingSection from './sections/TimingSection';
import ActionButtons from './sections/ActionButtons';
import LlmPayloadSection from './sections/LlmPayloadSection';
import FollowUpSuggestions from './sections/FollowUpSuggestions';
import ProgressTimeline from './sections/ProgressTimeline';
import { MarkdownTableWrapper } from './MarkdownTableRenderer';

interface MessageBubbleProps {
  message: Message;
  isLatestAssistant?: boolean;
  onSuggestionClick?: (question: string) => void;
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
  isLatestAssistant = false,
  onSuggestionClick,
}: MessageBubbleProps) {
  if (message.role === 'user') {
    return <UserBubble content={message.content} />;
  }

  const {
    content,
    sql,
    tokenUsage,
    replyTokenUsage,
    columns,
    rows,
    chartConfig,
    blocks,
    llmDebugPayloads,
    followUpSuggestions,
    statusText,
    currentStep,
    isDone,
    timings,
  } = message;

  const hasBlocks = blocks && blocks.length > 0;

  // Strip markdown tables from text when VIS_CONFIG blocks exist (prevent duplicate data)
  const displayContent = hasBlocks && content
    ? content.replace(/\n?\|[^\n]+\|(\n\|[^\n]+\|)*/g, '').trim()
    : content;

  // Fallback: nếu không có blocks, tạo ChartBlock từ chartConfig hoặc auto-detect
  const fallbackBlock: ChartBlock | null = !hasBlocks
    ? (chartConfig
      ? { type: 'chart', chartType: chartConfig.type, xKey: chartConfig.xKey, yKeys: chartConfig.yKeys, yKey: chartConfig.yKey, options: chartConfig.options }
      : (columns && rows ? detectChartConfig(columns, rows) : null))
    : null;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Progress Timeline - Only show during thinking */}
      {!isDone && (
        <ProgressTimeline currentStep={currentStep || 0} statusText={statusText || ''} />
      )}

      {sql && <SqlSection sql={sql} />}
      {columns && <TableSection columns={columns} rows={rows || []} />}
      {llmDebugPayloads && llmDebugPayloads.length > 0 && <LlmPayloadSection payloads={llmDebugPayloads} />}
      <TokenSection tokenUsage={tokenUsage} replyTokenUsage={replyTokenUsage} />
      <TimingSection timings={timings} />

      {/* Dashboard blocks (ưu tiên) hoặc fallback chart đơn */}
      {hasBlocks && columns && rows ? (
        <BlockRenderer blocks={blocks} columns={columns} rows={rows} />
      ) : (
        fallbackBlock && columns && rows && rows.length > 1 && (
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            <DynamicChart block={fallbackBlock} columns={columns} rows={rows} />
          </div>
        )
      )}

      {displayContent && (
        <div className="text-[15px] leading-relaxed text-slate-800 bg-white border border-slate-100 rounded-2xl px-6 py-5 shadow-sm overflow-hidden">
          <div className="prose prose-slate max-w-none prose-p:my-2 prose-headings:mb-3 prose-headings:mt-6 first:prose-headings:mt-0 prose-table:my-4 prose-table:text-sm">
            {message.isDone ? (
              <MarkdownTableWrapper>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({ children }) => (
                      <div className="overflow-x-auto rounded-lg border border-slate-200 my-4">
                        <table className="w-full text-sm border-collapse min-w-[600px]">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
                    th: ({ children }) => <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200 whitespace-nowrap">{children}</th>,
                    td: ({ children }) => <td className="px-3 py-2 text-[13px] text-slate-700 border-b border-slate-100 whitespace-nowrap">{children}</td>,
                    tr: ({ children }) => <tr className="even:bg-slate-50/30 hover:bg-blue-50/30 transition-colors">{children}</tr>,
                  }}
                >
                  {displayContent}
                </ReactMarkdown>
              </MarkdownTableWrapper>
            ) : (
              <StreamingText text={displayContent} speed={12} />
            )}
          </div>
        </div>
      )}
      {isLatestAssistant && followUpSuggestions && followUpSuggestions.length > 0 && onSuggestionClick && (
        <FollowUpSuggestions suggestions={followUpSuggestions} onSelect={onSuggestionClick} />
      )}

      {message.isDone && (
        <ActionButtons onCopy={() => {
          if (displayContent) {
            navigator.clipboard.writeText(displayContent);
          }
        }} />
      )}
    </div>
  );
}
