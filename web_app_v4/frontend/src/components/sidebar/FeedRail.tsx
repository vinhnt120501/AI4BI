'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl, DEFAULT_USER_ID } from '@/lib/api';

const C = {
  brand: '#19226D',
  brandLight: '#E8EAF5',
  red: '#E24B4A',
  redBg: '#FCEBEB',
  amber: '#EF9F27',
  amberBg: '#FAEEDA',
  pos: '#1D9E75',
  posLight: '#E1F5EE',
};

export type FeedItemType = 'critical' | 'watch' | 'positive' | 'insight';

export interface FeedItem {
  id: number;
  type: FeedItemType;
  dot: string;
  tag: string;
  tagBg: string;
  title: string;
  desc: string;
  time: string;
  createdAt?: string;
}

type HeartbeatTrend = 'up' | 'down' | 'neutral';
type HeartbeatItem = { id: number; label: string; value: string; delta?: string; trend: HeartbeatTrend };

const DEFAULT_HEARTBEAT: HeartbeatItem[] = [
  { id: 1, label: 'Doanh thu 7 ngày', value: '—', delta: '—', trend: 'neutral' },
  { id: 2, label: 'WoW doanh thu', value: '—', delta: '—', trend: 'neutral' },
  { id: 3, label: 'Tỷ lệ hoàn trả', value: '—', delta: '—', trend: 'neutral' },
  { id: 4, label: 'Tiến độ target MTD', value: '—', delta: '—', trend: 'neutral' },
  { id: 5, label: 'Top khu vực', value: '—', delta: '—', trend: 'neutral' },
  { id: 6, label: 'Top shop', value: '—', delta: '—', trend: 'neutral' },
  { id: 7, label: 'Rủi ro', value: '—', delta: '—', trend: 'neutral' },
  { id: 8, label: 'Cơ hội', value: '—', delta: '—', trend: 'neutral' },
];

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, timeoutMs = 8000, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchJsonWithTimeout(url, timeoutMs);
    } catch (error) {
      const isLast = attempt === maxRetries - 1;
      if (isLast) throw error;
      const msg = error instanceof Error ? error.message : '';
      const isConnectionError = msg.includes('Failed to fetch') || msg.includes('timeout');
      if (!isConnectionError) throw error;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

function Dot({ color, size = 9 }: { color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        marginTop: 4,
      }}
    />
  );
}

interface FeedRailProps {
  activeId?: number | null;
  activeHistorySessionId?: string | null;
  onSelect: (item: FeedItem) => void;
  onSelectHistory?: (sessionId: string) => void;
  onSelectKpi?: (kpiLabel: string) => void;
  userId?: string;
}

type FeedFilterId = 'alert' | 'insight';

type HistoryItem = {
  id: number;
  sessionId: string;
  createdAt?: string | null;
  question: string;
  replyPreview?: string;
};

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

function formatCount(n: number) {
  if (!Number.isFinite(n)) return '';
  if (n > 99) return '99+';
  return String(n);
}

function formatRelativeTime(iso?: string | null) {
  if (!iso) return '';
  const createdAt = new Date(iso).getTime();
  if (Number.isNaN(createdAt)) return '';
  const diffMs = Date.now() - createdAt;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 10) return 'Vừa xong';
  if (diffSec < 60) return `${diffSec}s trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  if (diffHr < 48) return 'Hôm qua';
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} ngày trước`;
}

export default function FeedRail({ activeId, activeHistorySessionId, onSelect, onSelectHistory, onSelectKpi, userId }: FeedRailProps) {
  const [filter, setFilter] = useState<FeedFilterId>('alert');
  const resolvedUserId = userId || DEFAULT_USER_ID;

  const [signalItems, setSignalItems] = useState<FeedItem[]>([]);
  const [signalsOffset, setSignalsOffset] = useState(0);
  const [signalsHasMore, setSignalsHasMore] = useState(false);
  const [signalsLoadingMore, setSignalsLoadingMore] = useState(false);
  const [signalsStatus, setSignalsStatus] = useState<LoadStatus>('idle');
  const [signalsError, setSignalsError] = useState<string>('');

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string>('');
  const [historyStatus, setHistoryStatus] = useState<LoadStatus>('idle');
  const historyScrollRef = useRef<HTMLDivElement | null>(null);

  const [heartbeatItems, setHeartbeatItems] = useState<HeartbeatItem[]>(DEFAULT_HEARTBEAT);
  const [heartbeatStatus, setHeartbeatStatus] = useState<LoadStatus>('idle');
  const [heartbeatLoadingMore, setHeartbeatLoadingMore] = useState(false);


  const loadHistory = useCallback(async (opts?: { reset?: boolean }) => {
    if (historyLoading) return;
    const reset = Boolean(opts?.reset);
    if (reset) {
      setHistoryStatus('loading');
      setHistoryOffset(0);
      setHistoryHasMore(false);
      setHistoryItems([]);
    }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const offset = reset ? 0 : historyOffset;
      const limit = reset ? 5 : 10;
      const url = buildApiUrl(`/chat/history?userId=${encodeURIComponent(resolvedUserId)}&limit=${limit}&offset=${offset}`);
      const data = await fetchWithRetry(url, 5000);
      const items = Array.isArray(data?.items) ? data.items : [];
      const nextOffset = typeof data?.nextOffset === 'number' ? data.nextOffset : offset + items.length;
      const hasMore = Boolean(data?.hasMore);

      const normalized: HistoryItem[] = items
        .map((row: any) => ({
          id: Number(row?.id || 0),
          sessionId: String(row?.sessionId || ''),
          createdAt: row?.createdAt ?? null,
          question: String(row?.question || ''),
          replyPreview: row?.replyPreview ? String(row.replyPreview) : '',
        }))
        .filter((row: HistoryItem) => Boolean(row.sessionId) && Boolean(row.question));

      setHistoryItems((prev) => reset ? normalized : [...prev, ...normalized]);
      setHistoryOffset(nextOffset);
      setHistoryHasMore(hasMore);
      if (reset) setHistoryStatus('ready');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể tải lịch sử.';
      setHistoryError(msg.includes('Failed to fetch')
        ? 'Không kết nối được backend. Hãy chạy server backend ở http://localhost:8333.'
        : msg);
      if (reset) setHistoryStatus('error');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading, historyOffset, resolvedUserId]);

  useEffect(() => {
    if (historyStatus !== 'idle') return;
    void loadHistory({ reset: true });
  }, [historyStatus, loadHistory]);

  const loadSignals = useCallback(async (opts?: { reset?: boolean }) => {
    if (signalsLoadingMore) return;
    const reset = Boolean(opts?.reset);
    if (reset) {
      setSignalsStatus('loading');
      setSignalsOffset(0);
      setSignalsHasMore(false);
      setSignalItems([]);
    }
    setSignalsLoadingMore(true);
    setSignalsError('');
    try {
      const offset = reset ? 0 : signalsOffset;
      const limit = 5;
      const url = buildApiUrl(`/signals?limit=${limit}&offset=${offset}`);
      const data = await fetchWithRetry(url, 15000);
      const items = Array.isArray(data?.items) ? data.items : [];
      const nextOffset = typeof data?.nextOffset === 'number' ? data.nextOffset : offset + items.length;
      const hasMore = Boolean(data?.hasMore);

      const normalized: FeedItem[] = items
        .map((row: any, i: number) => {
          const type: FeedItemType = row?.type === 'critical' || row?.type === 'watch' || row?.type === 'positive'
            ? row.type
            : 'watch';
          const dot = type === 'critical' ? C.red : type === 'positive' ? C.pos : C.amber;
          const tagBg = type === 'critical' ? C.redBg : type === 'positive' ? C.posLight : C.amberBg;
          const tag = type === 'critical' ? 'Nghiêm trọng' : type === 'positive' ? 'Tích cực' : 'Theo dõi';
          return {
            id: Number(row?.id || i + 1),
            type,
            dot,
            tag,
            tagBg,
            title: String(row?.title || ''),
            desc: String(row?.desc || ''),
            time: '',
            createdAt: row?.createdAt ? String(row.createdAt) : undefined,
          };
        })
        .filter((row: FeedItem) => Boolean(row.title));

      setSignalItems((prev) => reset ? normalized : [...prev, ...normalized]);
      setSignalsOffset(nextOffset);
      setSignalsHasMore(hasMore);
      if (reset) setSignalsStatus('ready');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể tải tín hiệu.';
      setSignalsError(msg.includes('Failed to fetch')
        ? 'Không kết nối được backend. Hãy chạy server backend ở http://localhost:8333.'
        : msg);
      if (reset) setSignalsStatus('error');
    } finally {
      setSignalsLoadingMore(false);
    }
  }, [signalsLoadingMore, signalsOffset]);

  useEffect(() => {
    if (filter !== 'alert') return;
    if (signalsStatus !== 'idle') return;
    void loadSignals({ reset: true });
  }, [filter, loadSignals, signalsStatus]);

  const loadHeartbeat = useCallback(async () => {
    if (heartbeatLoadingMore) return;
    setHeartbeatStatus('loading');
    setHeartbeatLoadingMore(true);
    try {
      const url = buildApiUrl(`/heartbeat?limit=20&offset=0`);
      const data = await fetchWithRetry(url, 15000);
      const items = Array.isArray(data?.items) ? data.items : [];
      const normalized: HeartbeatItem[] = items
        .map((row: any, i: number) => {
          const trend: HeartbeatTrend = row?.trend === 'up' || row?.trend === 'down' || row?.trend === 'neutral'
            ? row.trend
            : 'neutral';
          return {
            id: Number(row?.id || i + 1),
            label: String(row?.label || ''),
            value: String(row?.value || ''),
            delta: row?.delta ? String(row.delta) : '',
            trend,
          };
        })
        .filter((row: HeartbeatItem) => Boolean(row.label) && Boolean(row.value));

      setHeartbeatItems(normalized.length > 0 ? normalized : DEFAULT_HEARTBEAT.slice(0, 4));
      setHeartbeatStatus('ready');
    } catch {
      setHeartbeatItems(DEFAULT_HEARTBEAT.slice(0, 4));
      setHeartbeatStatus('error');
    } finally {
      setHeartbeatLoadingMore(false);
    }
  }, [heartbeatLoadingMore]);

  useEffect(() => {
    if (heartbeatStatus !== 'idle') return;
    void loadHeartbeat();
  }, [heartbeatStatus, loadHeartbeat]);

  const counts = useMemo(() => {
    return {
      alert: signalsStatus === 'ready' ? signalItems.length : undefined,
      insight: historyStatus === 'ready' ? historyItems.length : undefined,
    };
  }, [historyItems.length, historyStatus, signalItems.length, signalsStatus]);

  const filters: Array<{ id: FeedFilterId; label: string; count?: number }> = [
    { id: 'alert', label: 'Tín hiệu', count: counts.alert },
    { id: 'insight', label: 'Insight', count: counts.insight },
  ];

  const handleScroll = useCallback(() => {
    const el = historyScrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;

    if (filter === 'insight') {
      if (historyStatus !== 'ready') return;
      if (!historyHasMore || historyLoading) return;
      if (remaining < 240) {
        void loadHistory();
      }
      return;
    }

    if (filter === 'alert') {
      if (signalsStatus !== 'ready') return;
      if (!signalsHasMore || signalsLoadingMore) return;
      if (remaining < 240) void loadSignals();
      return;
    }
  }, [filter, historyHasMore, historyLoading, historyStatus, loadHistory, loadSignals, signalsHasMore, signalsLoadingMore, signalsStatus]);

  // Auto-load more signals if content doesn't fill scroll container
  useEffect(() => {
    if (filter !== 'alert') return;
    if (signalsStatus !== 'ready') return;
    if (!signalsHasMore || signalsLoadingMore) return;
    const el = historyScrollRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) {
      void loadSignals();
    }
  }, [filter, signalsStatus, signalsHasMore, signalsLoadingMore, signalItems.length, loadSignals]);

  return (
    <aside className="w-[320px] md:w-[360px] shrink-0 border-r border-[color:var(--color-border-tertiary)] bg-[var(--color-background-primary)]">
      <div className="flex h-full flex-col">
        <div className="px-4 pb-3 pt-4">
          <p className="mb-3 text-[14px] font-semibold text-[color:var(--color-text-primary)]">Hôm nay</p>
          <div className="flex gap-1.5">
            {filters.map((item) => {
              const isActive = filter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  className={[
                    'inline-flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                    isActive
                      ? 'bg-[#19226D] text-white'
                      : 'border border-[color:var(--color-border-tertiary)] bg-[var(--color-background-secondary)] text-[color:var(--color-text-secondary)] hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span>{item.label}</span>
                  {typeof item.count === 'number' ? (
                    <span className="text-[10px] opacity-80">{formatCount(item.count)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={historyScrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-2 pb-4"
        >
          {filter === 'insight' ? (
            <>
              {historyError ? (
                <div className="px-3 py-2 text-[12px] text-rose-600">
                  <div>{historyError}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryStatus('idle');
                    }}
                    className="mt-2 inline-flex cursor-pointer rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Thử lại
                  </button>
                </div>
              ) : null}
              {historyItems.map((row) => {
                const isActive = Boolean(activeHistorySessionId && activeHistorySessionId === row.sessionId);
                return (
                  <button
                    key={`${row.sessionId}-${row.id}`}
                    onClick={() => onSelectHistory?.(row.sessionId)}
                    className={[
                      'mb-1 w-full cursor-pointer rounded-xl px-3 py-3 text-left transition-colors',
                      isActive ? 'bg-[#E8EAF5]' : 'hover:bg-slate-50',
                    ].join(' ')}
                    style={{
                      borderLeft: isActive ? `3px solid ${C.brand}` : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <Dot color={C.brand} />
                      <div className="min-w-0 flex-1">
                        <p className="mb-1 line-clamp-2 text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                          {row.question}
                        </p>
                        {row.replyPreview ? (
                          <p className="line-clamp-2 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
                            {row.replyPreview}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span
                            className="rounded-lg px-2 py-0.5 text-[10px] font-semibold"
                            style={{ color: C.brand, background: C.brandLight }}
                          >
                            Insight
                          </span>
                        <span className="text-[11px] text-[color:var(--color-text-secondary)]">
                          {formatRelativeTime(row.createdAt)}
                        </span>
                      </div>
                    </div>
                    </div>
                  </button>
                );
              })}
              {historyStatus === 'loading' ? (
                <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Đang tải…</div>
              ) : null}
              {historyStatus === 'ready' && !historyLoading && historyItems.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Chưa có lịch sử.</div>
              ) : null}
              {!historyLoading && historyItems.length > 0 && !historyHasMore ? (
                <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Hết dữ liệu.</div>
              ) : null}
            </>
          ) : (
            <>
              {signalsError ? (
                <div className="px-3 py-2 text-[12px] text-rose-600">
                  <div>{signalsError}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setSignalsStatus('idle');
                    }}
                    className="mt-2 inline-flex cursor-pointer rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Thử lại
                  </button>
                </div>
              ) : null}
              {signalsStatus === 'loading' && signalItems.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Đang tải…</div>
              ) : null}
              {signalsStatus === 'ready' && signalItems.length === 0 && !signalsError ? (
                <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Chưa có tín hiệu.</div>
              ) : null}
              {[...signalItems].sort((a, b) => b.id - a.id).map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={[
                    'mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors',
                    'cursor-pointer',
                    isActive ? 'bg-[#E8EAF5]' : 'hover:bg-slate-50',
                  ].join(' ')}
                  style={{
                    borderLeft: isActive ? `3px solid ${C.brand}` : '3px solid transparent',
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <Dot color={item.dot} />
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 line-clamp-2 text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                        {item.title}
                      </p>
                      <p className="line-clamp-2 text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">
                        {item.desc}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className="rounded-lg px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: item.dot, background: item.tagBg }}
                        >
                          {item.tag}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-[color:var(--color-border-tertiary)] px-4 pt-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <p
            className="mb-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--color-text-secondary)]"
          >
            Nhịp đập
          </p>
          <div className="max-h-[240px] overflow-y-auto">
          <div className="grid grid-cols-2 gap-x-6 gap-y-6">
            {heartbeatItems.map((kpi) => {
              const color = kpi.trend === 'up' ? C.pos : kpi.trend === 'down' ? C.red : 'var(--color-text-secondary)';
              return (
                <button
                  key={`${kpi.id}-${kpi.label}`}
                  type="button"
                  onClick={() => onSelectKpi?.(kpi.label)}
                  className={[
                    'rounded-xl px-2 py-2 text-left transition-colors',
                    'cursor-pointer hover:bg-slate-50',
                  ].join(' ')}
                  aria-label={`Phân tích KPI ${kpi.label}`}
                >
                  <p className="mb-1 text-[11px] text-[color:var(--color-text-secondary)]">{kpi.label}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[26px] font-semibold leading-none text-[color:var(--color-text-primary)]">{kpi.value}</span>
                    {kpi.delta ? (
                      <span className="text-[12px] font-semibold" style={{ color }}>
                        {kpi.delta}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        </div>

        {/* Intentionally omit personal/user identity section */}
      </div>
    </aside>
  );
}
