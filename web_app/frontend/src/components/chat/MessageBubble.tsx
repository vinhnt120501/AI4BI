'use client';

import React from 'react';
import { Message, ChartBlock } from '@/types/types';
import StreamingText from './shared/StreamingText';
import DynamicChart from './DynamicChart';
import BlockRenderer from './blocks/BlockRenderer';
import UserBubble from './sections/UserBubble';
import ThinkingSection from './sections/ThinkingSection';
import SqlSection from './sections/SqlSection';
import TableSection from './sections/TableSection';
import TokenSection from './sections/TokenSection';
import ActionButtons from './sections/ActionButtons';
import LlmPayloadSection from './sections/LlmPayloadSection';
import FollowUpSuggestions from './sections/FollowUpSuggestions';

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
    thinking,
    tokenUsage,
    replyTokenUsage,
    columns,
    rows,
    chartConfig,
    blocks,
    llmDebugPayloads,
    followUpSuggestions,
  } = message;

  const hasBlocks = blocks && blocks.length > 0;

  // Fallback: nếu không có blocks, tạo ChartBlock từ chartConfig hoặc auto-detect
  const fallbackBlock: ChartBlock | null = !hasBlocks
    ? (chartConfig
      ? { type: 'chart', chartType: chartConfig.type, xKey: chartConfig.xKey, yKeys: chartConfig.yKeys, yKey: chartConfig.yKey, options: chartConfig.options }
      : (columns && rows ? detectChartConfig(columns, rows) : null))
    : null;

  return (
    <div className="space-y-3">
      {thinking && <ThinkingSection thinking={thinking} tokens={tokenUsage?.thinking} />}
      {sql && <SqlSection sql={sql} />}
      {llmDebugPayloads && llmDebugPayloads.length > 0 && <LlmPayloadSection payloads={llmDebugPayloads} />}
      {columns && <TableSection columns={columns} rows={rows || []} />}
      <TokenSection tokenUsage={tokenUsage} replyTokenUsage={replyTokenUsage} />

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

      {content && (
        <div className="text-[15px] leading-relaxed text-slate-800 bg-slate-50 rounded-xl px-5 py-4">
          <StreamingText text={content} speed={12} />
        </div>
      )}
      {isLatestAssistant && followUpSuggestions && followUpSuggestions.length > 0 && onSuggestionClick && (
        <FollowUpSuggestions suggestions={followUpSuggestions} onSelect={onSuggestionClick} />
      )}

      <ActionButtons />
    </div>
  );
}
