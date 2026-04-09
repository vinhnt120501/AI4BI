'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Edit3, Plus } from 'lucide-react';
import AnalysisPage from '@/components/workspace/pages/AnalysisPage';
import type { AnalysisTarget } from '@/components/workspace/types';
import { FeedRail } from '@/components/sidebar';
import TopBar from '@/components/workspace/layout/TopBar';
import type { Message } from '@/types/types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\/$/, '');
const DIRECT_BACKEND_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8333').replace(/\/$/, '');
const USER_ID = 'default_user';

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
}

function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    API_BASE.startsWith('/')
  ) {
    return `${DIRECT_BACKEND_BASE}${normalizedPath}`;
  }

  return `${API_BASE}${normalizedPath}`;
}

function buildEventDetail(eventType: string, data: any) {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' ? data : '';
  }

  switch (eventType) {
    case 'debug_payload':
      return 'Đã chuẩn bị ngữ cảnh, chỉ dẫn và prompt cho mô hình.';
    case 'status':
      return typeof data.text === 'string' ? data.text.trim() : 'Đang xử lý yêu cầu.';
    case 'thinking':
      return 'Đã phân tích yêu cầu và xác định hướng truy vấn.';
    case 'sql':
      return 'Đã tạo câu lệnh SQL để lấy dữ liệu.';
    case 'data': {
      const cols = Array.isArray(data.columns) ? data.columns.length : 0;
      const rows = Array.isArray(data.rows) ? data.rows.length : 0;
      return `Đã nhận ${rows} dòng dữ liệu với ${cols} cột.`;
    }
    case 'additional_data':
      return typeof data.reason === 'string' && data.reason.trim()
        ? `Đang truy vấn bổ sung: ${data.reason.trim()}`
        : 'Đã truy vấn thêm dữ liệu để làm rõ kết quả.';
    case 'reply': {
      const blockCount = Array.isArray(data.blocks) ? data.blocks.length : 0;
      return blockCount > 0
        ? `Đã tạo phản hồi cùng ${blockCount} khối hiển thị.`
        : 'Đã tạo nội dung phản hồi.';
    }
    case 'suggestions': {
      const questionCount = Array.isArray(data.questions) ? data.questions.length : 0;
      return questionCount > 0
        ? `Đã tạo ${questionCount} câu hỏi gợi ý tiếp theo.`
        : 'Đã tạo các gợi ý tiếp theo.';
    }
    case 'timing': {
      const totalMs = data?.timings_ms?.total;
      if (typeof totalMs === 'number') {
        return `Tổng thời gian xử lý ${totalMs.toFixed(1)} ms.`;
      }
      return 'Đã thống kê thời gian xử lý.';
    }
    case 'done':
      return 'Đã hoàn tất toàn bộ quy trình xử lý.';
    case 'error':
      return typeof data.error === 'string' && data.error.trim()
        ? data.error.trim()
        : 'Có lỗi xảy ra trong quá trình xử lý.';
    default:
      break;
  }

  return 'Đã nhận thêm thông tin từ hệ thống.';
}

function findSseBoundary(buffer: string) {
  const match = /\r?\n\r?\n/.exec(buffer);
  if (!match || match.index === undefined) {
    return null;
  }

  return {
    index: match.index,
    length: match[0].length,
  };
}

function InstructionToggleIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3.5" y="6" width="17" height="12" rx="2.2" />
      <path d="M10.75 6v12" />
      {open ? <rect x="10.75" y="6" width="9.75" height="12" rx="2.2" fill="currentColor" opacity="0.10" stroke="none" /> : null}
    </svg>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [analysisSessionId, setAnalysisSessionId] = useState(createSessionId());
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [queuedPrompt, setQueuedPrompt] = useState<AnalysisTarget | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [activeSignalId, setActiveSignalId] = useState<number | null>(null);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [instructionText, setInstructionText] = useState('');
  const [tempText, setTempText] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_TOKENS = 2500;
  const tokenCount = tempText.trim() === '' ? 0 : Math.ceil(tempText.length / 4);
  const actualTokenCount = instructionText.trim() === '' ? 0 : Math.ceil(instructionText.length / 4);

  const handleSave = useCallback(() => {
    setInstructionText(tempText);
    setIsModalOpen(false);
  }, [tempText]);

  const handleCancel = useCallback(() => {
    setTempText(instructionText);
    setIsModalOpen(false);
  }, [instructionText]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const picked = Array.from(event.target.files);
    event.target.value = '';

    try {
      const filePayload = await Promise.all(
        picked.map(async (file) => ({
          name: file.name,
          content: await file.text(),
        })),
      );

      const response = await fetch(buildApiUrl('/files/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: USER_ID,
          sessionId: analysisSessionId,
          files: filePayload,
        }),
      });

      if (!response.ok) {
        throw new Error(`File ingest failed: ${response.status}`);
      }

      const newFileNames = picked.map((file) => file.name);
      setFiles((prev) => {
        const next = [...prev];
        newFileNames.forEach((name) => {
          if (!next.includes(name)) next.push(name);
        });
        return next;
      });
    } catch (error) {
      console.error('[files] ingest error:', error);
    }
  }, [analysisSessionId]);

  const openModal = useCallback(() => {
    setTempText(instructionText);
    setIsModalOpen(true);
  }, [instructionText]);

  useEffect(() => {
    const savedInstruction = localStorage.getItem('ai4bi_instruction');
    if (savedInstruction) {
      setInstructionText(savedInstruction);
      setTempText(savedInstruction);
    }

    const savedFiles = localStorage.getItem('ai4bi_files');
    if (savedFiles) {
      try {
        setFiles(JSON.parse(savedFiles));
      } catch {
        setFiles([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('ai4bi_instruction', instructionText);
  }, [instructionText]);

  useEffect(() => {
    localStorage.setItem('ai4bi_files', JSON.stringify(files));
  }, [files]);

  const updateAssistantMessage = useCallback((assistantId: string, updater: (message: Message) => Message) => {
    setMessages((current) => current.map((message) => (message.id === assistantId ? updater(message) : message)));
  }, []);

  const applySseChunk = useCallback((assistantId: string, rawChunk: string) => {
    const chunk = rawChunk.trim();
    if (!chunk) return;

    let eventType = '';
    const dataLines: string[] = [];
    chunk.split(/\r?\n/).forEach((line) => {
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    });

    if (!eventType || dataLines.length === 0) return;

    let data: any;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }

    const shouldTrackEvent = !['reply_chunk'].includes(eventType);
    const appendEvent = (message: Message) => {
      if (!shouldTrackEvent) return message;
      const timeline = message.eventTimeline || [];
      const last = timeline[timeline.length - 1];
      const detail = buildEventDetail(eventType, data);
      const nextEvent = {
        event: eventType,
        detail,
        atMs: typeof message.startedAt === 'number' ? Date.now() - message.startedAt : undefined,
      };
      if (last && last.event === nextEvent.event && last.detail === nextEvent.detail) {
        return message;
      }
      return {
        ...message,
        eventTimeline: [...timeline, nextEvent],
      };
    };

    if (eventType === 'debug_payload') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        llmDebugPayloads: [
          ...(message.llmDebugPayloads || []),
          {
            stage: data.stage || '',
            model: data.model,
            systemPrompt: data.system_prompt || data.systemPrompt,
            userContent: data.user_content || data.userContent,
            memoryContext: data.memory_context || data.memoryContext,
            schemaChars: data.schema_chars || data.schemaChars,
          },
        ],
      }));
      return;
    }

    if (eventType === 'status') {
      const text = data.text || '';
      updateAssistantMessage(assistantId, (message) => {
        const withEvent = appendEvent(message);
        const prev = message.statusHistory || [];
        const last = prev[prev.length - 1];
        return {
          ...withEvent,
          currentStep: data.step || 0,
          statusText: text,
          statusHistory: text && text !== last ? [...prev, text] : prev,
        };
      });
      return;
    }

    if (eventType === 'thinking') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        thinking: data.thinking || '',
      }));
      return;
    }

    if (eventType === 'sql') {
      const rawAttempts = Array.isArray(data.sql_attempts) ? data.sql_attempts : [];
      const sqlQueries = rawAttempts
        .map((sql: unknown, index: number) => {
          const text = typeof sql === 'string' ? sql.trim() : '';
          if (!text) return null;
          return { sql: text, source: 'primary' as const, attempt: index + 1 };
        })
        .filter(Boolean);

      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        sql: data.sql || '',
        sqlQueries: sqlQueries.length > 0
          ? sqlQueries
          : (data.sql ? [{ sql: data.sql, source: 'primary' as const, attempt: 1 }] : message.sqlQueries),
        tokenUsage: data.token_usage || message.tokenUsage,
      }));
      return;
    }

    if (eventType === 'additional_data') {
      const sqlText = typeof data.sql === 'string' ? data.sql.trim() : '';
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        sqlQueries: sqlText
          ? [
              ...(message.sqlQueries || []),
              {
                sql: sqlText,
                source: 'agentic' as const,
                reason: typeof data.reason === 'string' ? data.reason : '',
                step: typeof data.step === 'number' ? data.step : undefined,
              },
            ]
          : (message.sqlQueries || []),
      }));
      return;
    }

    if (eventType === 'data') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        columns: data.columns || [],
        rows: data.rows || [],
      }));
      return;
    }

    if (eventType === 'reply_chunk') {
      updateAssistantMessage(assistantId, (message) => {
        const incoming = String(data.text || '');
        const current = message.content || '';
        let nextContent = current;

        if (!current) {
          nextContent = incoming;
        } else if (incoming === current || current.endsWith(incoming)) {
          nextContent = current;
        } else if (incoming.length > current.length && incoming.includes(current)) {
          nextContent = incoming;
        } else {
          nextContent = `${current}${incoming}`;
        }

        return {
          ...message,
          content: nextContent,
        };
      });
      return;
    }

    if (eventType === 'reply') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        content: data.reply || message.content,
        blocks: data.blocks || [],
        chartConfig: data.chart_config || undefined,
        replyTokenUsage: data.reply_token_usage || undefined,
      }));
      return;
    }

    if (eventType === 'suggestions') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        followUpSuggestions: data.questions || [],
      }));
      return;
    }

    if (eventType === 'done') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        isDone: true,
      }));
      return;
    }

    if (eventType === 'error') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        isDone: true,
        statusText: 'Lỗi kết nối',
        content: message.content || 'Không thể kết nối server.',
      }));
    }
  }, [updateAssistantMessage]);

  const sendChatMessage = useCallback(async (prompt: string, sessionId: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      startedAt: Date.now(),
      sqlQueries: [],
      currentStep: 0,
      statusText: '',
      statusHistory: [],
      isDone: false,
      llmDebugPayloads: [],
      followUpSuggestions: [],
      eventTimeline: [],
    };

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setAnalysisBusy(true);
    setAnalysisQuery(trimmed);

    try {
      const instruction = typeof window !== 'undefined' ? (localStorage.getItem('ai4bi_instruction') || '') : '';
      let response: Response | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(buildApiUrl('/chat'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message: trimmed,
            sessionId,
            userId: USER_ID,
            instruction,
          }),
        });

        if (response.ok && response.body) break;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!response || !response.ok || !response.body) {
        throw new Error(`Chat request failed: ${response?.status || 'no response'}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = findSseBoundary(buffer);
        while (boundary) {
          const rawChunk = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary.length);
          applySseChunk(assistantId, rawChunk);
          boundary = findSseBoundary(buffer);
        }
      }

      if (buffer.trim()) {
        applySseChunk(assistantId, buffer);
      }
    } catch (error) {
      console.error('[chat] SSE error:', error);
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        isDone: true,
        statusText: 'Lỗi kết nối',
        content: message.content || `Lỗi: ${error instanceof Error ? error.message : 'Không thể kết nối server.'}`,
      }));
    } finally {
      setAnalysisBusy(false);
    }
  }, [applySseChunk, updateAssistantMessage]);

  useEffect(() => {
    if (!queuedPrompt?.prompt || !queuedPrompt.sessionId) return;
    void sendChatMessage(queuedPrompt.prompt, queuedPrompt.sessionId);
    setQueuedPrompt(null);
  }, [queuedPrompt, sendChatMessage]);

  const openNewAnalysis = useCallback((prompt: string) => {
    const nextSessionId = createSessionId();
    setAnalysisSessionId(nextSessionId);
    setAnalysisQuery(prompt);
    setMessages([]);
    setQueuedPrompt({ prompt, sessionId: nextSessionId });
  }, []);

  const sendInCurrentAnalysis = useCallback((prompt: string) => {
    if (analysisBusy) return;
    if (!analysisSessionId) {
      openNewAnalysis(prompt);
      return;
    }

    void sendChatMessage(prompt, analysisSessionId);
  }, [analysisBusy, analysisSessionId, openNewAnalysis, sendChatMessage]);

  return (
    <div className="flex h-screen min-h-screen bg-[var(--color-background-tertiary)] text-slate-900" style={{ fontFamily: 'var(--font-sans)' }}>
      <input
        type="file"
        multiple
        accept=".txt,.md"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="p-8">
              <h2 className="mb-2 text-[22px] font-semibold text-slate-900">Set project instructions</h2>
              <p className="mb-6 text-[13px] leading-relaxed text-slate-500">
                Provide AI4BI with relevant instructions and information for chats.
              </p>
              <div className={`relative overflow-hidden rounded-xl border-2 ${tokenCount > MAX_TOKENS ? 'border-red-400' : 'border-slate-200 focus-within:border-black'}`}>
                <textarea
                  className="h-[500px] w-full resize-none bg-white p-4 font-mono text-[14px] leading-relaxed text-slate-700 focus:outline-none"
                  placeholder="# Custom Instructions..."
                  value={tempText}
                  onChange={(event) => setTempText(event.target.value)}
                  autoFocus
                />
                <div className={`absolute bottom-3 right-4 rounded border px-2 py-1 text-[11px] font-medium ${tokenCount > MAX_TOKENS ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
                  {tokenCount} / {MAX_TOKENS} tokens
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-8 py-4">
              <button onClick={handleCancel} className="rounded-lg px-5 py-2 text-[14px] font-medium text-slate-600 transition-all hover:bg-slate-200/50">
                Cancel
              </button>
              <button onClick={handleSave} className="rounded-lg bg-[#8e8e8e] px-5 py-2 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-slate-700">
                Save instructions
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FeedRail
        activeId={activeSignalId}
        onSelect={(item) => {
          setActiveSignalId(item.id);
          openNewAnalysis(item.title);
        }}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <AnalysisPage
            busy={analysisBusy}
            messages={messages}
            query={analysisQuery}
            onSend={sendInCurrentAnalysis}
            instructionPanelOpen={isRightPanelOpen}
          />
        </div>

        <div
          className={[
            'relative shrink-0 overflow-hidden border-l border-[color:var(--color-border-tertiary)] bg-white transition-all duration-300 ease-in-out',
            isRightPanelOpen ? 'w-[320px] 2xl:w-[350px]' : 'w-[56px]',
          ].join(' ')}
        >
          <div className="flex h-full flex-col">
            <div
              className={[
                'flex items-center',
                isRightPanelOpen ? 'justify-between px-5 py-4' : 'justify-center px-2 py-4',
              ].join(' ')}
            >
              {isRightPanelOpen ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsRightPanelOpen((prev) => !prev)}
                      className="cursor-pointer p-1 text-slate-900 transition-colors hover:text-slate-900"
                      title="Toggle Instructions Panel"
                      aria-label="Thu gọn Instructions"
                    >
                      <InstructionToggleIcon open={isRightPanelOpen} />
                    </button>
                    <h3 className="text-[15px] font-semibold text-slate-900">Instructions</h3>
                    {actualTokenCount > MAX_TOKENS ? (
                      <span className="animate-pulse rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                        Limit exceeded
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {instructionText ? (
                      <button onClick={openModal} className="rounded p-1 text-slate-400 transition-all hover:text-slate-600" title="Edit">
                        <Edit3 size={15} />
                      </button>
                    ) : null}
                    <button onClick={openModal} className="rounded p-1 text-slate-400 transition-all hover:text-slate-600" title="Add">
                      <Plus size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => setIsRightPanelOpen(true)}
                  className="cursor-pointer p-2 text-slate-900 transition-colors hover:text-slate-900"
                  title="Open Instructions Panel"
                  aria-label="Mở Instructions"
                >
                  <InstructionToggleIcon open={isRightPanelOpen} />
                </button>
              )}
            </div>

            <div className={isRightPanelOpen ? 'flex-1 overflow-y-auto p-6' : 'hidden'}>
              <div className="mb-12">
                {instructionText ? (
                  <div className={`max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border p-3 text-[13px] leading-relaxed ${
                    actualTokenCount > MAX_TOKENS ? 'border-red-100 bg-red-50/30 text-red-700' : 'border-slate-100 bg-slate-50/80 text-slate-600'
                  }`}>
                    {instructionText}
                  </div>
                ) : (
                  <p className="text-[13px] leading-relaxed text-slate-400/80">
                    Add instructions to tailor AI4BI&apos;s responses
                  </p>
                )}

                {instructionText ? (
                  <div className={`mt-2 text-[11px] font-medium ${actualTokenCount > MAX_TOKENS ? 'text-red-500' : 'text-slate-400'}`}>
                    {actualTokenCount} / {MAX_TOKENS} tokens
                  </div>
                ) : null}
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-900">Files</h3>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded p-1 text-slate-400 transition-all hover:text-slate-600"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {files.length > 0 ? (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div key={`${file}-${index}`} className="group flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2">
                        <span className="mr-2 truncate text-[13px] text-slate-600">{file}</span>
                        <button
                          onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))}
                          className="rotate-45 text-slate-300 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer rounded-[18px] border border-slate-100/70 bg-white p-6 text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-colors hover:border-slate-300"
                  >
                    <div className="relative mb-6 mt-2 h-16 w-16 pointer-events-none mx-auto">
                      <div className="absolute left-1/2 top-1/2 z-10 -ml-[28px] -mt-[26px] h-[52px] w-[44px] -rotate-6 rounded-lg border border-slate-200 bg-white opacity-70 shadow-sm" />
                      <div className="absolute left-1/2 top-1/2 -ml-[16px] -mt-[26px] h-[52px] w-[44px] rotate-[10deg] rounded-lg border border-slate-200 bg-white opacity-50 shadow-sm" />
                      <div className="absolute left-1/2 top-1/2 z-20 -ml-[22px] -mt-[26px] flex h-[52px] w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white pt-1 shadow-sm">
                        <Plus size={14} strokeWidth={2.5} className="relative top-[-4px] text-slate-300" />
                      </div>
                    </div>
                    <p className="px-4 text-[13px] leading-relaxed text-slate-400">
                      Add .txt or .md files to reference in this project.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
