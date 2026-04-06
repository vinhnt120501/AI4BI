'use client';

import React, { useEffect, useRef, useState } from "react";
import { Edit3, Plus, PanelRightClose, PanelRightOpen } from 'lucide-react';

import Sidebar from "@/components/sidebar/Sidebar";
import { ChatHeader, ChatInput, MessageBubble } from "@/components/chat";
import { Message, UI_STRINGS } from "@/types/types";

export default function ChatPage() {
    // 1. State - Khai báo các biến chứa thông tin
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [sessionId, setSessionId] = useState('');
    const messageEndRef = useRef<HTMLDivElement>(null);

    // --- State cho Instructions Panel ---
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [instructionText, setInstructionText] = useState("");
    const [tempText, setTempText] = useState("");
    const [files, setFiles] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const MAX_TOKENS = 2500;
    const tokenCount = tempText.trim() === "" ? 0 : Math.ceil(tempText.length / 4);
    const actualTokenCount = instructionText.trim() === "" ? 0 : Math.ceil(instructionText.length / 4);

    const handleSave = () => {
        setInstructionText(tempText);
        setIsModalOpen(false);
    };

    const handleCancel = () => {
        setTempText(instructionText);
        setIsModalOpen(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFileNames = Array.from(e.target.files).map(f => f.name);
            setFiles(prev => [...prev, ...newFileNames]);
        }
    };

    const openModal = () => {
        setTempText(instructionText);
        setIsModalOpen(true);
    };
    // ------------------------------------

    // 2. Tạo sessionId & Load persistence
    useEffect(() => {
        // Session ID
        let id = localStorage.getItem('sessionId');
        if (!id) {
            id = Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('sessionId', id);
        }
        setSessionId(id);

        // Load Instruction
        const saved = localStorage.getItem('ai4bi_instruction');
        if (saved) {
            setInstructionText(saved);
            setTempText(saved);
        }

        // Load Files (simulated)
        const savedFiles = localStorage.getItem('ai4bi_files');
        if (savedFiles) {
            setFiles(JSON.parse(savedFiles));
        }
    }, []);

    // Save persistence
    useEffect(() => {
        if (instructionText !== undefined) {
            localStorage.setItem('ai4bi_instruction', instructionText);
        }
    }, [instructionText]);

    useEffect(() => {
        localStorage.setItem('ai4bi_files', JSON.stringify(files));
    }, [files]);

    // 3. Auto-scroll - Tự động kéo xuống khi có tin nhắn mới
    useEffect(() => {
        messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Cập nhật message theo từng SSE event
    const updateMessage = (msgId: string, event: string, payload: Record<string, unknown>) => {
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id !== msgId) return m;
                switch (event) {
                    case 'status':
                        return { 
                            ...m, 
                            statusText: payload.text as string,
                            currentStep: payload.step as number 
                        };
                    case 'thinking':
                        setIsTyping(false);
                        return { ...m, thinking: payload.thinking as string };
                    case 'sql':
                        return { ...m, sql: payload.sql as string, tokenUsage: payload.token_usage as Message['tokenUsage'] };
                    case 'data':
                        return { 
                            ...m, 
                            columns: payload.columns as string[], 
                            rows: payload.rows as string[][],
                            currentStep: 2 // Đảm bảo trạng thái nhảy lên bước 2 khi có data
                        };
                    case 'reply_chunk':
                        return {
                            ...m,
                            content: (m.content || '') + (payload.text as string),
                            currentStep: 3
                        };
                    case 'reply':
                        return {
                            ...m,
                            content: (payload.reply as string) || m.content, // Ưu tiên final reply nếu có, ko thì giữ nguyên từ streaming
                            chartConfig: payload.chart_config as Message['chartConfig'],
                            blocks: payload.blocks as Message['blocks'],
                            replyTokenUsage: payload.reply_token_usage as Message['replyTokenUsage'],
                        };
                    case 'suggestions':
                        return { ...m, followUpSuggestions: payload.questions as string[] };
                    case 'done':
                        return { ...m, isDone: true };
                    case 'error':
                        return { ...m, content: `Lỗi: ${payload.error}`, isDone: true };
                    default:
                        return m;
                }
            })
        );
    };

    // 4. Xử lý gửi tin nhắn
    const handleSuggestionClick = (question: string) => {
        setInputValue(question);
        // Focus mới chặn: gửi trực tiếp để nhanh
        setTimeout(() => {
            if (question.trim() !== '') {
                setInputValue(question);
                setTimeout(() => handleSend(), 50);
            }
        }, 0);
    };

    const handleSend = async () => {
        if (inputValue.trim() === '')
            return;

        // 4.1. Tạo tin nhắn user
        const newUserMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue,
        };
        setMessages((prev) => [...prev, newUserMsg]);
        setInputValue('');
        setIsTyping(true);

        // 4.2. Gọi Backend SSE → stream từng phần
        const aiMsgId = (Date.now() + 1).toString();
        const emptyAiMsg: Message = { id: aiMsgId, role: 'assistant', content: '' };
        setMessages((prev) => [...prev, emptyAiMsg]);

        try {
            const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: inputValue, 
                    sessionId,
                    instruction: instructionText // TRUYỀN INSTRUCTION XUỐNG BACKEND TẠI ĐÂY
                }),
            });

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
                        try {
                            const payload = JSON.parse(line.slice(6));
                            updateMessage(aiMsgId, currentEvent, payload);
                        } catch { /* skip malformed JSON from chunked SSE */ }
                        currentEvent = '';
                    }
                }
            }
            setIsTyping(false);
        } catch {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === aiMsgId
                        ? { ...m, content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.' }
                        : m
                )
            );
            setIsTyping(false);
        }
    };

    const hasMessages = messages.length > 0;

    // ===== GIAO DIỆN =====
    return (
      <div className="flex h-screen bg-white font-sans text-slate-900 overflow-hidden relative">
        
        {/* Hidden File Input */}
        <input 
          type="file" 
          multiple 
          accept=".txt,.md"
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
        />

        {/* Modal: Set project instructions */}
        {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
                <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                    <div className="p-8">
                        <h2 className="text-[22px] font-semibold text-slate-900 mb-2">Set project instructions</h2>
                        <p className="text-[13px] text-slate-500 mb-6 leading-relaxed">
                            Provide Claude with relevant instructions and information for chats.
                        </p>
                        <div className={`relative border-2 rounded-xl overflow-hidden ${tokenCount > MAX_TOKENS ? 'border-red-400' : 'border-slate-200 focus-within:border-black'}`}>
                            <textarea
                                className="w-full h-[500px] p-4 text-[14px] text-slate-700 focus:outline-none resize-none bg-white font-mono leading-relaxed"
                                placeholder="# Custom Instructions..."
                                value={tempText}
                                onChange={(e) => setTempText(e.target.value)}
                                autoFocus
                            />
                            <div className={`absolute bottom-3 right-4 px-2 py-1 rounded text-[11px] font-medium border ${tokenCount > MAX_TOKENS ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                {tokenCount} / {MAX_TOKENS} tokens
                            </div>
                        </div>
                    </div>
                    <div className="bg-slate-50/50 px-8 py-4 flex justify-end gap-3 border-t border-slate-100">
                        <button 
                            onClick={handleCancel}
                            className="px-5 py-2 text-[14px] font-medium text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave}
                            className="px-5 py-2 text-[14px] font-medium bg-[#8e8e8e] text-white hover:bg-slate-700 rounded-lg shadow-sm transition-all"
                        >
                            Save instructions
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* 1. Sidebar — Thanh điều hướng bên trái (Commented out per user request) */}
        {/* <Sidebar /> */}

        <main className="flex-1 flex flex-col bg-white min-w-0 relative">
          
          {/* Header wrapper để móc thêm cái icon bật/tắt Right Panel bên cạnh phần ChatHeader nguyên thủy */}
          <div className="flex items-center justify-between pr-4 bg-white border-b border-slate-100 h-16">
            <div className="flex-1">
                <ChatHeader />
            </div>
            
            <button 
                onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
                className="hover:text-slate-600 text-slate-400 transition-colors p-1.5 rounded-full hover:bg-slate-50 shrink-0 z-10"
                title="Toggle Instructions Panel"
            >
                {isRightPanelOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
            </button>
          </div>

          {/* 3. Vùng nội dung chính */}
          <div className="flex-1 flex flex-col min-h-0">

            {hasMessages ? (
              <>
                {/* 3a. Danh sách tin nhắn (cuộn được) */}
                <div className="flex-1 overflow-y-auto">
                  <div className="max-w-[64rem] mx-auto w-full space-y-6 py-6 px-6">
                    {messages.map((msg, idx) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isLatestAssistant={msg.role === 'assistant' && idx === messages.length - 1}
                        onSuggestionClick={handleSuggestionClick}
                      />
                    ))}
                    {isTyping && (() => {
                      const lastMsg = messages[messages.length - 1];
                      const statusText = lastMsg?.statusText;
                      return (
                        <div className="flex items-center gap-2.5 text-sm text-slate-500 mt-4 mb-4">
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

        {/* Bảng điều khiển bên phải (Instructions Panel) - CLAUDE DESIGN */}
        <div 
            className={`transition-all duration-300 ease-in-out bg-white flex-shrink-0 overflow-hidden ${
                isRightPanelOpen ? 'w-[320px] 2xl:w-[350px] shadow-[-10px_0_15px_-3px_rgb(0_0_0_/_0.03)] border-l border-slate-100' : 'w-0 border-l-0 opacity-0'
            }`}
        >
            <div className="w-[320px] 2xl:w-[350px] p-6 flex flex-col h-full overflow-y-auto relative">
                {/* Section 1: Instructions */}
                <div className="mb-12">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-slate-900">Instructions</h3>
                            {actualTokenCount > MAX_TOKENS && (
                                <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded border border-red-100 font-medium animate-pulse">
                                    Limit exceeded
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {instructionText && (
                                <button onClick={openModal} className="p-1 text-slate-400 hover:text-slate-600 transition-all rounded" title="Edit">
                                    <Edit3 size={15} />
                                </button>
                            )}
                            <button onClick={openModal} className="p-1 text-slate-400 hover:text-slate-600 transition-all rounded" title="Add">
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>
                    {instructionText ? (
                        <div className={`rounded-xl p-3 border text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto ${
                            actualTokenCount > MAX_TOKENS ? 'bg-red-50/30 border-red-100 text-red-700' : 'bg-slate-50/80 border-slate-100 text-slate-600'
                        }`}>
                            {instructionText}
                        </div>
                    ) : (
                        <p className="text-[13px] text-slate-400/80 leading-relaxed">
                            Add instructions to tailor AI4BI's responses
                        </p>
                    )}
                    {instructionText && (
                        <div className={`mt-2 text-[11px] font-medium ${actualTokenCount > MAX_TOKENS ? 'text-red-500' : 'text-slate-400'}`}>
                            {actualTokenCount} / {MAX_TOKENS} tokens
                        </div>
                    )}
                </div>

                {/* Section 2: Files */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[15px] font-semibold text-slate-900">Files</h3>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-1 text-slate-400 hover:text-slate-600 transition-all rounded"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    
                    {files.length > 0 ? (
                        <div className="space-y-2">
                            {files.map((f, i) => (
                                <div key={i} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-lg group">
                                    <span className="text-[13px] text-slate-600 truncate mr-2">{f}</span>
                                    <button 
                                        onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                                        className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <Plus size={14} className="rotate-45" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="h-[180px] bg-white border border-slate-100/70 rounded-[18px] p-6 flex flex-col items-center justify-center text-center shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] cursor-pointer hover:border-slate-300 transition-colors group"
                        >
                            <div className="relative mb-6 w-16 h-16 pointer-events-none mt-2">
                                <div className="absolute w-[44px] h-[52px] bg-white border border-slate-200 rounded-lg shadow-sm left-1/2 top-1/2 -ml-[28px] -mt-[26px] -rotate-6 z-10 opacity-70 group-hover:scale-105 transition-transform" />
                                <div className="absolute w-[44px] h-[52px] bg-white border border-slate-200 rounded-lg shadow-sm left-1/2 top-1/2 -ml-[16px] -mt-[26px] rotate-[10deg] opacity-50 group-hover:scale-105 transition-transform" />
                                <div className="absolute w-[44px] h-[52px] border border-slate-200 rounded-lg shadow-sm left-1/2 top-1/2 -ml-[22px] -mt-[26px] z-20 bg-white flex items-center justify-center pt-1 group-hover:-translate-y-1 transition-transform">
                                    <div className="w-full flex justify-center mb-1">
                                       <Plus size={14} strokeWidth={2.5} className="text-slate-300 relative top-[-4px]" />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[13px] text-slate-400 leading-relaxed px-4">
                                Add .txt or .md files to reference in this project.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    );
}
