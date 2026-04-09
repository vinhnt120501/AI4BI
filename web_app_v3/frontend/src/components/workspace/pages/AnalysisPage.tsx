'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, SendHorizontal } from 'lucide-react';
import MessageBubble from '@/components/chat/MessageBubble';
import FollowUpSuggestions from '@/components/chat/sections/FollowUpSuggestions';
import { Message } from '@/types/types';

interface AnalysisPageProps {
  busy: boolean;
  messages: Message[];
  query: string;
  onSend: (prompt: string) => void;
  instructionPanelOpen?: boolean;
}

interface ReferenceItem {
  title: string;
  detail: string;
}

const C = {
  brand: '#19226D',
  brandLight: '#E8EAF5',
  blue: '#185FA5',
  blueBg: '#E6F1FB',
};

const BD = '1px solid rgba(148, 163, 184, 0.16)';
const BDL = '1px solid rgba(148, 163, 184, 0.12)';
const SHL = '0 1px 2px rgba(0,0,0,0.04)';

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function truncate(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatValue(value: string | number | undefined) {
  if (value === undefined || value === null || value === '') return 'N/A';
  return String(value);
}

function buildWorkingSet(messages: Message[]): ReferenceItem[] {
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!latestAssistant) return [];

  const columns = latestAssistant.columns || [];
  const rows = latestAssistant.rows || [];
  const items: ReferenceItem[] = [];

  if (columns.length > 0 || rows.length > 0) {
    items.push({
      title: 'Tập dữ liệu hiện tại',
      detail: `${rows.length} dòng và ${columns.length} cột từ truy vấn gần nhất.`,
    });
  }

  if (columns.length > 0) {
    items.push({
      title: 'Các trường chính',
      detail: truncate(columns.slice(0, 5).join(', '), 120),
    });
  }

  if (columns.length > 0 && rows.length > 0) {
    items.push({
      title: 'Giá trị mẫu',
      detail: truncate(
        columns
          .slice(0, 3)
          .map((column, index) => `${column}: ${formatValue(rows[0]?.[index])}`)
          .join(' • '),
        120,
      ),
    });
  }

  if (latestAssistant.sql?.trim()) {
    items.push({
      title: 'SQL tham chiếu',
      detail: truncate(latestAssistant.sql.replace(/\s+/g, ' ').trim(), 120),
    });
  }

  return items.slice(0, 3);
}

function buildRelatedAnalyses(query: string) {
  const normalized = query.trim().replace(/[?.!]+$/, '');
  if (!normalized) return [];

  const shortPrompt = truncate(normalized, 54);
  return [
    `So sánh ${shortPrompt} với 2 kỳ trước`,
    `Yếu tố nào tác động mạnh nhất tới ${shortPrompt}?`,
    `Phân tách ${shortPrompt} theo từng nhóm chi tiết`,
  ];
}

export default function AnalysisPage({ busy, messages, query, onSend, instructionPanelOpen = true }: AnalysisPageProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const contentMaxWidth = instructionPanelOpen ? 1080 : 1320;

  const workingSet = useMemo(() => buildWorkingSet(messages), [messages]);
  const relatedAnalyses = useMemo(() => buildRelatedAnalyses(query), [query]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    onSend(prompt);
    setInput('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '24px 32px 18px', borderBottom: BD, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 24, fontWeight: 600, margin: 0, color: '#0f172a' }}>
            {query ? `Phân tích: ${query}` : 'Phân tích'}
          </p>
          {busy ? (
            <span style={{ fontSize: 11, background: C.brandLight, color: C.brand, padding: '4px 12px', borderRadius: 10, fontWeight: 600 }}>
              Đang chạy
            </span>
          ) : null}
        </div>
        <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>Luồng phân tích chi tiết và dữ liệu tham chiếu cho truy vấn hiện tại.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ width: '100%', maxWidth: contentMaxWidth, margin: '0 auto', padding: '24px 32px 16px', transition: 'max-width 0.25s ease' }}>
          {(workingSet.length > 0 || relatedAnalyses.length > 0) ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 20,
                marginBottom: 24,
              }}
            >
              <div style={{ background: '#fff', border: BDL, borderRadius: 18, padding: '18px 20px' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px' }}>Dữ liệu được tham chiếu</p>
                {workingSet.length > 0 ? (
                  workingSet.map((item, index) => (
                    <div key={item.title} style={{ padding: '10px 0', borderBottom: index === workingSet.length - 1 ? 'none' : BDL, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, borderRadius: 4, background: C.blueBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 500, margin: 0, color: '#0f172a' }}>{item.title}</p>
                        <p style={{ fontSize: 11, margin: '2px 0 0', color: '#64748b', lineHeight: 1.45 }}>{item.detail}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>Chưa có thông tin.</p>
                )}
              </div>

              <div style={{ background: '#fff', border: BDL, borderRadius: 18, padding: '18px 20px' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px' }}>Phân tích liên quan</p>
                {relatedAnalyses.length > 0 ? (
                  relatedAnalyses.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      onClick={() => onSend(item)}
                      style={{ padding: '8px 0', borderBottom: index === relatedAnalyses.length - 1 ? 'none' : BDL, cursor: 'pointer', fontSize: 13, color: C.brand, fontWeight: 500 }}
                    >
                      {item}
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, margin: 0 }}>Chưa có thông tin.</p>
                )}
              </div>
            </div>
          ) : null}

          {messages.length === 0 ? (
            <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> : null}
            </div>
          ) : (
            messages.map((message, index) => {
              const previousUserMessage = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user');
              const copyParts: string[] = [];

              if (previousUserMessage?.content?.trim()) {
                copyParts.push(`Câu hỏi:\n${previousUserMessage.content.trim()}`);
              }
              if (message.content?.trim()) {
                copyParts.push(`Phản hồi:\n${message.content.trim()}`);
              }

              return (
                <div key={message.id} style={{ marginBottom: 20 }}>
                  <MessageBubble
                    message={message}
                    copyText={message.role === 'assistant' ? copyParts.join('\n\n') : undefined}
                  />
                  {message.role === 'assistant' && message.isDone && (message.followUpSuggestions || []).length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <FollowUpSuggestions suggestions={message.followUpSuggestions || []} onSelect={onSend} />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div style={{ padding: '12px 32px 20px', borderTop: BD, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', maxWidth: contentMaxWidth, margin: '0 auto', transition: 'max-width 0.25s ease' }}>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 24, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, border: BD, boxShadow: SHL }}>
            <Dot color={C.brand} size={8} />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Tiếp tục phân tích..."
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit();
              }}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 15, color: '#0f172a', width: '100%', fontFamily: 'inherit' }}
            />
          </div>
          <div
            onClick={submit}
            style={{ width: 44, height: 44, borderRadius: '50%', background: busy ? '#cbd5e1' : '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'not-allowed' : 'pointer', flexShrink: 0 }}
          >
            <SendHorizontal size={18} color="#ffffff" />
          </div>
        </div>
      </div>
    </div>
  );
}
