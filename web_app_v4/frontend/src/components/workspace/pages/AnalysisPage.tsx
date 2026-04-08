'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import MessageBubble from '@/components/chat/MessageBubble';
import FollowUpSuggestions from '@/components/chat/sections/FollowUpSuggestions';
import ReferenceDataDisclosure from '@/components/chat/sections/ReferenceDataDisclosure';
import { Message } from '@/types/types';

interface AnalysisPageProps {
  busy: boolean;
  messages: Message[];
  query: string;
  onSend: (prompt: string) => void;
  instructionPanelOpen?: boolean;
}

const C = {
  brand: '#19226D',
  brandLight: '#E8EAF5',
  blue: '#185FA5',
  blueBg: '#E6F1FB',
};

const BD = '1px solid rgba(148, 163, 184, 0.16)';
const SHL = '0 1px 2px rgba(0,0,0,0.04)';

const LANDING_SUGGESTIONS = [
  'Tại sao miền Nam giảm?',
  'So sánh khu vực Q1',
  'Mô phỏng cắt budget marketing',
  'Dự báo MRR Q2',
];

export default function AnalysisPage({ busy, messages, query, onSend, instructionPanelOpen = true }: AnalysisPageProps) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [landingInput, setLandingInput] = useState('');
  const [landingError, setLandingError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentMaxWidth = instructionPanelOpen ? 1080 : 1320;

  const baseQuery = useMemo(() => {
    const latestUser = [...messages].reverse().find((message) => message.role === 'user' && message.content.trim());
    return (latestUser?.content || query || '').trim();
  }, [messages, query]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (inputErrorTimerRef.current) clearTimeout(inputErrorTimerRef.current);
      if (landingErrorTimerRef.current) clearTimeout(landingErrorTimerRef.current);
    };
  }, []);

  const submit = () => {
    const prompt = input.trim();
    if (!prompt) {
      setInputError('Nhập thông tin cần phân tích');
      if (inputErrorTimerRef.current) clearTimeout(inputErrorTimerRef.current);
      inputErrorTimerRef.current = setTimeout(() => setInputError(''), 3000);
      return;
    }
    if (busy) return;
    onSend(prompt);
    setInput('');
  };

  const submitLanding = () => {
    const prompt = landingInput.trim();
    if (!prompt) {
      setLandingError('Nhập thông tin cần phân tích');
      if (landingErrorTimerRef.current) clearTimeout(landingErrorTimerRef.current);
      landingErrorTimerRef.current = setTimeout(() => setLandingError(''), 3000);
      return;
    }
    if (busy) return;
    onSend(prompt);
    setLandingInput('');
    setLandingError('');
  };

  const isLanding = messages.length === 0 && !baseQuery && !busy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {!isLanding ? (
        <div style={{ padding: '24px 32px 18px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 24, fontWeight: 600, margin: 0, color: '#0f172a' }}>
              {baseQuery ? `Phân tích: ${baseQuery}` : 'Phân tích'}
            </p>
            {busy ? (
              <span style={{ fontSize: 11, background: C.brandLight, color: C.brand, padding: '4px 12px', borderRadius: 10, fontWeight: 600 }}>
                Đang chạy
              </span>
            ) : null}
          </div>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>Luồng phân tích chi tiết và dữ liệu tham chiếu cho truy vấn hiện tại.</p>
        </div>
      ) : null}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ width: '100%', maxWidth: contentMaxWidth, margin: '0 auto', padding: '24px 32px 16px', transition: 'max-width 0.25s ease' }}>
          {isLanding ? (
            <div className="flex min-h-[620px] flex-col items-center justify-center px-6 text-center">
              <p className="mb-3 text-[40px] font-semibold tracking-tight text-slate-900">
                Sẵn sàng phân tích
              </p>
              <p className="mb-10 max-w-[680px] text-[16px] leading-relaxed text-slate-500">
                Nhập câu hỏi để bắt đầu, hoặc chọn một gợi ý có sẵn bên dưới.
              </p>

              <div className="w-full max-w-[1200px]">
                <div className="mb-6">
                  <div className="mx-auto w-full max-w-[760px]">
                    <FollowUpSuggestions suggestions={LANDING_SUGGESTIONS} onSelect={onSend} variant="landing" />
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[1200px]">
                  <div
                    className="flex flex-col rounded-[36px] border-2 border-slate-200 bg-white px-7 py-4 shadow-[0_14px_30px_-18px_rgba(15,23,42,0.30)] transition-colors focus-within:border-black"
                  >
                    <div className="flex w-full items-center">
                      <input
                        value={landingInput}
                        disabled={busy}
                        onChange={(event) => {
                          setLandingInput(event.target.value);
                          if (landingError) setLandingError('');
                        }}
                        placeholder="Vấn đề cần phân tích..."
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') submitLanding();
                        }}
                        className="w-full border-none bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                        style={{ fontFamily: 'inherit' }}
                      />
                      <button
                        type="button"
                        onClick={submitLanding}
                        aria-disabled={busy || landingInput.trim() === ''}
                        className={[
                          'ml-4 rounded-full px-5 py-2 text-[13px] font-semibold shadow-sm transition-colors',
                          busy || landingInput.trim() === ''
                            ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                            : 'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950',
                        ].join(' ')}
                      >
                        Gửi
                      </button>
                    </div>
                    {landingError ? (
                      <div className="mt-2 w-full text-left text-[12px] font-medium text-rose-600">
                        {landingError}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
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
                    <div style={{ marginTop: 12 }} className="space-y-3">
                      <ReferenceDataDisclosure columns={message.columns} rows={message.rows} sql={message.sql} />
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

      {!isLanding ? (
        <div style={{ padding: '12px 32px 20px', flexShrink: 0 }}>
          <div
            className="mx-auto w-full"
            style={{ maxWidth: contentMaxWidth, transition: 'max-width 0.25s ease' }}
          >
            <div className="flex flex-col rounded-[36px] border-2 border-slate-200 bg-white px-7 py-4 shadow-[0_14px_30px_-18px_rgba(15,23,42,0.30)] transition-colors focus-within:border-black">
              <div className="flex w-full items-center">
                <input
                  value={input}
                  disabled={busy}
                  onChange={(event) => {
                    setInput(event.target.value);
                    if (inputError) setInputError('');
                  }}
                  placeholder={busy ? 'Đang xử lý...' : 'Tiếp tục phân tích...'}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submit();
                  }}
                  className="w-full border-none bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-400"
                  style={{ fontFamily: 'inherit' }}
                />
                <button
                  type="button"
                  onClick={submit}
                  aria-disabled={busy || input.trim() === ''}
                  className={[
                    'ml-4 rounded-full px-5 py-2 text-[13px] font-semibold shadow-sm transition-colors',
                    busy || input.trim() === ''
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950',
                  ].join(' ')}
                >
                  Gửi
                </button>
              </div>
              {inputError ? (
                <div className="mt-2 w-full text-left text-[12px] font-medium text-rose-600">
                  {inputError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
