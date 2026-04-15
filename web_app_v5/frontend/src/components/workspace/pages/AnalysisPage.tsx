'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MessageBubble from '@/components/chat/MessageBubble';
import FollowUpSuggestions from '@/components/chat/sections/FollowUpSuggestions';
import { Message } from '@/types/types';
import { buildApiUrl, DEFAULT_USER_ID, fetchWithRetry } from '@/lib/api';
import { BRAND_COLORS } from '@/lib/colors';

interface AnalysisPageProps {
  busy: boolean;
  messages: Message[];
  query: string;
  onSend: (prompt: string) => void;
  onSelectHistory?: (sessionId: string) => void;
  instructionPanelOpen?: boolean;
}

type RecentQuestion = { sessionId: string; question: string };

const C = BRAND_COLORS;

export default function AnalysisPage({ busy, messages, query, onSend, onSelectHistory, instructionPanelOpen = true }: AnalysisPageProps) {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [landingInput, setLandingInput] = useState('');
  const [landingError, setLandingError] = useState('');
  const [landingSuggestions, setLandingSuggestions] = useState<string[]>([]);
  const [landingSuggestionsLoading, setLandingSuggestionsLoading] = useState(true);
  const [landingSuggestionsError, setLandingSuggestionsError] = useState('');
  const [recentQuestions, setRecentQuestions] = useState<RecentQuestion[]>([]);
  const [recentQuestionsLoading, setRecentQuestionsLoading] = useState(true);
  const [recentQuestionsError, setRecentQuestionsError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const landingErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentMaxWidth = instructionPanelOpen ? 1080 : 1320;

  const loadLandingSuggestions = useCallback(async () => {
    setLandingSuggestionsLoading(true);
    setLandingSuggestionsError('');
    try {
      const url = buildApiUrl(`/landing-suggestions?userId=${encodeURIComponent(DEFAULT_USER_ID)}`);
      const data = await fetchWithRetry(url, 15000);
      const items = Array.isArray(data?.items) ? data.items.filter((s: unknown) => typeof s === 'string' && s) : [];
      if (items.length > 0) setLandingSuggestions(items);
    } catch (err) {
      console.error("Landing suggestions fetch failed:", err);
    } finally {
      setLandingSuggestionsLoading(false);
    }
  }, []);

  const loadRecentQuestions = useCallback(async () => {
    setRecentQuestionsLoading(true);
    setRecentQuestionsError('');
    try {
      const url = buildApiUrl(`/chat/history?userId=${encodeURIComponent(DEFAULT_USER_ID)}&limit=4&offset=0`);
      const data = await fetchWithRetry(url, 15000);
      const items = Array.isArray(data?.items) ? data.items : [];
      const questions: RecentQuestion[] = items
        .map((row: any) => ({
          sessionId: String(row?.sessionId || ''),
          question: String(row?.question || '').trim(),
        }))
        .filter((r: RecentQuestion) => r.sessionId && r.question)
        .slice(0, 4);
      setRecentQuestions(questions);
    } catch (err) {
      console.error("Recent questions fetch failed:", err);
    } finally {
      setRecentQuestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLandingSuggestions();
    void loadRecentQuestions();
  }, [loadLandingSuggestions, loadRecentQuestions]);

  const baseQuery = useMemo(() => {
    const latestUser = [...messages].reverse().find((message) => message.role === 'user' && message.content.trim());
    return (latestUser?.content || query || '').trim();
  }, [messages, query]);

  const hasUserAsked = useMemo(() => {
    return messages.some((message) => message.role === 'user' && message.content.trim());
  }, [messages]);

  // Internal scroll handling to prevent global page "jumping"
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
  }, []);

  const handleSend = useCallback((prompt: string) => {
    const trimmed = (prompt || '').trim();
    if (!trimmed) return;
    // User intent: jump to the active chat and stay at the bottom.
    pinnedToBottomRef.current = true;
    scrollToBottom('smooth');
    onSend(trimmed);
  }, [onSend, scrollToBottom]);

  const updatePinnedState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedToBottomRef.current = distance <= 220;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Keep pinned state in sync with user scroll.
    updatePinnedState();
    el.addEventListener('scroll', updatePinnedState, { passive: true });
    return () => el.removeEventListener('scroll', updatePinnedState);
  }, [updatePinnedState]);

  // Scroll immediately when a new message pair is appended or when analysis starts.
  useEffect(() => {
    if (messages.length === 0) return;
    pinnedToBottomRef.current = true;
    scrollToBottom('smooth');
  }, [messages.length, scrollToBottom]);

  // Progressive scroll while streaming — but only if user is already near bottom.
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (!busy) return;
    if (!pinnedToBottomRef.current) return;
    scrollToBottom('auto');
  }, [busy, lastMessage?.content, lastMessage?.blocks?.length, lastMessage?.isDone, scrollToBottom]);

  // Observe layout changes (charts, images, progressive block reveals) and keep view pinned.
  useEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;
    const ro = new ResizeObserver(() => {
      if (!pinnedToBottomRef.current) return;
      scrollToBottom('auto');
    });
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [scrollToBottom]);

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
    handleSend(prompt);
    setInput('');
  };

  const isLanding = messages.length === 0 && !baseQuery && !busy;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white">
      {/* Header - Fixed & Clean */}
      {!isLanding && (
        <div className="z-20 flex-shrink-0 bg-white px-8 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[24px] font-bold tracking-tight text-slate-900">
              {baseQuery ? `Phân tích: ${baseQuery}` : 'Phân tích'}
            </h1>
            {busy && (
              <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-600">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600" />
                Đang phân tích
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[13px] text-slate-500">Luồng phân tích chi tiết và dữ liệu tham chiếu cho truy vấn hiện tại.</p>
        </div>
      )}

      {/* Main Content Area - Fixed on Landing, Scrollable on Chat */}
      <div 
        ref={scrollRef}
        className={`relative flex-1 ${isLanding ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}
        style={{ 
          msOverflowStyle: isLanding ? 'none' : 'auto',
          scrollbarWidth: isLanding ? 'none' : 'thin',
          height: '100%'
        }}
      >
        <div
          ref={contentRef}
          style={{ 
          width: '100%', 
          maxWidth: '100%', 
          margin: '0 auto', 
          padding: isLanding ? '0 16px' : '20px 16px 60px', 
          height: isLanding ? '100%' : 'auto',
          display: isLanding ? 'flex' : 'block',
          flexDirection: 'column',
          justifyContent: isLanding ? 'center' : 'flex-start',
          alignItems: isLanding ? 'center' : 'stretch',
          transition: 'max-width 0.25s ease' 
        }}
        >
          {isLanding ? (
            <div className="flex w-full max-h-full flex-col items-center justify-center py-4 text-center">
              <div className="flex-shrink-0">
                <p className="mb-2 text-[min(6vh,32px)] font-bold tracking-tight text-slate-900">
                  Sẵn sàng phân tích
                </p>
                <p className="mb-4 max-w-[680px] text-[min(2vh,15px)] leading-relaxed text-slate-500">
                  Nhập câu hỏi để bắt đầu, hoặc chọn một gợi ý có sẵn bên dưới.
                </p>
              </div>

              <div className="flex w-full min-h-0 max-w-[1000px] flex-col overflow-hidden">
                <div className="mb-4 flex-shrink-0">
                  <div className="mx-auto w-full max-w-[760px]">
                    <FollowUpSuggestions suggestions={landingSuggestions} onSelect={handleSend} variant="landing" loading={landingSuggestionsLoading} />
                  </div>
                </div>

                {(!recentQuestionsError && (recentQuestionsLoading || recentQuestions.length > 0)) && (
                  <div className="mb-2 min-h-0 flex-shrink flex-col overflow-hidden text-left">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Câu hỏi gần đây</p>
                    {recentQuestionsLoading ? (
                      <FollowUpSuggestions suggestions={[]} onSelect={() => {}} variant="landing" loading fullWidth />
                    ) : (
                      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                        {recentQuestions.slice(0, 4).map((item, idx) => (
                          <button
                            key={`${idx}-${item.sessionId}`}
                            type="button"
                            onClick={() => {
                              pinnedToBottomRef.current = true;
                              scrollToBottom('auto');
                              onSelectHistory?.(item.sessionId);
                            }}
                            title={item.question}
                            className="group flex min-h-[44px] items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                          >
                            <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-700 line-clamp-1">
                              {item.question}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                <div key={message.id} className="mb-8">
                  <MessageBubble
                    message={message}
                    copyText={message.role === 'assistant' ? copyParts.join('\n\n') : undefined}
                    onRetry={message.role === 'assistant' && previousUserMessage ? () => handleSend(previousUserMessage.content) : undefined}
                  />
                  {message.role === 'assistant' && message.isDone && (message.followUpSuggestions || []).length > 0 && (
                    <div className="mt-4">
                      <FollowUpSuggestions suggestions={message.followUpSuggestions || []} onSelect={handleSend} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Input Box - Pure white, No Borders */}
      <div className="flex-shrink-0 bg-white p-6 sm:px-8">
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
                placeholder={busy ? 'Đang xử lý...' : (hasUserAsked ? 'Tiếp tục phân tích...' : 'Nhập câu hỏi để phân tích')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit();
                }}
                className="w-full border-none bg-transparent text-[16px] text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={submit}
                disabled={busy || input.trim() === ''}
                className={[
                  'ml-4 rounded-full px-5 py-2 text-[13px] font-semibold shadow-sm transition-all',
                  busy || input.trim() === ''
                    ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                    : 'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950',
                ].join(' ')}
              >
                Gửi
              </button>
            </div>
            {inputError && (
              <div className="mt-2 text-left text-[12px] font-semibold text-rose-500">
                {inputError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
