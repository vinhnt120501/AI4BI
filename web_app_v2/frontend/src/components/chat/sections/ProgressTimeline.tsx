'use client';

import React, { useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, CheckCircle2, Circle } from 'lucide-react';

interface ProgressTimelineProps {
  currentStep: number; // 1: SQL, 2: Execute, 3: Analysis
  statusText?: string;
}

export default function ProgressTimeline({ currentStep, statusText }: ProgressTimelineProps) {
  const [showDetails, setShowDetails] = useState(false);

  const steps = [
    { id: 1, label: 'Sinh truy vấn SQL' },
    { id: 2, label: 'Truy vấn cơ sở dữ liệu' },
    { id: 3, label: 'Phân tích & Vẽ biểu đồ' },
  ];

  if (currentStep === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-2 px-1">
      {/* ─── Gemini-style Thinking Chip ─── */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin transition-all duration-300" />
          <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping" />
        </div>
        
        <span className="text-sm font-medium text-slate-500 animate-pulse">
          {statusText || 'AI đang xử lý...'}
        </span>

        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-blue-500 transition-all uppercase tracking-wider ml-2"
        >
          {showDetails ? 'Ẩn quy trình' : 'Xem quy trình'}
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {/* ─── Expandable Details ─── */}
      {showDetails && (
        <div className="ml-7 flex flex-col gap-2 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
          {steps.map((step) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            
            return (
              <div key={step.id} className="flex items-center gap-3">
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-200" />
                )}
                
                <span className={`text-xs ${isDone ? 'text-slate-400' : isCurrent ? 'text-slate-700 font-semibold' : 'text-slate-300'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
