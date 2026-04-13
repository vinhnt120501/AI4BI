'use client';

import React from 'react';
import { StatCardItem } from '@/types/types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const THEMES: Record<string, { accent: string; bg: string; border: string; badge: string; icon: string }> = {
  blue:   { accent: 'text-blue-700',    bg: 'bg-blue-50/60',    border: 'border-blue-200/60',    badge: 'bg-blue-100 text-blue-700',    icon: 'text-blue-400' },
  green:  { accent: 'text-emerald-700', bg: 'bg-emerald-50/60', border: 'border-emerald-200/60', badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-400' },
  teal:   { accent: 'text-teal-700',    bg: 'bg-teal-50/60',    border: 'border-teal-200/60',    badge: 'bg-teal-100 text-teal-700',    icon: 'text-teal-400' },
  indigo: { accent: 'text-indigo-700',  bg: 'bg-indigo-50/60',  border: 'border-indigo-200/60',  badge: 'bg-indigo-100 text-indigo-700', icon: 'text-indigo-400' },
  purple: { accent: 'text-violet-700',  bg: 'bg-violet-50/60',  border: 'border-violet-200/60',  badge: 'bg-violet-100 text-violet-700', icon: 'text-violet-400' },
  orange: { accent: 'text-amber-700',   bg: 'bg-amber-50/60',   border: 'border-amber-200/60',   badge: 'bg-amber-100 text-amber-700',   icon: 'text-amber-400' },
  red:    { accent: 'text-rose-700',    bg: 'bg-rose-50/60',    border: 'border-rose-200/60',    badge: 'bg-rose-100 text-rose-700',     icon: 'text-rose-400' },
  cyan:   { accent: 'text-cyan-700',    bg: 'bg-cyan-50/60',    border: 'border-cyan-200/60',    badge: 'bg-cyan-100 text-cyan-700',     icon: 'text-cyan-400' },
  slate:  { accent: 'text-slate-700',   bg: 'bg-slate-50/60',   border: 'border-slate-200/60',   badge: 'bg-slate-100 text-slate-600',   icon: 'text-slate-400' },
};

const COLOR_CYCLE = ['blue', 'teal', 'indigo', 'purple', 'green', 'orange', 'cyan'];

const MIN_CARD_PX = 260;
const GAP_PX = 16; // Tailwind `gap-4`

function pickIdealColumns(containerWidth: number) {
  if (!containerWidth || containerWidth <= 0) return 1;

  // Keep columns such that cards don't get too narrow.
  // 1 col: < 2*min + 1*gap
  // 2 col: < 3*min + 2*gap
  // 3 col: < 4*min + 3*gap
  if (containerWidth < MIN_CARD_PX * 2 + GAP_PX * 1) return 1;
  if (containerWidth < MIN_CARD_PX * 3 + GAP_PX * 2) return 2;
  if (containerWidth < MIN_CARD_PX * 4 + GAP_PX * 3) return 3;
  return 4;
}

function balanceColumns(itemCount: number, ideal: number) {
  if (itemCount <= 1) return 1;
  let cols = Math.max(1, Math.min(ideal, itemCount));
  // Avoid ugly orphan rows like 3+1 for 4 cards (or 4+1 for 5 cards, etc.)
  // but keep 2+1 for 3 cards (that's a normal layout).
  while (cols > 2 && itemCount % cols === 1) cols -= 1;
  return cols;
}

function TrendBadge({ trend }: { trend: string }) {
  if (trend === 'neutral') {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500`}>
        <Minus size={10} />
      </span>
    );
  }

  const isUp = trend === 'up';
  // Use semantic colors for trends: green=up, red=down (regardless of card color)
  const trendClass = isUp
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700';

  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${trendClass}`}>
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
    </span>
  );
}

export default function StatCard({ items }: { items?: StatCardItem[] }) {
  if (!items || items.length === 0) return null;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries?.[0]?.contentRect?.width;
      if (typeof w === 'number' && !Number.isNaN(w)) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const idealCols = pickIdealColumns(containerWidth);
  const cols = balanceColumns(items.length, idealCols);

  return (
    <div
      ref={containerRef}
      className="grid w-full gap-4 grid-flow-row-dense"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => {
        const colorKey = item.color || COLOR_CYCLE[i % COLOR_CYCLE.length];
        const theme = THEMES[colorKey] || THEMES.slate;

        return (
          <div
            key={i}
            className={`relative overflow-hidden border ${theme.border} rounded-2xl px-5 py-5 ${theme.bg} transition-all hover:shadow-lg hover:-translate-y-0.5 duration-300 group min-h-[112px]`}
          >
            {/* Decorative gradient blob */}
            <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full ${theme.bg} opacity-40 blur-xl group-hover:scale-125 transition-transform duration-700`} />

            <div className="relative z-10 flex flex-col gap-2">
              {/* Label */}
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 leading-tight">
                {item.label}
              </div>

              {/* Value + Trend */}
              <div className="flex items-center gap-2.5">
                <div className={`text-[24px] md:text-[28px] font-extrabold ${theme.accent} tracking-tight leading-none break-words`}>
                  {item.value}
                </div>
                {item.trend && <TrendBadge trend={item.trend} />}
              </div>

              {/* Subtitle - context from LLM */}
              {item.subtitle && (
                <div className="text-[12px] text-slate-500 leading-snug mt-0.5">
                  {item.subtitle}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
