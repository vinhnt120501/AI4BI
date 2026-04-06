'use client';

import React from 'react';
import DynamicChart from '../DynamicChart';
import StatCard from './StatCard';
import { Block, ChartBlock } from '@/types/types';
import Heading from './Heading';
import AnalysisTable from './AnalysisTable';
import ProgressTimeline from '../sections/ProgressTimeline';

interface BlockRendererProps {
  blocks: Block[];
  columns: any[];
  rows: any[];
}

export default function BlockRenderer({ blocks, columns, rows }: BlockRendererProps) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'stat_cards':
            return (
              <div key={i}>
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
            return (
              <div key={i} className="px-1">
                <div className={`text-[14px] leading-relaxed ${textColor}`}>
                  <p dangerouslySetInnerHTML={{ __html: (block.content || '').replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-800">$1</strong>') }} />
                </div>
              </div>
            );
          }

          case 'heading':
            return (
              <div key={i} className={i > 0 ? 'pt-2' : ''}>
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
              // This is the first of a pair - render both in a grid
              const nextChartColumns = (nextBlock as any).columns || columns;
              const nextChartRows = (nextBlock as any).rows || rows;
              // Mark next block to skip (handled via CSS trick - we render it here)
              return (
                <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <ChartCard block={block} columns={chartColumns} rows={chartRows} />
                  <ChartCard block={nextBlock as ChartBlock} columns={nextChartColumns} rows={nextChartRows} />
                </div>
              );
            }

            if (isHalf && i > 0) {
              const prevBlock = blocks[i - 1];
              if (prevBlock?.type === 'chart' && (prevBlock as ChartBlock).size === 'half') {
                // This is the second of a pair - already rendered above
                return null;
              }
            }

            return (
              <div key={i}>
                <ChartCard block={block} columns={chartColumns} rows={chartRows} />
              </div>
            );
          }

          case 'table':
            return (
              <div key={i}>
                <AnalysisTable block={block} data={rows} />
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
    <div className="border border-slate-200/70 rounded-2xl bg-white shadow-sm overflow-hidden transition-all hover:shadow-md duration-300">
      {(block.title || block.purpose) && (
        <div className="px-6 pt-5 pb-1">
          {block.title && (
            <h3 className="text-[14px] font-bold text-slate-800 tracking-tight">{block.title}</h3>
          )}
          {block.purpose && (
            <p className="text-[12px] text-slate-400 mt-0.5 leading-relaxed">{block.purpose}</p>
          )}
        </div>
      )}
      <div className="px-3 pb-5 pt-2">
        <DynamicChart block={block} columns={columns} rows={rows} />
      </div>
    </div>
  );
}
