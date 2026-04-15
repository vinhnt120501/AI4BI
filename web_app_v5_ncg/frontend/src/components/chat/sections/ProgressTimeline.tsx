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

function extractColumnNames(sql?: string) {
  if (typeof sql !== 'string' || !sql.trim()) return [];
  const source = stripSqlComments(sql).replace(/\s+/g, ' ').trim();
  
  // Extract all identifiers that look like columns (e.g., table.column or just column)
  // We look for patterns like: column_name, `column_name`, "column_name", table.column
  // We exclude common SQL keywords and the table names we already found.
  const tableNames = new Set(extractTableNames(sql).map(t => t.toLowerCase()));
  const keywords = new Set(['select', 'from', 'where', 'group', 'by', 'order', 'limit', 'offset', 'having', 'as', 'join', 'left', 'right', 'inner', 'outer', 'on', 'and', 'or', 'not', 'null', 'is', 'in', 'exists', 'between', 'like', 'case', 'when', 'then', 'else', 'end', 'sum', 'avg', 'count', 'max', 'min', 'coalesce', 'ifnull', 'date', 'month', 'year', 'quarter']);

  const columnRegex = /([a-z_][a-z0-9_]*\.)?([a-z_][a-z0-9_]*)/gi;
  const results = new Set<string>();
  let match;
  
  while ((match = columnRegex.exec(source)) !== null) {
    const fullMatch = match[0].toLowerCase();
    const tablePrefix = match[1] ? match[1].slice(0, -1).toLowerCase() : null;
    const colName = match[2].toLowerCase();
    
    // If it's a keyword, skip
    if (keywords.has(colName)) continue;
    // If it's a table name (and no prefix), skip
    if (!tablePrefix && tableNames.has(colName)) continue;
    // If it's clearly a table prefix, we want the colName
    
    results.add(match[2]); // Keep original casing
  }

  // Refine: only take names that are actually used in SELECT/WHERE/JOIN/GROUP/ORDER
  // This is just a heuristic to avoid noise
  return Array.from(results).filter(n => n.length > 2);
}

function computeStageIndex(items: MessageEvent[], lastIndex: number) {
  const TOTAL_STAGES = 11;
  const last = items[lastIndex];
  if (!last) return { stageIndex: undefined as number | undefined, totalStages: TOTAL_STAGES };
  let statusOrdinal = 0;
  for (let i = 0; i <= lastIndex; i++) { if (items[i]?.event === 'status') statusOrdinal += 1; }
  const stageIndex = (() => {
    switch (last.event) {
      case 'debug_payload': return 1;
      case 'status': return statusOrdinal === 1 ? 2 : statusOrdinal === 2 ? 5 : 7;
      case 'thinking': return 3;
      case 'sql': return 4;
      case 'data': return 6;
      case 'additional_data': return 6;
      case 'reply': return 8;
      case 'suggestions': return 10;
      case 'done':
      case 'final': return 11;
      case 'error': return 11;
      default: return undefined;
    }
  })();
  return { stageIndex, totalStages: TOTAL_STAGES };
}

function stageTitle(step: number): string {
  switch (step) {
    case 1: return 'Khởi tạo ngữ cảnh';
    case 2: return 'Đang xử lý';
    case 3: return 'Phân tích yêu cầu';
    case 4: return 'Tạo truy vấn SQL';
    case 5: return 'Đang xử lý';
    case 6: return 'Nhận dữ liệu';
    case 7: return 'Đang xử lý';
    case 8: return 'Sinh phản hồi';
    case 9: return 'Kiểm tra';
    case 10: return 'Tạo gợi ý tiếp theo';
    case 11: return 'Hoàn tất';
    default: return `Bước ${step}`;
  }
}

function formatToken(value?: number) {
  if (typeof value !== 'number') return '—';
  return value.toLocaleString('vi-VN');
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
  const inputParts: Array<{ label: string; value?: number }> = [
    { label: 'Schema', value: usage.schema },
    { label: 'Rules', value: usage.rules },
    { label: 'Instruction', value: usage.instruction },
    { label: 'Memory', value: usage.memory },
    { label: 'Question', value: usage.question },
    { label: 'Data', value: usage.data },
  ];

  const answerTokens = Math.max(0, (usage.output || 0) - (usage.thinking || 0));

  return (
    <div className="w-fit min-w-[200px] rounded-xl bg-white px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-700">{title}</div>
      <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 font-mono">
        <TokenRow label="Input" value={usage.input} />
        {inputParts
          .filter((p) => typeof p.value === 'number' && (p.value as number) > 0)
          .map((p) => (
            <TokenRow key={p.label} label={`- ${p.label}`} value={p.value} indent />
          ))}

        <TokenRow label="Output" value={usage.output} />
        {(usage.thinking ?? 0) > 0 ? <TokenRow label="- Thinking" value={usage.thinking} indent /> : null}
        {typeof usage.output === 'number' ? <TokenRow label="- Answer" value={answerTokens} indent /> : null}

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
        {isStreaming && !cleanContent && (
          <span className="ml-2 inline-block animate-pulse text-slate-400">đang chờ...</span>
        )}
      </div>
      <div
        ref={scrollRef}
        className="whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700 max-h-[300px] overflow-y-auto"
      >
        {cleanContent || (isStreaming ? '' : 'Không có nội dung.')}
        {isStreaming && cleanContent && <span className="animate-pulse text-slate-400">|</span>}
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

  const lastVisibleIndex = (() => {
    for (let i = items.length - 1; i >= 0; i -= 1) {
      if (items[i]?.event !== 'thinking') return i;
    }
    return -1;
  })();
  const lastItem = lastVisibleIndex >= 0 ? items[lastVisibleIndex] : undefined;
  const { stageIndex: currentStageIndex, totalStages } = lastVisibleIndex >= 0 ? computeStageIndex(items, lastVisibleIndex) : { stageIndex: undefined as number | undefined, totalStages: 11 };
  const maxElapsed = items.reduce<number | undefined>((latest, item) => {
    if (typeof item.atMs !== 'number') return latest;
    return typeof latest === 'number' ? Math.max(latest, item.atMs) : item.atMs;
  }, undefined);
  const liveElapsed = typeof startedAt === 'number' ? Math.max(0, nowMs - startedAt) : undefined;
  const totalElapsed = !isDone && typeof liveElapsed === 'number'
    ? (typeof maxElapsed === 'number' ? Math.max(maxElapsed, liveElapsed) : liveElapsed)
    : maxElapsed;
  const isSummaryActive = Boolean(!isDone && lastItem && lastItem.event !== 'final' && lastItem.event !== 'done' && lastItem.event !== 'reply' && lastItem.event !== 'suggestions' && lastItem.event !== 'error');
  const dots = isSummaryActive ? '.'.repeat(((Math.floor(nowMs / 450)) % 3) + 1) : '';
  const summaryText = isSummaryActive ? stripTrailingDots(buildSummaryText(lastItem)) : buildSummaryText(lastItem);
  const sqlText = typeof sql === 'string' ? sql.trim() : '';
  const tableNames = useMemo(() => extractTableNames(sqlText), [sqlText]);
  const sqlColumnNames = useMemo(() => extractColumnNames(sqlText), [sqlText]);
  const colNames = Array.isArray(columns) && columns.length > 0 
    ? columns.filter(Boolean) 
    : sqlColumnNames;
  const rowValues = Array.isArray(rows) ? rows : [];
  const grandTotalTokens = (tokenUsage?.total || 0) + (replyTokenUsage?.total || 0);

  const stepGroups = useMemo(() => {
    type GroupItem = { item: MessageEvent; globalIndex: number };
    type Group = { step: number; items: GroupItem[] };

    const groups = new Map<number, Group>();
    items.forEach((item, globalIndex) => {
      if (item.event === 'thinking') return;
      const { stageIndex } = computeStageIndex(items, globalIndex);
      if (typeof stageIndex !== 'number') return;
      const group = groups.get(stageIndex) || { step: stageIndex, items: [] };
      group.items.push({ item, globalIndex });
      groups.set(stageIndex, group);
    });

    return Array.from(groups.values()).sort((a, b) => a.step - b.step);
  }, [items]);

  const renderTimelineItem = (item: MessageEvent, globalIndex: number, stepLabel: string) => {
    const isLastVisible = globalIndex === lastVisibleIndex;
    const isError = item.event === 'error';
    const isTerminal = item.event === 'done' || item.event === 'reply' || item.event === 'suggestions' || item.event === 'final';
    const displayAtMs = (() => {
      if (isLastVisible && !isTerminal && typeof liveElapsed === 'number') {
        return typeof item.atMs === 'number' ? Math.max(item.atMs, liveElapsed) : liveElapsed;
      }
      return item.atMs;
    })();

    const isSqlStep = item.event === 'sql';
    const isDataStep = item.event === 'data';
    let statusOrdinal = 0;
    for (let k = 0; k <= globalIndex; k++) { if (items[k]?.event === 'status') statusOrdinal++; }
    const isAnalysisStatus = item.event === 'status' && (statusOrdinal === 2 || statusOrdinal === 3);

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

    const sqlTablesColsKey = isSqlStep ? `sql_tables_cols_${globalIndex}` : '';
    const sqlQueryKey = isSqlStep ? `sql_query_${globalIndex}` : '';
    const dataTablesColsKey = isDataStep ? `data_tables_cols_${globalIndex}` : '';
    const thinkingKey = thinkingStage ? `thinking_${thinkingStage}_${globalIndex}` : '';

    const canShowSqlTablesCols = isSqlStep && (tableNames.length > 0 || colNames.length > 0);
    const canShowSqlQuery = isSqlStep && Boolean(sqlText);
    const canShowDataTablesCols = isDataStep && (colNames.length > 0 || rowValues.length > 0);
    // Show thinking button when:
    // - Has stage-specific content, OR
    // - Still streaming (not done yet) and this is a thinking-relevant step, OR
    // - Old history (no thinkingByStage) with full thinking content
    const isThinkingRelevantStep = Boolean(thinkingStage || isAnalysisStatus || isSqlStep);
    const canShowThinking = isThinkingRelevantStep && Boolean(
      stageThinkingContent || (!isDone && isThinkingRelevantStep)
    );

    const sqlTablesColsOpen = sqlTablesColsKey ? Boolean(openPanels[sqlTablesColsKey]) : false;
    const sqlQueryOpen = sqlQueryKey ? Boolean(openPanels[sqlQueryKey]) : false;
    const dataTablesColsOpen = dataTablesColsKey ? Boolean(openPanels[dataTablesColsKey]) : false;
    const thinkingOpen = thinkingKey ? Boolean(openPanels[thinkingKey]) : false;
    const canShowTokens = item.event === 'final' && Boolean(tokenUsage || replyTokenUsage);
    const tokensOpen = Boolean(openPanels.tokens);

    let icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />;
    if (isError) { icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500 fill-rose-500/10" />; }
    else if (isLastVisible && !isTerminal) { icon = <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-slate-500" />; }
    else { icon = <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />; }

    return (
      <div key={`${item.event}-${globalIndex}`} className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
        {icon}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-medium leading-relaxed text-slate-700">
              {stepLabel ? `${stepLabel} - ` : ''}
              {translateEvent(item.event)}
            </div>
            {displayAtMs !== undefined ? <span className="text-[11px] text-slate-400">{formatElapsed(displayAtMs)}</span> : null}
          </div>
          {item.detail ? <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-500">{item.detail}</div> : null}

          {canShowSqlTablesCols || canShowSqlQuery || canShowDataTablesCols || canShowThinking ? (
            <div className="mt-2">
              <div className="flex flex-wrap items-center gap-2">
                {canShowThinking && (
                  <button type="button" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-white transition-all" onClick={() => setOpenPanels(p => ({ ...p, [thinkingKey]: !p[thinkingKey] }))}>
                    <span>{thinkingOpen ? 'Ẩn suy luận' : stageThinkingContent ? 'Xem suy luận' : 'Đang suy luận...'}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${thinkingOpen ? 'rotate-180' : ''}`} />
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
              </div>

              {thinkingOpen && canShowThinking && (
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
  };

  return (
    <details className="group rounded-2xl bg-white w-full">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-2 text-slate-700 marker:content-none">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-700">Quá trình xử lý</div>
          <div className="mt-0.5 truncate text-[12px] text-slate-500">
            <span key={summaryText} className={`inline-block animate-in fade-in slide-in-from-bottom-1 duration-300 ${isSummaryActive ? 'text-slate-600' : ''}`}>{summaryText}</span>
            {dots ? <span className="inline-block w-4 font-mono text-slate-400 animate-in fade-in duration-200">{dots}</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-slate-400">
          {typeof currentStageIndex === 'number' ? <span>Bước {currentStageIndex}/{totalStages}</span> : null}
          {typeof totalElapsed === 'number' ? <span>{formatElapsed(totalElapsed)}</span> : null}
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
        </div>
      </summary>

      <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 group-open:animate-in group-open:fade-in group-open:slide-in-from-top-1 group-open:duration-300">
        {stepGroups.map((group) => {
          if (group.items.length <= 1) {
            const single = group.items[0];
            if (!single) return null;
            return renderTimelineItem(single.item, single.globalIndex, `Bước ${group.step}`);
          }

          const groupKey = `step_group_${group.step}`;
          const isOpen = Boolean(openPanels[groupKey]);
          const last = group.items[group.items.length - 1];
          const isGroupError = group.items.some((g) => g.item.event === 'error');
          const isTerminal = last.item.event === 'done' || last.item.event === 'reply' || last.item.event === 'suggestions' || last.item.event === 'final';
          const isLastVisible = last.globalIndex === lastVisibleIndex;
          const displayAtMs = (() => {
            if (isLastVisible && !isTerminal && typeof liveElapsed === 'number') {
              return typeof last.item.atMs === 'number' ? Math.max(last.item.atMs, liveElapsed) : liveElapsed;
            }
            return last.item.atMs;
          })();
          const summary = last.item.detail || buildSummaryText(last.item);

          let icon = <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />;
          if (isGroupError) icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500 fill-rose-500/10" />;
          else if (!isDone && typeof currentStageIndex === 'number' && group.step === currentStageIndex && !isTerminal) {
            icon = <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-slate-500" />;
          }

          return (
            <div key={`group-${group.step}`} className="flex flex-col gap-2">
              <button
                type="button"
                className="flex w-full items-start gap-2.5 text-left"
                onClick={() => setOpenPanels((p) => ({ ...p, [groupKey]: !p[groupKey] }))}
              >
                {icon}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[13px] font-medium leading-relaxed text-slate-700">{`Bước ${group.step} - ${stageTitle(group.step)}`}</div>
                    {displayAtMs !== undefined ? <span className="text-[11px] text-slate-400">{formatElapsed(displayAtMs)}</span> : null}
                  </div>
                  {summary ? <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-500">{summary}</div> : null}
                </div>
                <ChevronDown className={`mt-1 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>

              {isOpen && (
                <div className="ml-[26px] flex flex-col gap-3">
                  {group.items.map((child, idx) => renderTimelineItem(child.item, child.globalIndex, `Bước ${group.step}.${idx + 1}`))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
