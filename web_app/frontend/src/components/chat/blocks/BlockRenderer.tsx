'use client';

import React from 'react';
import { Block } from '@/types/types';
import ChartRenderer from '../ChartRenderer';
import StatCard from './StatCard';
import DetailCard from './DetailCard';
import Heading from './Heading';

interface BlockRendererProps {
  blocks: Block[];
  columns: string[];
  rows: string[][];
}

export default function BlockRenderer({ blocks, columns, rows }: BlockRendererProps) {
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'stat_cards':
            return <StatCard key={i} items={block.items} />;

          case 'chart':
            return (
              <ChartRenderer
                key={i}
                columns={columns}
                rows={rows}
                config={{
                  type: block.chartType,
                  xKey: block.xKey,
                  yKeys: block.yKeys,
                  yKey: block.yKey,
                }}
              />
            );

          case 'detail_cards':
            return <DetailCard key={i} items={block.items} />;

          case 'heading':
            return <Heading key={i} text={block.text} level={block.level} />;

          default:
            return null;
        }
      })}
    </div>
  );
}
