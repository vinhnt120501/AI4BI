'use client';

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DynamicChart from '../DynamicChart';
import StatCard from './StatCard';
import { Block, ChartBlock } from '@/types/types';
import Heading from './Heading';
import AnalysisTable from './AnalysisTable';
import ProgressTimeline from '../sections/ProgressTimeline';
import { formatAssistantText } from '../shared/formatAssistantText';

interface BlockRendererProps {
  blocks: Block[];
  columns: any[];
  rows: any[];
  /** When true, all blocks are revealed instantly (e.g. history view) */
  instant?: boolean;
}

const REVEAL_DELAY_MS = 350;

export default function BlockRenderer({ blocks, columns, rows, instant }: BlockRendererProps) {
  const [visibleCount, setVisibleCount] = useState(instant ? blocks.length : 0);

  useEffect(() => {
    if (instant) {
      setVisibleCount(blocks.length);
      return;
    }
    if (blocks.length === 0) {
      setVisibleCount(0);
      return;
    }

    // Reveal blocks one by one using setInterval — StrictMode-safe
    const id = setInterval(() => {
      setVisibleCount((prev) => {
        if (prev >= blocks.length) return prev;
        return prev + 1;
      });
    }, REVEAL_DELAY_MS);

    return () => clearInterval(id);
  }, [blocks.length, instant]);

  if (!blocks || blocks.length === 0) return null;

  const visibleBlocks = blocks.slice(0, visibleCount);

  return (
    <div className="space-y-5">
      {visibleBlocks.map((block, i) => {
        switch (block.type) {
          case 'stat_cards':
            return (
              <div key={i} className="animate-in fade-in slide-in-from-bottom-3 duration-400">
                <StatCard items={block.cards || block.items || []} />
              </div>
            );

          case 'text': {
            const colorMap: Record<string, string> = {
              blue: 'text-blue-700',
              green: 'text-emerald-700',
              slate: 'text-slate-600',
            };
            const textColor = colorMap[block.color || ''] || 'text-slate-600';
            const md = formatAssistantText(block.content || '');
            
            return (
              <div key={i} className="px-1 animate-in fade-in slide-in-from-bottom-3 duration-400">
                <div className={`markdown-output prose prose-slate max-w-none text-[14px] leading-relaxed ${textColor} prose-p:my-2 prose-li:my-1 prose-ol:my-2 prose-ul:my-2 prose-strong:text-slate-900 prose-a:text-blue-700`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Keep lists compact in dashboard blocks
                      ul: ({ children }) => <ul className="pl-5 list-disc">{children}</ul>,
                      ol: ({ children }) => <ol className="pl-5 list-decimal">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                      p: ({ children }) => <p>{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                    }}
                  >
                    {md}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }

          case 'heading':
            return (
              <div key={i} className={`${i > 0 ? 'pt-2' : ''} animate-in fade-in slide-in-from-bottom-3 duration-400`}>
                <Heading text={block.text} level={block.level} color={block.color} />
              </div>
            );

          case 'progress':
            return (
              <div key={i}>
                <ProgressTimeline currentStep={block.currentStep || 0} statusText={block.statusText} />
              </div>
            );

          case 'chart': {
            const isHalf = block.size === 'half';
            const chartColumns = (block as any).columns || columns;
            const chartRows = (block as any).rows || rows;

            // Check if next block is also a half chart - render them side by side
            const nextBlock = blocks[i + 1];
            const nextIsHalf = nextBlock?.type === 'chart' && (nextBlock as ChartBlock).size === 'half';

            if (isHalf && nextIsHalf) {
              const nextChartColumns = (nextBlock as any).columns || columns;
              const nextChartRows = (nextBlock as any).rows || rows;
              return (
                <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-3 duration-400">
                  <ChartCard block={block} columns={chartColumns} rows={chartRows} />
                  <ChartCard block={nextBlock as ChartBlock} columns={nextChartColumns} rows={nextChartRows} />
                </div>
              );
            }

            if (isHalf && i > 0) {
              const prevBlock = blocks[i - 1];
              if (prevBlock?.type === 'chart' && (prevBlock as ChartBlock).size === 'half') {
                return null;
              }
            }

            return (
              <div key={i} className="animate-in fade-in slide-in-from-bottom-3 duration-400">
                <ChartCard block={block} columns={chartColumns} rows={chartRows} />
              </div>
            );
          }

          case 'table':
            return (
              <div key={i} className="animate-in fade-in slide-in-from-bottom-3 duration-400">
                <div className="overflow-hidden bg-white border border-slate-200/60 rounded-2xl shadow-sm">
                  <AnalysisTable block={block} data={rows} />
                </div>
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

function ChartCard({ block, columns, rows }: { block: ChartBlock; columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-hidden bg-white border border-slate-200/60 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300">
      {(block.title || block.purpose) && (
        <div className="px-5 pb-3 pt-4 border-b border-slate-50">
          {block.title && (
            <h3 className="text-[15px] font-bold text-slate-900 tracking-tight">{block.title}</h3>
          )}
          {block.purpose && (
            <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{block.purpose}</p>
          )}
        </div>
      )}
      <div className="px-5 pb-5 pt-4">
        <DynamicChart block={block} columns={columns} rows={rows} />
      </div>
    </div>
  );
}
