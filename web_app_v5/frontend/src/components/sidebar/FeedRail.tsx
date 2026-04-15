'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildApiUrl, fetchWithRetry } from '@/lib/api';
import { BRAND_COLORS } from '@/lib/colors';
import { signalColor } from '@/lib/seed-data';

const C = BRAND_COLORS;

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

type HeartbeatTrend = import('@/lib/seed-data').HeartbeatTrend;
type HeartbeatItem = import('@/lib/seed-data').HeartbeatItem;

const INITIAL_FETCH_LIMIT = 4;
const LOAD_MORE_FETCH_LIMIT = 50;
const FEED_FOOTER_TEXT_CLASS = 'text-[12px] font-semibold text-[color:var(--color-text-secondary)]';
const FEED_FOOTER_BUTTON_CLASS = 'inline-flex min-w-[120px] items-center justify-center rounded-xl px-4 py-2 text-[12px] font-semibold text-[color:var(--color-text-secondary)] hover:bg-slate-50';

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
  onSelect: (item: FeedItem) => void;
  onSelectKpi?: (kpiLabel: string) => void;
  userId?: string;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

function formatCount(n: number) {
  if (!Number.isFinite(n)) return '';
  if (n > 99) return '99+';
  return String(n);
}

export default function FeedRail({ activeId, onSelect, onSelectKpi }: FeedRailProps) {
  const [signalItems, setSignalItems] = useState<FeedItem[]>([]);
  const [signalsOffset, setSignalsOffset] = useState(0);
  const [signalsHasMore, setSignalsHasMore] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [signalsStatus, setSignalsStatus] = useState<LoadStatus>('idle');
  const [signalsError, setSignalsError] = useState<string>('');
  const [signalsExpanded, setSignalsExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [heartbeatItems, setHeartbeatItems] = useState<HeartbeatItem[]>([]);
  const [heartbeatStatus, setHeartbeatStatus] = useState<LoadStatus>('idle');
  const [heartbeatLoading, setHeartbeatLoading] = useState(false);
  const [heartbeatHasMore, setHeartbeatHasMore] = useState(false);
  const [heartbeatOffset, setHeartbeatOffset] = useState(0);
  const [heartbeatExpanded, setHeartbeatExpanded] = useState(false);

  // ── Signals ──
  const loadSignals = useCallback(async (opts?: { reset?: boolean }) => {
    if (signalsLoading) return;
    const reset = Boolean(opts?.reset);
    if (reset) {
      setSignalsStatus('loading');
      setSignalsOffset(0);
      setSignalsHasMore(false);
      setSignalItems([]);
    }
    setSignalsLoading(true);
    setSignalsError('');
    try {
      const offset = reset ? 0 : signalsOffset;
      const limit = reset ? INITIAL_FETCH_LIMIT : LOAD_MORE_FETCH_LIMIT;
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
          const { dot, tagBg, tag } = signalColor(type);
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
      setSignalsStatus('ready');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Không thể tải tín hiệu.';
      setSignalsError(msg.includes('Failed to fetch')
        ? 'Không kết nối được backend.'
        : msg);
      if (reset) setSignalsStatus('error');
    } finally {
      setSignalsLoading(false);
    }
  }, [signalsLoading, signalsOffset]);

  useEffect(() => {
    if (signalsStatus !== 'idle') return;
    void loadSignals({ reset: true });
  }, [signalsStatus, loadSignals]);

  // ── Heartbeat ──
  const loadHeartbeat = useCallback(async (opts?: { reset?: boolean }) => {
    if (heartbeatLoading) return;
    const reset = Boolean(opts?.reset);
    if (reset) {
      setHeartbeatStatus('loading');
      setHeartbeatOffset(0);
      setHeartbeatHasMore(false);
      setHeartbeatItems([]);
    }
    setHeartbeatLoading(true);
    try {
      const offset = reset ? 0 : heartbeatOffset;
      const limit = reset ? INITIAL_FETCH_LIMIT : LOAD_MORE_FETCH_LIMIT;
      const url = buildApiUrl(`/heartbeat?limit=${limit}&offset=${offset}`);
      const data = await fetchWithRetry(url, 15000);
      const items = Array.isArray(data?.items) ? data.items : [];
      const nextOffset = typeof data?.nextOffset === 'number' ? data.nextOffset : offset + items.length;
      const hasMore = Boolean(data?.hasMore);

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

      setHeartbeatItems((prev) => reset ? normalized : [...prev, ...normalized]);
      setHeartbeatOffset(nextOffset);
      setHeartbeatHasMore(hasMore);
      setHeartbeatStatus('ready');
    } catch {
      if (reset) setHeartbeatStatus('error');
    } finally {
      setHeartbeatLoading(false);
    }
  }, [heartbeatLoading, heartbeatOffset]);

  useEffect(() => {
    if (heartbeatStatus !== 'idle') return;
    void loadHeartbeat({ reset: true });
  }, [heartbeatStatus, loadHeartbeat]);

  // ── Derived ──
  const handleScroll = useCallback(() => {
    if (!signalsExpanded) return;
    const el = scrollRef.current;
    if (!el) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining > 240) return;
    if (signalsStatus !== 'ready' || !signalsHasMore || signalsLoading) return;
    void loadSignals();
  }, [loadSignals, signalsExpanded, signalsHasMore, signalsLoading, signalsStatus]);

  const sortedSignals = useMemo(() => {
    return [...signalItems].sort((a, b) => b.id - a.id);
  }, [signalItems]);

  const visibleSignals = useMemo(() => {
    return signalsExpanded ? sortedSignals : sortedSignals.slice(0, INITIAL_FETCH_LIMIT);
  }, [signalsExpanded, sortedSignals]);

  const visibleHeartbeat = useMemo(() => {
    return heartbeatExpanded ? heartbeatItems : heartbeatItems.slice(0, INITIAL_FETCH_LIMIT);
  }, [heartbeatExpanded, heartbeatItems]);

  const signalsCanExpand = sortedSignals.length > INITIAL_FETCH_LIMIT || signalsHasMore;
  const heartbeatCanExpand = heartbeatItems.length > INITIAL_FETCH_LIMIT || heartbeatHasMore;

  const signalsCount = signalsStatus === 'ready' ? signalItems.length : undefined;

  return (
    <aside className="w-[320px] md:w-[360px] shrink-0 overflow-x-hidden border-r border-[color:var(--color-border-tertiary)] bg-[var(--color-background-primary)]">
        <div className="flex h-full flex-col">
          <div className="px-4 pb-3 pt-4">
            <div className="inline-flex items-center gap-1 rounded-full bg-[#19226D] px-3 py-1 text-[12px] font-medium text-white">
              <span>Tín hiệu</span>
              {typeof signalsCount === 'number' ? (
                <span className="text-[10px] opacity-80">{formatCount(signalsCount)}</span>
              ) : null}
            </div>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-4"
        >
          {signalsStatus === 'loading' ? (
            <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Đang tải…</div>
          ) : null}
          {signalsStatus === 'ready' && signalItems.length === 0 && !signalsError ? (
            <div className="px-3 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Chưa có tín hiệu.</div>
          ) : null}
          {visibleSignals.map((item) => {
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
          {signalsStatus === 'ready' && sortedSignals.length > 0 ? (
            <div className="mt-1 flex flex-col items-center justify-center gap-2 py-1">
              {signalsLoading ? (
                <span className={FEED_FOOTER_TEXT_CLASS}>Đang tải…</span>
              ) : signalsExpanded ? (
                <>
                  {!signalsHasMore ? (
                    <span className={FEED_FOOTER_TEXT_CLASS}>Không còn thông tin</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setSignalsExpanded(false);
                      scrollRef.current?.scrollTo({ top: 0 });
                    }}
                    className={FEED_FOOTER_BUTTON_CLASS}
                  >
                    Ẩn bớt
                  </button>
                </>
              ) : signalsCanExpand ? (
                <button
                  type="button"
                  onClick={() => {
                    if (signalsHasMore) void loadSignals();
                    setSignalsExpanded(true);
                  }}
                  className={FEED_FOOTER_BUTTON_CLASS}
                >
                  Xem thêm
                </button>
              ) : (
                <span className={FEED_FOOTER_TEXT_CLASS}>Không còn thông tin</span>
              )}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[color:var(--color-border-tertiary)] px-4 pt-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <p className="mb-4 text-[12px] font-semibold text-[color:var(--color-text-secondary)]">
            Nhịp đập
          </p>
          <div className="overflow-x-hidden">
            {heartbeatStatus === 'loading' && heartbeatItems.length === 0 ? (
              <div className="px-1 py-2 text-[12px] text-[color:var(--color-text-secondary)]">Đang tải…</div>
            ) : null}
            <div className="grid grid-cols-2 gap-x-6 gap-y-6">
              {visibleHeartbeat.map((kpi) => {
                const color = kpi.trend === 'up' ? C.pos : kpi.trend === 'down' ? C.red : 'var(--color-text-secondary)';
                return (
                  <button
                    key={`${kpi.id}-${kpi.label}`}
                    type="button"
                    onClick={() => onSelectKpi?.(kpi.label)}
                    className={[
                      'h-[112px] w-full rounded-xl bg-[var(--color-background-secondary)] p-3 text-left transition-colors',
                      'cursor-pointer hover:bg-slate-50',
                      'flex flex-col justify-between',
                    ].join(' ')}
                    aria-label={`Phân tích KPI ${kpi.label}`}
                  >
                    <p className="text-[12px] leading-relaxed text-[color:var(--color-text-secondary)]">{kpi.label}</p>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 gap-y-0.5">
                      <span className="max-w-full break-words text-[24px] font-semibold leading-none text-[color:var(--color-text-primary)]">{kpi.value}</span>
                      {kpi.delta ? (
                        <span className="text-[12px] font-semibold leading-relaxed" style={{ color }}>
                          {kpi.delta}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {heartbeatItems.length > 0 ? (
            <div className="mt-3 flex flex-col items-center justify-center gap-2 py-1">
              {heartbeatLoading ? (
                <span className={FEED_FOOTER_TEXT_CLASS}>Đang tải…</span>
              ) : heartbeatExpanded ? (
                <>
                  {!heartbeatHasMore ? (
                    <span className={FEED_FOOTER_TEXT_CLASS}>Không còn thông tin</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setHeartbeatExpanded(false)}
                    className={FEED_FOOTER_BUTTON_CLASS}
                  >
                    Ẩn bớt
                  </button>
                </>
              ) : heartbeatCanExpand ? (
                <button
                  type="button"
                  onClick={() => {
                    if (heartbeatHasMore) void loadHeartbeat();
                    setHeartbeatExpanded(true);
                  }}
                  className={FEED_FOOTER_BUTTON_CLASS}
                >
                  Xem thêm
                </button>
              ) : (
                <span className={FEED_FOOTER_TEXT_CLASS}>Không còn thông tin</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
