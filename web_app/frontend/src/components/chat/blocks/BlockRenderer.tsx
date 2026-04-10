'use client';

import React from 'react';
import { Block } from '@/types/types';
import DynamicChart from '../DynamicChart';
import StatCard from './StatCard';
import DetailCard from './DetailCard';
import Heading from './Heading';
import AnalysisTable from './AnalysisTable';

interface BlockRendererProps {
  blocks: Block[];
  columns: string[];
  rows: string[][];
}

export default function BlockRenderer({ blocks, columns, rows }: BlockRendererProps) {
  const tableData = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((col, i) => {
      if (i >= row.length) return;
      const val = row[i];
      const num = Number(val);
      obj[col] = isNaN(num) ? val : num;
    });
    return obj;
  });

  return (
    <div className="grid grid-cols-2 gap-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'stat_cards':
            return (
              <div key={i} className="col-span-2">
                <StatCard items={block.items} />
              </div>
            );

          case 'chart': {
            const isHalf = block.size === 'half';
            return (
              <div key={i} className={isHalf ? 'col-span-1' : 'col-span-2'}>
                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                  {(block.title || block.purpose) && (
                    <div className="px-5 pt-4 pb-2">
                      {block.title && (
                        <h3 className="text-sm font-semibold text-slate-700">{block.title}</h3>
                      )}
                      {block.purpose && (
                        <p className="text-xs text-slate-400 mt-0.5">{block.purpose}</p>
                      )}
                    </div>
                  )}
                  <div className="px-2 pb-3">
                    <DynamicChart block={block} columns={columns} rows={rows} />
                  </div>
                </div>
              </div>
            );
          }

          case 'detail_cards':
            return (
              <div key={i} className="col-span-2">
                <DetailCard items={block.items} />
              </div>
            );

          case 'heading':
            return (
              <div key={i} className="col-span-2">
                <Heading text={block.text} level={block.level} />
              </div>
            );

          case 'table':
            return (
              <div key={i} className="col-span-2">
                <AnalysisTable block={block} data={tableData} />
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
