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

    // 3. Xử lý gửi tin nhắn
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

        // 3.2. Gọi Backend → Gemini → TiDB
        const aiMsgId = (Date.now() + 1).toString();
        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: inputValue, sessionId }),
            });
            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            const aiMsg: Message = {
                id: aiMsgId,
                role: 'assistant',
                content: data.reply || '',
                sql: data.sql,
                thinking: data.thinking,
                tokenUsage: data.token_usage,
                replyTokenUsage: data.reply_token_usage,
                columns: data.columns,
                rows: data.rows,
                chartConfig: data.chart_config,
            };
            setMessages((prev) => [...prev, aiMsg]);
            setIsTyping(false);
        } catch {
            const errorMsg: Message = {
                id: aiMsgId,
                role: 'assistant',
                content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.',
            };
            setMessages((prev) => [...prev, errorMsg]);
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
                    {isTyping && (
                      <div className="text-slate-400 text-sm animate-pulse">
                        {UI_STRINGS.LOADING_TEXT}
                      </div>
                    )}
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
