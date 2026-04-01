'use client';

import React, { useEffect, useRef, useState } from "react";

import Sidebar from "@/components/sidebar/Sidebar";
import { ChatHeader, ChatInput, MessageBubble } from "@/components/chat";
import { Message, UI_STRINGS } from "@/types/types";

/**
 * ChatPage — Trang chính của ứng dụng
 * Gồm: Sidebar + Header + Vùng chat (Welcome hoặc Messages) + Input + Footer
 */
export default function ChatPage() {
    // 1. State - Khai báo các biến chứa thông tin
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState('');
    const messageEndRef = useRef<HTMLDivElement>(null);

    // 2. Tạo sessionId
    useEffect(() => {
        let id = localStorage.getItem('sessionId');
        if (!id) {
            id = Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('sessionId', id);
        }
        setSessionId(id);
    }, []);

    // 3. Auto-scroll - Tự động kéo xuống khi có tin nhắn mới
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // 3. Cập nhật message theo từng SSE event
    const updateMessage = (msgId: string, event: string, payload: Record<string, unknown>) => {
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id !== msgId) return m;
                switch (event) {
                    case 'status':
                        return { ...m, statusText: payload.text as string };
                    case 'thinking':
                        setIsTyping(false);
                        return { ...m, statusText: undefined, thinking: payload.thinking as string };
                    case 'sql':
                        return { ...m, sql: payload.sql as string, tokenUsage: payload.token_usage as Message['tokenUsage'] };
                    case 'data':
                        return { ...m, columns: payload.columns as string[], rows: payload.rows as string[][] };
                    case 'reply':
                        return {
                            ...m,
                            content: (payload.reply as string) || '',
                            chartConfig: payload.chart_config as Message['chartConfig'],
                            blocks: payload.blocks as Message['blocks'],
                            replyTokenUsage: payload.reply_token_usage as Message['replyTokenUsage'],
                        };
                    case 'error':
                        return { ...m, content: `Lỗi: ${payload.error}` };
                    default:
                        return m;
                }
            })
        );
    };

    // 4. Xử lý gửi tin nhắn
    const handleSend = async () => {
        if (inputValue.trim() === '')
            return;

        // 3.1. Tạo tin nhắn user
        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
        };
        setMessages((prev) => [...prev, newUserMsg]);
        setInputValue('');
        setIsTyping(true);

        // 3.2. Gọi Backend SSE → stream từng phần
        const aiMsgId = (Date.now() + 1).toString();
        const emptyAiMsg: Message = { id: aiMsgId, role: 'assistant', content: '' };
        setMessages((prev) => [...prev, emptyAiMsg]);

        try {
            const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
            if (!API_URL) {
                throw new Error('NEXT_PUBLIC_API_URL is empty');
            }

            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: inputValue, sessionId }),
            });

            if (!res.ok) {
                const bodyText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${bodyText || res.statusText}`);
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) throw new Error('No stream');

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let currentEvent = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        currentEvent = line.slice(7);
                    } else if (line.startsWith('data: ') && currentEvent) {
                        const payload = JSON.parse(line.slice(6));
                        updateMessage(aiMsgId, currentEvent, payload);
                        currentEvent = '';
                    }
                }
            }
            setIsTyping(false);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === aiMsgId
                        ? { ...m, content: `Lỗi kết nối API: ${errMsg}` }
                        : m
                )
            );
            setIsTyping(false);
        }
    };

    const hasMessages = messages.length > 0;

    // ===== GIAO DIỆN =====
    return (
      <div className="flex h-screen bg-white font-sans text-slate-900 overflow-hidden">
        {/* 1. Sidebar — Thanh điều hướng bên trái */}
        <Sidebar />

        <main className="flex-1 flex flex-col bg-white min-w-0">
          {/* 2. Header — Tên app + trạng thái */}
          <ChatHeader />

          {/* 3. Vùng nội dung chính */}
          <div className="flex-1 flex flex-col min-h-0">

            {hasMessages ? (
              <>
                {/* 3a. Danh sách tin nhắn (cuộn được) */}
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-[48rem] mx-auto w-full space-y-6 py-6 px-6">
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} message={msg} />
                    ))}
                    {isTyping && (() => {
                      const lastMsg = messages[messages.length - 1];
                      const statusText = lastMsg?.statusText;
                      return (
                        <div className="flex items-center gap-2.5 text-sm text-slate-500">
                          <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          <span className="animate-pulse">{statusText || UI_STRINGS.LOADING_TEXT}</span>
                        </div>
                      );
                    })()}
                    <div ref={messageEndRef} />
                  </div>
                </div>

                {/* 3b. Ô nhập — dưới cùng khi đang chat */}
                <div className="flex-shrink-0 px-6 pb-2 pt-2">
                  <ChatInput value={inputValue} onChange={setInputValue} onSend={handleSend} />
                </div>
              </>
            ) : (
              /* 3c. Màn hình chào mừng — chưa có tin nhắn */
              <div className="flex-1 flex flex-col items-center justify-center px-6 pb-[20vh]">
                <h1 className="text-3xl font-semibold text-slate-800 mb-8">
                  {UI_STRINGS.WELCOME_TITLE}
                </h1>
                <ChatInput value={inputValue} onChange={setInputValue} onSend={handleSend} />
              </div>
            )}

            {/* 4. Footer */}
            <p className="pb-3 text-[11px] text-center text-slate-400 flex-shrink-0">
              {UI_STRINGS.FOOTER_NOTE}
            </p>
          </div>
        </main>
      </div>
    );
}
