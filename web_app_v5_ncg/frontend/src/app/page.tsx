'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Edit3, Plus } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import settingIcon from './mcp/images/setting.png';
import sidebarLogo from '@/components/sidebar/images/sidebar.png';
import AnalysisPage from '@/components/workspace/pages/AnalysisPage';
import type { AnalysisTarget } from '@/components/workspace/types';
import { FeedRail } from '@/components/sidebar';
import TopBar from '@/components/workspace/layout/TopBar';
import type { Message } from '@/types/types';
import { buildApiUrl, buildStreamUrl, DEFAULT_USER_ID, fetchWithRetry } from '@/lib/api';

function createSessionId() {
  return globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
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

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [analysisSessionId, setAnalysisSessionId] = useState(createSessionId());
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [queuedPrompt, setQueuedPrompt] = useState<AnalysisTarget | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [activeSignalId, setActiveSignalId] = useState<number | null>(null);
  const [activeHistorySessionId, setActiveHistorySessionId] = useState<string | null>(null);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [instructionText, setInstructionText] = useState('');
  const [tempText, setTempText] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tokenCacheRef = useRef(new Map<string, number>());
  const [tempTokenCount, setTempTokenCount] = useState<number | null>(0);
  const [tempTokenBusy, setTempTokenBusy] = useState(false);
  const [instructionTokenCount, setInstructionTokenCount] = useState<number | null>(0);
  const [instructionTokenBusy, setInstructionTokenBusy] = useState(false);
  const [isMcpConfigured, setIsMcpConfigured] = useState(false);
  const [isMcpChecking, setIsMcpChecking] = useState(true);

  const checkMcpStatus = useCallback(async () => {
    try {
      const res = await fetch(buildApiUrl('/mcp/status'));
      const data = await res.json();
      setIsMcpConfigured(!!data?.configured);
    } catch {
      setIsMcpConfigured(false);
    } finally {
      setIsMcpChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkMcpStatus();
  }, [checkMcpStatus]);

  const fetchExactTokenCount = useCallback(async (text: string, signal?: AbortSignal) => {
    const trimmed = text ?? '';
    if (!trimmed) return 0;
    const cached = tokenCacheRef.current.get(trimmed);
    if (typeof cached === 'number') return cached;

    const res = await fetch(buildApiUrl('/tokens/count'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
      signal,
    });
    const data = await res.json().catch(() => null);
    const tokens = typeof data?.tokens === 'number' ? data.tokens : null;
    if (typeof tokens === 'number') {
      tokenCacheRef.current.set(trimmed, tokens);
      return tokens;
    }
    return null;
  }, []);


  useEffect(() => {
    const text = instructionText || '';
    if (!text.trim()) {
      setInstructionTokenCount(0);
      setInstructionTokenBusy(false);
      return;
    }

    const controller = new AbortController();
    const id = setTimeout(async () => {
      setInstructionTokenBusy(true);
      const tokens = await fetchExactTokenCount(text, controller.signal).catch(() => null);
      setInstructionTokenCount(typeof tokens === 'number' ? tokens : null);
      setInstructionTokenBusy(false);
    }, 650);

    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [instructionText, fetchExactTokenCount]);

  // Count tokens while editing in the modal (tempText) – debounced + cancellable.
  useEffect(() => {
    if (!isModalOpen) return;
    const text = tempText || '';
    if (!text.trim()) {
      setTempTokenCount(0);
      setTempTokenBusy(false);
      return;
    }

    const controller = new AbortController();
    const id = setTimeout(async () => {
      setTempTokenBusy(true);
      const tokens = await fetchExactTokenCount(text, controller.signal).catch(() => null);
      setTempTokenCount(typeof tokens === 'number' ? tokens : null);
      setTempTokenBusy(false);
    }, 650);

    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [tempText, isModalOpen, fetchExactTokenCount]);

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
    if (files.length >= 1) {
      event.target.value = '';
      return;
    }
    const picked = Array.from(event.target.files).slice(0, 1);
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
          userId: DEFAULT_USER_ID,
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
  }, [analysisSessionId, files]);

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
	      const step = (eventType === 'status' && typeof data?.step === 'number') ? data.step : undefined;
	      const nextEvent = {
	        event: eventType,
	        detail,
	        atMs: typeof message.startedAt === 'number' ? Date.now() - message.startedAt : undefined,
	        step,
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
      const stage = data.stage || 'unknown';
      const chunk = data.thinking || '';
      updateAssistantMessage(assistantId, (message) => {
        const byStage = { ...(message.thinkingByStage || {}) };
        byStage[stage] = (byStage[stage] || '') + chunk;
        return {
          ...appendEvent(message),
          thinking: (message.thinking || '') + chunk,
          thinkingByStage: byStage,
        };
      });
      return;
    }

    if (eventType === 'sql') {
      updateAssistantMessage(assistantId, (message) => ({
        ...appendEvent(message),
        sql: data.sql || '',
        tokenUsage: data.token_usage || message.tokenUsage,
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
        content: typeof data.reply === 'string' ? data.reply : message.content,
        blocks: Array.isArray(data.blocks) ? data.blocks : (message.blocks || []),
        chartConfig: data.chart_config ?? message.chartConfig,
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
      // Refresh landing suggestions in background after each chat
      fetch(buildApiUrl(`/landing-suggestions/refresh?userId=${encodeURIComponent(DEFAULT_USER_ID)}`), { method: 'POST' }).catch(() => {});
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
    setActiveHistorySessionId(null);

    try {
      const instruction = typeof window !== 'undefined' ? (localStorage.getItem('ai4bi_instruction') || '') : '';
      let response: Response | null = null;

      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          response = await fetch(buildStreamUrl('/chat'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({
              message: trimmed,
              sessionId,
              userId: DEFAULT_USER_ID,
              instruction,
            }),
          });
          if (response.ok && response.body) break;
        } catch (e) {
          if (attempt === 9) throw e;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * Math.pow(1.5, attempt), 10000)));
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
    setActiveSignalId(null);
    setActiveHistorySessionId(null);
  }, []);

  const openHistorySession = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    if (analysisBusy) return;
    setAnalysisBusy(true);
    setQueuedPrompt(null);

    try {
      const url = buildApiUrl(`/chat/history/session?userId=${encodeURIComponent(DEFAULT_USER_ID)}&sessionId=${encodeURIComponent(sessionId)}`);
      const data = await fetchWithRetry(url, 15000);
      const items = Array.isArray(data?.items) ? data.items : [];

      const loaded: Message[] = [];
      items.forEach((row: any, index: number) => {
        const id = String(row?.id ?? index);
        loaded.push({
          id: `history-user-${sessionId}-${id}`,
          role: 'user',
          content: String(row?.question || ''),
        });
        
        const mockTimeline = [
          { event: 'status', detail: 'Đang chuẩn bị ngữ cảnh và bộ nhớ...' },
          { event: 'debug_payload', detail: 'Đã chuẩn bị ngữ cảnh, chỉ dẫn và prompt cho mô hình.' },
          { event: 'status', detail: 'Đang phân tích câu hỏi và tạo truy vấn SQL...' }
        ];

        if (row?.thinking) {
          mockTimeline.push({ event: 'thinking', detail: 'Đã phân tích yêu cầu và xác định hướng truy vấn.' });
        }
        
        if (row?.sql) {
          mockTimeline.push({ event: 'sql', detail: 'Đã tạo câu lệnh SQL để lấy dữ liệu.' });
        }
        
        mockTimeline.push({ event: 'status', detail: 'Đã nhận dữ liệu từ database...' });
        
        if (row?.columns) {
          const colsCount = Array.isArray(row.columns) ? row.columns.length : 0;
          const rowsCount = Array.isArray(row.rows) ? row.rows.length : 0;
          mockTimeline.push({ event: 'data', detail: `Đã nhận ${rowsCount} dòng dữ liệu với ${colsCount} cột.` });
        }
        
        mockTimeline.push({ event: 'status', detail: 'Đang phân tích số liệu chuyên sâu...' });
        mockTimeline.push({ event: 'reply', detail: 'Đã tạo nội dung phản hồi.' });
        mockTimeline.push({ event: 'suggestions', detail: 'Đã tạo các gợi ý tiếp theo.' });
        mockTimeline.push({ event: 'done', detail: 'Đã hoàn tất toàn bộ quy trình xử lý.' });

        loaded.push({
          id: `history-assistant-${sessionId}-${id}`,
          role: 'assistant',
          content: String(row?.reply || ''),
          sql: String(row?.sql || ''),
          thinking: String(row?.thinking || ''),
          columns: Array.isArray(row?.columns) ? row.columns : [],
          rows: Array.isArray(row?.rows) ? row.rows : [],
          chartConfig: row?.chartConfig || undefined,
          blocks: Array.isArray(row?.blocks) ? row.blocks : [],
          tokenUsage: row?.tokenUsage || undefined,
          replyTokenUsage: row?.replyTokenUsage || undefined,
          followUpSuggestions: Array.isArray(row?.followUpSuggestions) ? row.followUpSuggestions : [],
          eventTimeline: mockTimeline as typeof loaded[0]['eventTimeline'],
          isDone: true,
        });
      });

      setAnalysisSessionId(sessionId);
      setAnalysisQuery('');
      setMessages(loaded);
      setActiveSignalId(null);
      setActiveHistorySessionId(sessionId);

      // Backfill follow-up suggestions for last assistant message if missing
      const lastAssistant = [...loaded].reverse().find((m) => m.role === 'assistant');
      const lastUser = [...loaded].reverse().find((m) => m.role === 'user');
      if (lastAssistant && (!lastAssistant.followUpSuggestions || lastAssistant.followUpSuggestions.length === 0) && lastUser) {
        try {
          const res = await fetch(buildApiUrl('/chat/generate-followup'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: lastUser.content, reply: lastAssistant.content }),
          });
          if (res.ok) {
            const result = await res.json();
            const questions = Array.isArray(result?.questions) ? result.questions : [];
            if (questions.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === lastAssistant.id ? { ...m, followUpSuggestions: questions } : m,
                ),
              );
            }
          }
        } catch {
          // non-critical
        }
      }
    } catch (error) {
      console.error('[history] open session error:', error);
    } finally {
      setAnalysisBusy(false);
    }
  }, [analysisBusy]);

  const sendInCurrentAnalysis = useCallback((prompt: string) => {
    if (analysisBusy) return;
    if (!analysisSessionId) {
      openNewAnalysis(prompt);
      return;
    }

    void sendChatMessage(prompt, analysisSessionId);
  }, [analysisBusy, analysisSessionId, openNewAnalysis, sendChatMessage]);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background-tertiary)] overflow-hidden" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Banner luôn hiển thị ở trên cùng */}
      <div className="w-full shrink-0 border-b border-slate-200 bg-white">
        <img 
          src="/banner.png" 
          alt="AI4BI Banner" 
          className="w-full h-auto object-cover block" 
        />
      </div>

      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden text-slate-900">
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
                <div className="relative overflow-hidden rounded-xl border-2 border-slate-200 focus-within:border-black">
                  <textarea
                    className="h-[500px] w-full resize-none bg-white p-4 font-mono text-[14px] leading-relaxed text-slate-700 focus:outline-none"
                    placeholder="# Custom Instructions..."
                    value={tempText}
                    onChange={(event) => setTempText(event.target.value)}
                    autoFocus
                  />
                  <div className="absolute bottom-3 right-4 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-400">
                    {tempTokenBusy
                      ? 'Đang đếm token…'
                      : (typeof tempTokenCount === 'number'
                        ? `${tempTokenCount.toLocaleString('vi-VN')} tokens`
                        : 'Không đếm được token')}
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
          isMcpConfigured={isMcpConfigured}
          activeId={activeSignalId}
          onSelect={(item) => {
            setActiveSignalId(item.id);
            setActiveHistorySessionId(null);
            openNewAnalysis(item.title);
          }}
          onSelectKpi={(kpiLabel) => {
            setActiveSignalId(null);
            setActiveHistorySessionId(null);
            openNewAnalysis(`Phân tích KPI ${kpiLabel} hôm nay`);
          }}
        />

        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden text-slate-900">
            <TopBar
              onHome={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
            />
            <AnalysisPage
              isMcpConfigured={isMcpConfigured}
              busy={analysisBusy}
              messages={messages}
              query={analysisQuery}
              onSend={sendInCurrentAnalysis}
              onSelectHistory={(sessionId) => void openHistorySession(sessionId)}
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
                        <Image
                          src={sidebarLogo}
                          alt="Sidebar logo"
                          width={26}
                          height={26}
                          className="opacity-90 hover:opacity-100"
                          priority
                        />
                      </button>
                      <h3 className="text-[15px] font-semibold text-slate-900">Instructions</h3>
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
                    type="button"
                    onClick={() => setIsRightPanelOpen(true)}
                    className="cursor-pointer p-2 text-slate-900 transition-colors hover:text-slate-900"
                    title="Open Instructions Panel"
                    aria-label="Mở Instructions"
                  >
                    <Image
                      src={sidebarLogo}
                      alt="Sidebar logo"
                      width={26}
                      height={26}
                      className="opacity-90 hover:opacity-100"
                      priority
                    />
                  </button>
                )}
              </div>

              <div className={isRightPanelOpen ? 'flex-1 overflow-y-auto p-6' : 'hidden'}>
                <div className="mb-12">
                  {instructionText ? (
                    <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[13px] leading-relaxed text-slate-600">
                      {instructionText}
                    </div>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-slate-400/80">
                      Add instructions to tailor AI4BI&apos;s responses
                    </p>
                  )}

                  {instructionText ? (
                    <div className="mt-2 text-[11px] font-medium text-slate-400">
                      {instructionTokenBusy
                        ? 'Đang đếm token…'
                        : (typeof instructionTokenCount === 'number'
                          ? `${instructionTokenCount.toLocaleString('vi-VN')} tokens`
                          : 'Không đếm được token')}
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-[15px] font-semibold text-slate-900">Files</h3>
                    {files.length === 0 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded p-1 text-slate-400 transition-all hover:text-slate-600"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>

                  {files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file, index) => (
                        <div key={`${file}-${index}`} className="group flex flex-col gap-1 py-1.5 animate-in fade-in duration-300">
                          <div className="flex items-center justify-between">
                            <span className="mr-2 truncate text-[13px] font-medium text-slate-700">{file}</span>
                            <button
                              onClick={() => setFiles([])}
                              className="rotate-45 text-slate-400 transition-all hover:text-rose-500"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                              <Check size={10} strokeWidth={3.5} />
                            </div>
                            <span className="text-[10px] font-bold tracking-tight text-emerald-600">Tải thành công</span>
                          </div>
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

              <div
                className={[
                  'mt-auto shrink-0 bg-white',
                  isRightPanelOpen ? 'px-5 py-3' : 'px-2 py-3',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => router.push('/mcp')}
                  className={[
                    'inline-flex cursor-pointer items-center justify-center rounded-xl',
                    isRightPanelOpen ? 'h-11 w-11' : 'h-11 w-full',
                  ].join(' ')}
                  title="MCP Connectors"
                  aria-label="Mở trang MCP Connectors"
                >
                  <Image
                    src={settingIcon}
                    alt="MCP settings"
                    width={26}
                    height={26}
                    className="opacity-90 hover:opacity-100"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
