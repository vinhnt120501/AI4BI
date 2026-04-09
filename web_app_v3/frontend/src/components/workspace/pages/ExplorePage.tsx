'use client';

import React, { useState } from 'react';
import type { AnalysisTarget } from '@/components/workspace/types';

interface ExplorePageProps {
  onAction: (target: AnalysisTarget) => void;
  instructionPanelOpen?: boolean;
}

const C = {
  brand: '#19226D',
  brandLight: '#E8EAF5',
  amber: '#EF9F27',
  amberBg: '#FAEEDA',
  blue: '#185FA5',
  blueBg: '#E6F1FB',
  purple: '#534AB7',
  purpleBg: '#EEEDFE',
  amberDk: '#BA7517',
  pos: '#1D9E75',
  red: '#E24B4A',
};

const BD = '1px solid rgba(148, 163, 184, 0.16)';
const BDL = '1px solid rgba(148, 163, 184, 0.12)';
const SH = '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)';
const SHL = '0 1px 2px rgba(0,0,0,0.04)';

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

export default function ExplorePage({ onAction, instructionPanelOpen = true }: ExplorePageProps) {
  const [input, setInput] = useState('');
  const contentMaxWidth = instructionPanelOpen ? 960 : 1160;

  const submit = () => {
    const prompt = input.trim();
    if (!prompt) return;
    onAction({ prompt });
    setInput('');
  };

  const spaces = [
    {
      title: 'Doanh thu',
      detail: 'MRR, ARR, churn, mở rộng',
      prompt: 'Doanh thu',
      statusColor: C.red,
      status: '1 tín hiệu',
      bg: C.brandLight,
      stroke: C.brand,
      icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
    },
    {
      title: 'Marketing',
      detail: 'CAC, kênh, chiến dịch',
      prompt: 'Marketing',
      statusColor: C.amber,
      status: '1 tín hiệu',
      bg: C.amberBg,
      stroke: C.amberDk,
      icon: <><path d="M18 20V10" /><path d="M12 20V4" /><path d="M6 20v-6" /></>,
    },
    {
      title: 'Bán hàng',
      detail: 'Pipeline, win rate, đội ngũ',
      prompt: 'Bán hàng',
      statusColor: C.pos,
      status: 'Ổn định',
      bg: C.blueBg,
      stroke: C.blue,
      icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /></>,
    },
    {
      title: 'Sản phẩm',
      detail: 'DAU, retention, tính năng',
      prompt: 'Sản phẩm',
      statusColor: C.pos,
      status: 'Ổn định',
      bg: C.purpleBg,
      stroke: C.purple,
      icon: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>,
    },
  ];

  const stories = [
    { title: 'Vì sao deal doanh nghiệp tăng tốc', detail: 'Phân tích sâu kết nối chương trình đối tác với pipeline tăng. Kèm mô hình dự báo cho Q2.', tag: 'Bán hàng', time: '2 giờ trước' },
    { title: 'Báo cáo hiệu quả marketing Q1', detail: 'Chi phí vs. kết quả tất cả kênh. Organic vượt trội paid gấp 3 lần.', tag: 'Marketing', time: 'Hôm qua' },
    { title: 'Cảnh báo churn: 12 tài khoản', detail: 'Mô hình dự đoán phát hiện xu hướng giảm tương tác ở 12 tài khoản mid-market trong 30 ngày.', tag: 'Doanh thu', time: '2 ngày trước' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', background: '#fff' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: 32, maxWidth: contentMaxWidth, transition: 'max-width 0.25s ease' }}>
          <p style={{ fontSize: 24, fontWeight: 600, margin: '0 0 6px', color: '#0f172a' }}>Khám phá</p>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 28px' }}>Dữ liệu theo lĩnh vực và phân tích tự động</p>

          <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Không gian dữ liệu</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
            {spaces.map((item) => (
              <div key={item.title} onClick={() => onAction({ prompt: item.prompt })}
                style={{ background: '#fff', border: BD, borderRadius: 16, padding: 18, cursor: 'pointer', boxShadow: SH }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={item.stroke} strokeWidth="2">{item.icon}</svg>
                </div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#0f172a', margin: '0 0 4px' }}>{item.title}</p>
                <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4, margin: '0 0 12px' }}>{item.detail}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Dot color={item.statusColor} size={7} />
                  <span style={{ fontSize: 11, color: item.statusColor, fontWeight: 600 }}>{item.status}</span>
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Phân tích gần đây</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stories.map((item) => (
              <div key={item.title} onClick={() => onAction({ prompt: item.title })}
                style={{ background: '#fff', border: BD, borderRadius: 14, padding: '16px 20px', cursor: 'pointer', boxShadow: SH, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: '#0f172a', margin: '0 0 4px' }}>{item.title}</p>
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.45, margin: 0 }}>{item.detail}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '3px 10px', borderRadius: 8, border: BDL }}>{item.tag}</span>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{item.time}</span>
                </div>
              </div>
            ))}
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
