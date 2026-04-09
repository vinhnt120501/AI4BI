'use client';

import React from 'react';
import { CheckCircle2, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { MessageEvent } from '@/types/types';

interface ProgressTimelineProps {
  currentStep: number;
  statusText?: string;
  statusHistory?: string[];
  eventTimeline?: MessageEvent[];
}

function formatElapsed(atMs?: number) {
  if (typeof atMs !== 'number' || atMs < 0) return '';
  return `${(atMs / 1000).toFixed(1)}s`;
}

function translateEvent(event: string) {
  switch (event) {
    case 'debug_payload':
      return 'Khởi tạo ngữ cảnh';
    case 'status':
      return 'Đang xử lý';
    case 'thinking':
      return 'Phân tích yêu cầu';
    case 'sql':
      return 'Tạo truy vấn SQL';
    case 'data':
      return 'Nhận dữ liệu';
    case 'additional_data':
      return 'Truy vấn bổ sung';
    case 'reply':
      return 'Sinh phản hồi';
    case 'suggestions':
      return 'Tạo gợi ý tiếp theo';
    case 'timing':
      return 'Thời gian xử lý';
    case 'done':
      return 'Hoàn tất';
    case 'error':
      return 'Lỗi xử lý';
    default:
      return event;
  }
}

function buildSummaryText(item?: MessageEvent) {
  if (!item) return 'Đang xử lý yêu cầu.';

  switch (item.event) {
    case 'debug_payload':
      return 'Đang chuẩn bị ngữ cảnh xử lý.';
    case 'status':
      return item.detail || 'Đang xử lý yêu cầu.';
    case 'thinking':
      return 'Đang phân tích yêu cầu.';
    case 'sql':
      return 'Đã tạo truy vấn SQL.';
    case 'data':
      return 'Đã nhận dữ liệu từ hệ thống.';
    case 'additional_data':
      return 'Đang truy vấn bổ sung dữ liệu.';
    case 'reply':
      return 'Đã tạo phản hồi cho người dùng.';
    case 'suggestions':
      return 'Đã tạo các gợi ý tiếp theo.';
    case 'timing':
      return item.detail || 'Đã ghi nhận thời gian xử lý.';
    case 'done':
      return 'Đã hoàn tất quy trình xử lý.';
    case 'error':
      return 'Có lỗi trong quá trình xử lý.';
    default:
      return translateEvent(item.event);
  }
}

export default function ProgressTimeline({ currentStep, statusText, statusHistory, eventTimeline }: ProgressTimelineProps) {
  const items: MessageEvent[] = eventTimeline && eventTimeline.length > 0
    ? eventTimeline
    : (statusHistory || []).map((text) => ({ event: 'status', detail: text, atMs: undefined }));

  if (items.length === 0 && !statusText && currentStep <= 0) return null;

  const lastItem = items[items.length - 1];
  const totalElapsed = items.reduce<number | undefined>((latest, item) => {
    if (typeof item.atMs !== 'number') return latest;
    return typeof latest === 'number' ? Math.max(latest, item.atMs) : item.atMs;
  }, undefined);
  const summaryText = buildSummaryText(lastItem);

  return (
    <details className="rounded-2xl bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-1 py-2 text-slate-700 marker:content-none">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-700">Quá trình xử lý</div>
          <div className="mt-0.5 truncate text-[12px] text-slate-500">{summaryText}</div>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-slate-400">
          <span>{items.length} bước</span>
          {typeof totalElapsed === 'number' ? <span>{formatElapsed(totalElapsed)}</span> : null}
          <ChevronDown className="h-4 w-4" />
        </div>
      </summary>

      <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-white px-4 py-4">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const isError = item.event === 'error';

          let icon: React.ReactNode = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />;
          if (isError) {
            icon = <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500 fill-rose-500/10" />;
          } else if (isLast && item.event !== 'done' && item.event !== 'suggestions' && item.event !== 'reply') {
            icon = <Loader2 className="mt-0.5 h-4 w-4 flex-shrink-0 animate-spin text-slate-500" />;
          } else {
            icon = <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />;
          }

          return (
            <div key={`${item.event}-${index}`} className="flex items-start gap-2.5">
              {icon}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-[13px] font-medium leading-relaxed text-slate-700">
                    {translateEvent(item.event)}
                  </div>
                  {item.atMs !== undefined ? <span className="text-[11px] text-slate-400">{formatElapsed(item.atMs)}</span> : null}
                </div>
                {item.detail ? (
                  <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-slate-500">
                    {item.detail}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
