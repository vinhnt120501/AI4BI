'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { MessageEvent, TokenUsage } from '@/types/types';

interface ProgressTimelineProps {
  currentStep: number;
  statusText?: string;
  statusHistory?: string[];
  eventTimeline?: MessageEvent[];
  isDone?: boolean;
  startedAt?: number;
  sql?: string;
  thinking?: string;
  thinkingByStage?: Record<string, string>;
  columns?: string[];
  rows?: string[][];
  tokenUsage?: TokenUsage;
  replyTokenUsage?: TokenUsage;
}

function formatElapsed(atMs?: number) {
  if (typeof atMs !== 'number' || atMs < 0) return '';
  return `${(atMs / 1000).toFixed(1)}s`;
}

function translateEvent(event: string) {
  switch (event) {
    case 'debug_payload': return 'Khởi tạo ngữ cảnh';
    case 'status': return 'Đang xử lý';
    case 'thinking': return 'Phân tích yêu cầu';
    case 'sql': return 'Tạo truy vấn SQL';
    case 'data': return 'Nhận dữ liệu';
    case 'additional_data': return 'Truy vấn bổ sung';
    case 'qa_result': return 'Kiểm tra chất lượng';
    case 'reply': return 'Sinh phản hồi';
    case 'suggestions': return 'Tạo gợi ý tiếp theo';
    case 'timing': return 'Thời gian xử lý';
    case 'done': return 'Hoàn tất';
    case 'final': return 'Xong';
    case 'error': return 'Lỗi xử lý';
    default: return event;
  }
}

function buildSummaryText(item?: MessageEvent) {
  if (!item) return 'Đang xử lý yêu cầu.';
  switch (item.event) {
    case 'debug_payload': return 'Đang chuẩn bị ngữ cảnh xử lý.';
    case 'status': return item.detail || 'Đang xử lý yêu cầu.';
    case 'thinking': return 'Đang phân tích yêu cầu.';
    case 'sql': return 'Đã tạo truy vấn SQL.';
    case 'data': return 'Đã nhận dữ liệu từ hệ thống.';
    case 'additional_data': return 'Đang truy vấn bổ sung dữ liệu.';
    case 'qa_result': return item.detail || 'Đã kiểm tra chất lượng phân tích.';
    case 'reply': return 'Đã tạo phản hồi cho người dùng.';
    case 'suggestions': return 'Đã tạo các gợi ý tiếp theo.';
    case 'timing': return item.detail || 'Đã ghi nhận thời gian xử lý.';
    case 'done':
    case 'final': return 'Hoàn tất quy trình xử lý.';
    case 'error': return 'Có lỗi trong quá trình xử lý.';
    default: return translateEvent(item.event);
  }
}

function stripTrailingDots(text: string) {
  return text.replace(/\s*(\.\.\.|…)\s*$/, '');
}

function normalizeIdentifier(text: string) {
  return text.replace(/^[`"'[]+/, '').replace(/[`"'\]]+$/, '').replace(/[;,]$/, '').trim();
}

function stripSqlComments(sql: string) {
  return sql.replace(/--.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function extractCteNames(sql?: string) {
  if (typeof sql !== 'string' || !sql.trim()) return [];
  const source = stripSqlComments(sql);
  const withMatch = /\bwith\b/i.exec(source);
  if (!withMatch) return [];
  const startIndex = withMatch.index + withMatch[0].length;
  const afterWith = source.slice(startIndex);
  let depth = 0;
  let topLevel = '';
  for (let i = 0; i < afterWith.length; i++) {
    const ch = afterWith[i];
    if (ch === '(') { depth += 1; topLevel += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); topLevel += ch; continue; }
    if (depth === 0) {
      topLevel += ch;
      if (/\bselect\b/i.test(topLevel.slice(-12))) break;
    } else {
      topLevel += ' ';
    }
  }
  const results: string[] = [];
  const re = /\b([`"[\]\w.]+)\s*(?:\([^)]*\))?\s+as\s*\(/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(topLevel))) {
    const name = normalizeIdentifier(match[1] || '');
    if (name && !results.includes(name)) results.push(name);
  }
  return results;
}

function extractTableNames(sql?: string) {
  if (typeof sql !== 'string' || !sql.trim()) return [];
  const normalized = stripSqlComments(sql).replace(/\s+/g, ' ').trim();
  const cteNames = new Set(extractCteNames(normalized).map((name) => name.toLowerCase()));
  const results: string[] = [];
  const re = /\b(from|join)\s+([`"[\]\w.]+|\([^)]+?\))/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(normalized))) {
    const raw = match[2] || '';
    if (!raw || raw.startsWith('(')) continue;
    const name = normalizeIdentifier(raw);
    if (!name) continue;
    if (cteNames.has(name.toLowerCase())) continue;
    if (!results.includes(name)) results.push(name);
  }
  return results;
}

function computeStageIndex(items: MessageEvent[], lastIndex: number) {
  const TOTAL_STAGES = 12;
  const last = items[lastIndex];
  if (!last) return { stageIndex: undefined as number | undefined, totalStages: TOTAL_STAGES };
  let statusOrdinal = 0;
  for (let i = 0; i <= lastIndex; i++) { if (items[i]?.event === 'status') statusOrdinal += 1; }
  const stageIndex = (() => {
    switch (last.event) {
      case 'debug_payload': return 1;
      case 'status': return statusOrdinal === 1 ? 2 : statusOrdinal === 2 ? 5 : statusOrdinal === 3 ? 7 : 8;
      case 'thinking': return 3;
      case 'sql': return 4;
      case 'data': return 6;
      case 'additional_data': return 6;
      case 'reply': return 8;  // Visualization completed
      case 'qa_result': return 9;  // QA check happens AFTER reply, BEFORE suggestions
      case 'suggestions': return 10;
      case 'done':
      case 'final': return 12;
      case 'error': return 12;
      default: return undefined;
    }
  })();
  return { stageIndex, totalStages: TOTAL_STAGES };
}

function formatToken(value?: number) {
  if (typeof value !== 'number') return '—';
  return value.toLocaleString();
}

function TokenRow({ label, value, indent = false }: { label: string; value?: number; indent?: boolean }) {
  if (value === undefined) return null;
  return (
    <>
      <div className={`${indent ? 'pl-4 text-[11px] text-slate-500' : 'text-[11px] text-slate-600'} whitespace-nowrap`}>{label}</div>
      <div className={`${indent ? 'text-[11px] text-slate-500' : 'text-[11px] text-slate-700'} text-right`}>{formatToken(value)}</div>
    </>
  );
}

function TokenBreakdown({ title, usage }: { title: string; usage: TokenUsage }) {
  return (
    <div className="w-fit min-w-[200px] rounded-xl bg-white px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-700">{title}</div>
      <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 font-mono">
        <TokenRow label="Input" value={usage.input} />
        <TokenRow label="- Schema" value={usage.schema} indent />
        <TokenRow label="- Rules" value={usage.rules} indent />
        {(usage.instruction ?? 0) > 0 && <TokenRow label="- Instruction" value={usage.instruction} indent />}
        {(usage.memory ?? 0) > 0 && <TokenRow label="- Memory" value={usage.memory} indent />}
        <TokenRow label="- Question" value={usage.question} indent />
        <TokenRow label="- Data" value={usage.data} indent />
        {usage.thinking > 0 ? <TokenRow label="Thinking" value={usage.thinking} /> : null}
        <TokenRow label="Output" value={usage.output} />
        <TokenRow label="Subtotal" value={usage.total} />
      </div>
    </div>
  );
}

function ThinkingPanel({ stage, content, isStreaming }: { stage: string | null; content: string; isStreaming: boolean }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const cleanContent = (content || '')
    .replace(/<\/?(thinking|thought|reasoning)>?/gi, '')
    .replace(/^(\s*>\s*)+/gm, '')
    .trim();

  const stageLabel = stage === 'sql' ? '(Tạo SQL)' : stage === 'agentic' ? '(Đánh giá dữ liệu)' : stage === 'reply' ? '(Phân tích & trả lời)' : '';

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [cleanContent]);

  return (
    <div className="mt-2 rounded-xl bg-white px-3 py-2 animate-in fade-in duration-200">
      <div className="text-[11px] font-semibold tracking-wide text-slate-500 mb-2">
        Suy luận {stageLabel}
        {isStreaming && (
          <span className="ml-2 inline-block animate-pulse text-blue-500">● đang phân tích</span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700"
      >
        {cleanContent || (isStreaming ? '' : 'Không có nội dung.')}
        {isStreaming && cleanContent && <span className="animate-pulse text-blue-500">|</span>}
      </div>
    </div>
  );
}

export default function ProgressTimeline({
  currentStep,
  statusText,
  statusHistory,
  eventTimeline,
  isDone,
  startedAt,
  sql,
  thinking,
  thinkingByStage,
  columns,
  rows,
  tokenUsage,
  replyTokenUsage,
}: ProgressTimelineProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isDone) return;
    if (typeof startedAt !== 'number') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [isDone, startedAt]);

  const baseItems: MessageEvent[] = eventTimeline && eventTimeline.length > 0
    ? eventTimeline.filter((item) => item.event !== 'timing')
    : (statusHistory || []).map((text) => ({ event: 'status', detail: text, atMs: undefined }));

  const items: MessageEvent[] = useMemo(() => {
    const next = [...baseItems];
    const last = next[next.length - 1];
    if (!isDone || !last || last.event === 'final') return next;
    const lastAt = [...next].reverse().find((item) => typeof item.atMs === 'number')?.atMs;
    next.push({ event: 'final', atMs: lastAt });
    return next;
  }, [baseItems, isDone]);

  if (items.length === 0 && !statusText && currentStep <= 0) return null;

  const lastItem = items[items.length - 1];
  const { stageIndex, totalStages } = computeStageIndex(items, items.length - 1);
  const maxElapsed = items.reduce<number | undefined>((latest, item) => {
    if (typeof item.atMs !== 'number') return latest;
    return typeof latest === 'number' ? Math.max(latest, item.atMs) : item.atMs;
  }, undefined);
  const liveElapsed = typeof startedAt === 'number' ? Math.max(0, nowMs - startedAt) : undefined;
  const totalElapsed = !isDone && typeof liveElapsed === 'number'
    ? (typeof maxElapsed === 'number' ? Math.max(maxElapsed, liveElapsed) : liveElapsed)
    : maxElapsed;
  const isSummaryActive = Boolean(!isDone && lastItem && lastItem.event !== 'final' && lastItem.event !== 'done' && lastItem.event !== 'qa_result' && lastItem.event !== 'suggestions' && lastItem.event !== 'error');
  const dots = isSummaryActive ? '.'.repeat(((Math.floor(nowMs / 450)) % 3) + 1) : '';
  const summaryText = isSummaryActive ? stripTrailingDots(buildSummaryText(lastItem)) : buildSummaryText(lastItem);
  const sqlText = typeof sql === 'string' ? sql.trim() : '';
  const colNames = Array.isArray(columns) ? columns.filter(Boolean) : [];
  const rowValues = Array.isArray(rows) ? rows : [];
  const tableNames = useMemo(() => extractTableNames(sqlText), [sqlText]);

  return (
    <details className="group rounded-2xl bg-white w-full">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-2 text-slate-700 marker:content-none">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-700">Quá trình xử lý</div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] text-slate-500">
            <span key={summaryText} className={`inline-block animate-in fade-in slide-in-from-bottom-1 duration-300 ${isSummaryActive ? 'text-slate-600' : ''}`}>{summaryText}</span>
            {dots ? <span className="inline-block w-4 font-mono text-slate-400 animate-in fade-in duration-200">{dots}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-slate-400">
          {typeof stageIndex === 'number' ? <span>Bước {stageIndex}/{totalStages}</span> : null}
          {typeof totalElapsed === 'number' ? <span>{formatElapsed(totalElapsed)}</span> : null}
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
        </div>
      </summary>

      <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 group-open:animate-in group-open:fade-in group-open:slide-in-from-top-1 group-open:duration-300">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isError = item.event === 'error';
          const isTerminal = item.event === 'done' || item.event === 'suggestions' || item.event === 'final';
          const displayAtMs = (() => {
            if (isLast && !isTerminal && typeof liveElapsed === 'number') {
              return typeof item.atMs === 'number' ? Math.max(item.atMs, liveElapsed) : liveElapsed;
            }
            return item.atMs;
          })();

          // Calculate stage index for this item
          const { stageIndex: itemStageIndex, totalStages } = computeStageIndex(items, index);

          const isSqlStep = item.event === 'sql';
          const isDataStep = item.event === 'data';
          let statusOrdinal = 0;
          for (let k = 0; k <= index; k++) { if (items[k]?.event === 'status') statusOrdinal++; }
          const isAnalysisStatus = item.event === 'status' && (statusOrdinal === 2 || statusOrdinal === 3);

          if (item.event === 'thinking') return null;

          // Determine which thinking stage to show for this timeline step
          const thinkingStage: string | null = (() => {
            if (isSqlStep || (item.event === 'status' && statusOrdinal === 2)) return 'sql';
            if (item.event === 'additional_data' || (item.detail && item.detail.includes('truy vấn bổ sung'))) return 'agentic';
            if (item.event === 'status' && statusOrdinal === 3) return 'reply';
            if (item.event === 'reply') return 'reply';
            return null;
          })();
          // Use stage-specific thinking when available.
          // If thinkingByStage exists (new sessions), show ONLY the stage's content.
          // If thinkingByStage doesn't exist (old history), fall back to full thinking.
          const stageThinkingContent = thinkingByStage
            ? (thinkingStage ? thinkingByStage[thinkingStage] || '' : '')
            : (thinking || '');

          const sqlTablesColsKey = isSqlStep ? `sql_tables_cols_${index}` : '';
          const sqlQueryKey = isSqlStep ? `sql_query_${index}` : '';
          const dataTablesColsKey = isDataStep ? `data_tables_cols_${index}` : '';
          const qaIssuesKey = (item.event === 'qa_result' || item.event === 'additional_data') && item.raw_data?.issues && item.raw_data.issues.length > 0
            ? `qa_issues_${item.event}_${index}`
            : '';

          const canShowSqlTablesCols = isSqlStep && (tableNames.length > 0 || colNames.length > 0);
          const canShowSqlQuery = isSqlStep && Boolean(sqlText);
          const canShowDataTablesCols = isDataStep && (colNames.length > 0 || rowValues.length > 0);
          // Show thinking panel when:
          // - Has stage-specific content, OR
          // - Still streaming (not done yet) and this is a thinking-relevant step, OR
          // - Old history (no thinkingByStage) with full thinking content
          const isThinkingRelevantStep = Boolean(thinkingStage || isAnalysisStatus || isSqlStep);
          const canShowThinking = isThinkingRelevantStep && Boolean(
            stageThinkingContent || (!isDone && isThinkingRelevantStep)
          );
          const canShowQaIssues = Boolean(qaIssuesKey);

          const sqlTablesColsOpen = sqlTablesColsKey ? Boolean(openPanels[sqlTablesColsKey]) : false;
          const sqlQueryOpen = sqlQueryKey ? Boolean(openPanels[sqlQueryKey]) : false;
          const dataTablesColsOpen = dataTablesColsKey ? Boolean(openPanels[dataTablesColsKey]) : false;
          const qaIssuesOpen = qaIssuesKey ? Boolean(openPanels[qaIssuesKey]) : false;
          const canShowTokens = item.event === 'final' && Boolean(tokenUsage || replyTokenUsage);
          const tokensOpen = Boolean(openPanels.tokens);

          let icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />;
          if (isError) { icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500 fill-rose-500/10" />; }
          else if (item.event === 'qa_result') {
            // Extract decision from detail string
            const detail = item.detail || '';
            const hasPass = detail.includes('sẵn sàng giao');
            const needsImprovement = detail.includes('Cần cải thiện');
            const critical = detail.includes('Lỗi nghiêm trọng');

            if (hasPass) {
              icon = <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />;
            } else if (needsImprovement) {
              icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500 fill-amber-500/10" />;
            } else if (critical) {
              icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500 fill-rose-500/10" />;
            } else {
              icon = <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />;
            }
          }
          else if (isLast && !isTerminal) { icon = <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-slate-500" />; }
          else { icon = <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />; }

          return (
            <div key={`${item.event}-${index}`} className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
              {icon}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-medium leading-relaxed text-slate-700">
                    {typeof itemStageIndex === 'number' ? `Bước ${itemStageIndex}/${totalStages}. ` : ''}
                    {translateEvent(item.event)}
                  </div>
                  {displayAtMs !== undefined ? <span className="text-[11px] text-slate-400">{formatElapsed(displayAtMs)}</span> : null}
                </div>
                {item.detail ? <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-500">{item.detail}</div> : null}

                {canShowSqlTablesCols || canShowSqlQuery || canShowDataTablesCols || canShowThinking || canShowQaIssues ? (
                  <div className="mt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {canShowThinking && (
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white transition-all" onClick={() => setOpenPanels(p => ({ ...p, [`thinking_${thinkingStage}_${index}`]: !p[`thinking_${thinkingStage}_${index}`] }))}>
                          <span>{Boolean(openPanels[`thinking_${thinkingStage}_${index}`]) ? 'Ẩn suy luận' : 'Xem suy luận'}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${Boolean(openPanels[`thinking_${thinkingStage}_${index}`]) ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {canShowSqlTablesCols && (
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white transition-all" onClick={() => setOpenPanels(p => ({ ...p, [sqlTablesColsKey]: !p[sqlTablesColsKey] }))}>
                          <span>{sqlTablesColsOpen ? 'Ẩn bảng/cột' : 'Xem bảng/cột'}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sqlTablesColsOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {canShowSqlQuery && (
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white transition-all" onClick={() => setOpenPanels(p => ({ ...p, [sqlQueryKey]: !p[sqlQueryKey] }))}>
                          <span>{sqlQueryOpen ? 'Ẩn câu SQL' : 'Xem câu SQL'}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sqlQueryOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {canShowDataTablesCols && (
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white transition-all" onClick={() => setOpenPanels(p => ({ ...p, [dataTablesColsKey]: !p[dataTablesColsKey] }))}>
                          <span>{dataTablesColsOpen ? 'Ẩn bảng/cột' : 'Xem bảng/cột'}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dataTablesColsOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                      {canShowQaIssues && (
                        <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-100 transition-all" onClick={() => setOpenPanels(p => ({ ...p, [qaIssuesKey]: !p[qaIssuesKey] }))}>
                          <span>{qaIssuesOpen ? `Ẩn ${item.raw_data?.issues?.length || 0} vấn đề` : `Xem ${item.raw_data?.issues?.length || 0} vấn đề`}</span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${qaIssuesOpen ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>

                    {qaIssuesOpen && canShowQaIssues && item.raw_data?.issues && (
                      <div className="mt-2 space-y-1.5">
                        {item.raw_data.issues.map((issue: any, idx: number) => (
                          <div key={idx} className={`flex items-start gap-2 rounded-lg px-3 py-2 ${
                            issue.severity === 'critical' ? 'bg-rose-50 border border-rose-200' :
                            issue.severity === 'high' ? 'bg-amber-50 border border-amber-200' :
                            issue.severity === 'medium' ? 'bg-yellow-50 border border-yellow-200' :
                            'bg-slate-50 border border-slate-200'
                          }`}>
                            <span className="mt-0.5">
                              {issue.severity === 'critical' ? '🚨' :
                               issue.severity === 'high' ? '❌' :
                               issue.severity === 'medium' ? '⚠️' : '📝'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-semibold text-slate-700 uppercase">{issue.area}</div>
                              <div className="text-[12px] text-slate-600">{issue.what}</div>
                              {issue.how_to_fix && (
                                <div className="text-[11px] text-slate-500 mt-1">💡 {issue.how_to_fix}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {Boolean(openPanels[`thinking_${thinkingStage}_${index}`]) && canShowThinking && stageThinkingContent && (
                      <ThinkingPanel
                        stage={thinkingStage}
                        content={stageThinkingContent}
                        isStreaming={!isDone}
                      />
                    )}

                    {(sqlTablesColsOpen && canShowSqlTablesCols) && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 animate-in fade-in duration-200">
                        <div className="space-y-4">
                          <div>
                            <div className="text-[11px] font-semibold tracking-wide text-slate-500 mb-2">Tên bảng</div>
                            <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-[120px] p-0.5">
                              {tableNames.map(n => <span key={n} className="rounded-md bg-white px-2.5 py-1 text-[11px] font-mono text-slate-700">{n}</span>)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold tracking-wide text-slate-500 mb-2">Tên cột</div>
                            <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-[220px] p-0.5">
                              {colNames.map(n => (
                                <div key={n} className="rounded-md bg-white px-2 py-0.5 transition-colors hover:bg-slate-50">
                                  <span className="text-[11px] font-mono text-slate-700" title={n}>{n}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {sqlQueryOpen && canShowSqlQuery && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 animate-in fade-in duration-200">
                        <div className="text-[11px] font-semibold tracking-wide text-slate-500 mb-2">Câu SQL</div>
                        <div className="whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700">{sqlText}</div>
                      </div>
                    )}

                    {dataTablesColsOpen && canShowDataTablesCols && (
                      <div className="mt-2 rounded-xl bg-white px-3 py-2 animate-in fade-in duration-200">
                        <div className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-[11px] font-semibold tracking-wide text-slate-500">Danh sách cột</div>
                              <div className="text-[11px] text-slate-400 font-medium">{rowValues.length} dòng</div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 overflow-y-auto max-h-[220px] p-0.5">
                              {colNames.map(n => (
                                <div key={n} className="rounded-md bg-white px-2 py-0.5 transition-colors hover:bg-slate-50">
                                  <span className="text-[11px] font-mono text-slate-700" title={n}>{n}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold tracking-wide text-slate-500 mb-2">Bảng dữ liệu</div>
                            <div className="max-h-[420px] overflow-auto rounded-lg bg-white">
                              <table className="min-w-full border-collapse text-[11px]">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                  <tr>{colNames.map(n => <th key={n} className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-600">{n}</th>)}</tr>
                                </thead>
                                <tbody>
                                  {rowValues.map((row, rIdx) => (
                                    <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                                      {colNames.map((_, cIdx) => <td key={cIdx} className="whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700">{row?.[cIdx] ?? ''}</td>)}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {canShowTokens && (
                  <div className="mt-2 flex flex-col items-start gap-1.5">
                    <button type="button" className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors" onClick={() => setOpenPanels(p => ({ ...p, tokens: !p.tokens }))}>
                      <span>{tokensOpen ? 'Ẩn chi tiết sử dụng' : 'Xem chi tiết sử dụng'}</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${tokensOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {tokensOpen && (
                      <div className="mt-1 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex flex-wrap gap-2">
                          {tokenUsage && <TokenBreakdown title="SQL generation" usage={tokenUsage} />}
                          {replyTokenUsage && <TokenBreakdown title="Analysis & reply" usage={replyTokenUsage} />}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
