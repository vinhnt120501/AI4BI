'use client';

import React, { useState } from 'react';
import type { AnalysisTarget } from '@/components/workspace/types';

interface OverviewPageProps {
  onAction: (target: AnalysisTarget) => void;
  instructionPanelOpen?: boolean;
}

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

const BD = '1px solid rgba(148, 163, 184, 0.16)';
const BDL = '1px solid rgba(148, 163, 184, 0.12)';
const SH = '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)';
const SHL = '0 1px 2px rgba(0,0,0,0.04)';

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function Ico({ children, size = 18 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default function OverviewPage({ onAction, instructionPanelOpen = true }: OverviewPageProps) {
  const [input, setInput] = useState('');
  const contentMaxWidth = instructionPanelOpen ? 960 : 1160;

  const submit = () => {
    const prompt = input.trim();
    if (!prompt) return;
    onAction({ prompt });
    setInput('');
  };

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', background: '#fff' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: 32, maxWidth: contentMaxWidth, transition: 'max-width 0.25s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <p style={{ fontSize: 24, fontWeight: 600, margin: 0, color: '#0f172a' }}>Tổng quan</p>
              <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Cập nhật 2 phút trước — 14 nguồn dữ liệu</p>
            </div>
            <div style={{ position: 'relative', cursor: 'pointer', padding: 4 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <div style={{ position: 'absolute', top: 2, right: 2, width: 9, height: 9, borderRadius: '50%', background: C.red, border: '2px solid #fff' }} />
            </div>
          </div>

          <div style={{ background: '#f8fafc', borderRadius: 16, padding: '18px 22px', marginBottom: 28, border: BD, boxShadow: SH }}>
            <p style={{ fontSize: 15, color: '#0f172a', margin: 0, lineHeight: 1.65 }}>
              Đã quét <strong>14 nguồn dữ liệu</strong> từ phiên trước. Doanh thu nhìn chung tích cực, nhưng <span style={{ color: C.red, fontWeight: 600 }}>khu vực miền Nam cần chú ý</span> — 3 tài khoản lớn bị đình trệ. Pipeline doanh nghiệp đạt mức cao nhất mọi thời đại.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'MRR', value: '56 tỷ', copy: '+8.2%', color: C.pos },
              { label: 'Người dùng hoạt động', value: '12.8K', copy: '+3.1%', color: C.pos },
              { label: 'NPS', value: '72', copy: 'ổn định', color: '#64748b' },
              { label: 'Chi phí vận hành', value: '8.8 tỷ', copy: '+5%', color: C.red },
            ].map((item) => (
              <div key={item.label} style={{ background: '#f8fafc', borderRadius: 14, padding: '16px 18px', border: BD, boxShadow: SHL }}>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 8px' }}>{item.label}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <p style={{ fontSize: 26, fontWeight: 600, margin: 0, color: '#0f172a' }}>{item.value}</p>
                  <span style={{ fontSize: 13, color: item.color, fontWeight: 500 }}>{item.copy}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Tín hiệu</p>
              <div style={{ borderRadius: 16, border: BD, overflow: 'hidden', boxShadow: SH }}>
                {[
                  { dot: C.red, title: 'Doanh thu miền Nam -18% WoW', detail: '3 tài khoản lớn trì hoãn gia hạn.', tag: 'Nghiêm trọng', tagColor: C.red, tagBg: C.redBg },
                  { dot: C.amber, title: 'CAC đạt 3.2tr, vượt 12% mục tiêu', detail: 'CPC quảng cáo tìm kiếm tăng.', tag: 'Theo dõi', tagColor: C.amber, tagBg: C.amberBg },
                  { dot: C.pos, title: 'Pipeline doanh nghiệp +34% MoM', detail: 'Cao nhất từ trước đến nay.', tag: 'Tích cực', tagColor: C.pos, tagBg: C.posLight },
                ].map((item, index, arr) => (
                  <div
                    key={item.title}
                    onClick={() => onAction({ prompt: item.title })}
                    style={{ padding: '14px 16px', borderBottom: index === arr.length - 1 ? 'none' : BDL, cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
                  >
                    <Dot color={item.dot} size={9} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 3px', color: '#0f172a' }}>{item.title}</p>
                      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{item.detail}</p>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: item.tagColor, background: item.tagBg, padding: '3px 8px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {item.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Phân tích đề xuất</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  'Phân tích sâu: tại sao miền Nam giảm?',
                  'Mô phỏng: cắt 20% chi quảng cáo',
                  'Tạo báo cáo cho ban lãnh đạo',
                  'So sánh hiệu suất theo khu vực',
                ].map((prompt) => (
                  <div
                    key={prompt}
                    onClick={() => onAction({ prompt })}
                    style={{ background: '#f8fafc', border: BD, borderRadius: 12, padding: '12px 16px', fontSize: 14, color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: SHL }}
                  >
                    <span>{prompt}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
                      <path d="M7 17l9.2-9.2M7 7h10v10" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: contentMaxWidth, padding: '0 32px 20px', transition: 'max-width 0.25s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 24, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, border: BD, boxShadow: SHL }}>
            <Dot color={C.brand} size={8} />
            <input
              value={input}
              placeholder="Vấn đề cần phân tích..."
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: '#0f172a', width: '100%', fontFamily: 'inherit' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
