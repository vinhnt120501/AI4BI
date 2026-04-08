'use client';

import React, { useMemo, useState } from 'react';

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
}

const FEED: FeedItem[] = [
  {
    id: 1,
    type: 'critical',
    dot: C.red,
    tag: 'Nghiêm trọng',
    tagBg: C.redBg,
    title: 'Doanh thu miền Nam -18% WoW',
    desc: '3 tài khoản lớn trì hoãn gia hạn. Phá vỡ xu hướng tăng 6 tháng.',
    time: '12 phút trước',
  },
  {
    id: 2,
    type: 'watch',
    dot: C.amber,
    tag: 'Theo dõi',
    tagBg: C.amberBg,
    title: 'CAC đạt 3.2tr, vượt 12%',
    desc: 'CPC quảng cáo tìm kiếm tăng mạnh. Kênh organic vẫn hiệu quả.',
    time: '1 giờ trước',
  },
  {
    id: 3,
    type: 'positive',
    dot: C.pos,
    tag: 'Tích cực',
    tagBg: C.posLight,
    title: 'Pipeline DN +34% MoM',
    desc: 'Cao nhất từ trước đến nay. Tương quan với chương trình đối tác.',
    time: '2 giờ trước',
  },
  {
    id: 4,
    type: 'insight',
    dot: C.brand,
    tag: 'Insight',
    tagBg: C.brandLight,
    title: 'Vì sao deal doanh nghiệp tăng tốc',
    desc: 'Phân tích tự động: chương trình đối tác mới tạo hiệu ứng multiplier trên pipeline. Kèm dự báo Q2.',
    time: '2 giờ trước',
  },
  {
    id: 5,
    type: 'watch',
    dot: C.amber,
    tag: 'Theo dõi',
    tagBg: C.amberBg,
    title: 'Churn risk: 12 tài khoản mid-market',
    desc: 'Mô hình dự đoán phát hiện giảm tương tác 30 ngày qua.',
    time: '3 giờ trước',
  },
  {
    id: 6,
    type: 'insight',
    dot: C.brand,
    tag: 'Insight',
    tagBg: C.brandLight,
    title: 'Hiệu quả marketing Q1',
    desc: 'Chi phí vs. kết quả tất cả kênh. Organic vượt trội paid gấp 3 lần.',
    time: 'Hôm qua',
  },
  {
    id: 7,
    type: 'insight',
    dot: C.brand,
    tag: 'Insight',
    tagBg: C.brandLight,
    title: 'Phân bổ doanh thu theo sản phẩm',
    desc: 'Sản phẩm A chiếm 62% MRR nhưng tăng trưởng chậm. Sản phẩm B tăng 40% MoM.',
    time: 'Hôm qua',
  },
];

const KPIS = [
  { l: 'MRR', v: '56 tỷ', c: '+8.2%', cc: C.pos },
  { l: 'Người dùng', v: '12.8K', c: '+3.1%', cc: C.pos },
  { l: 'NPS', v: '72', c: 'ổn định', cc: 'var(--color-text-secondary)' },
  { l: 'Chi phí VH', v: '8.8 tỷ', c: '+5%', cc: C.red },
];

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
}

type FeedFilterId = 'all' | 'alert' | 'insight';

export default function FeedRail({ activeId, onSelect }: FeedRailProps) {
  const [filter, setFilter] = useState<FeedFilterId>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return FEED;
    if (filter === 'alert') return FEED.filter((item) => item.type !== 'insight');
    return FEED.filter((item) => item.type === 'insight');
  }, [filter]);

  const counts = useMemo(() => {
    const alert = FEED.filter((item) => item.type !== 'insight').length;
    const insight = FEED.filter((item) => item.type === 'insight').length;
    return { alert, insight };
  }, []);

  const filters: Array<{ id: FeedFilterId; label: string; count?: number }> = [
    { id: 'all', label: 'Tất cả' },
    { id: 'alert', label: 'Cảnh báo', count: counts.alert },
    { id: 'insight', label: 'Insight', count: counts.insight },
  ];

  return (
    <aside className="w-[300px] shrink-0 border-r border-[color:var(--color-border-tertiary)] bg-[var(--color-background-primary)]">
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
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                    isActive
                      ? 'bg-[#19226D] text-white'
                      : 'border border-[color:var(--color-border-tertiary)] bg-[var(--color-background-secondary)] text-[color:var(--color-text-secondary)] hover:bg-[var(--color-background-tertiary)]',
                  ].join(' ')}
                >
                  <span>{item.label}</span>
                  {typeof item.count === 'number' ? (
                    <span className="text-[10px] opacity-80">{item.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {filtered.map((item) => {
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className={[
                  'mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors',
                  isActive ? 'bg-[#E8EAF5]' : 'hover:bg-[var(--color-background-secondary)]',
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
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className="rounded-lg px-2 py-0.5 text-[10px] font-semibold"
                        style={{ color: item.dot, background: item.tagBg }}
                      >
                        {item.tag}
                      </span>
                      <span className="text-[11px] text-[color:var(--color-text-secondary)]">{item.time}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[color:var(--color-border-tertiary)] px-4 py-3">
          <p
            className="mb-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]"
          >
            Nhịp đập
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {KPIS.map((kpi) => (
              <div key={kpi.l} className="py-1">
                <p className="mb-0.5 text-[10px] text-[color:var(--color-text-secondary)]">{kpi.l}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-[18px] font-semibold text-[color:var(--color-text-primary)]">{kpi.v}</span>
                  <span className="text-[11px] font-semibold" style={{ color: kpi.cc }}>
                    {kpi.c}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Intentionally omit personal/user identity section */}
      </div>
    </aside>
  );
}
