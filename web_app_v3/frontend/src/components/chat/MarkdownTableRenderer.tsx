'use client';

import React, { useEffect } from 'react';

/**
 * AI-FIRST: Markdown tables are for narrative/supplemental content ONLY.
 * Color/styling/analysis comes from LLM-defined table blocks in VIS_CONFIG.
 * 
 * This renderer simply makes markdown tables readable with basic styling.
 * No hard-coded color logic - that's LLM's job.
 */

function enhanceMarkdownTables(container: HTMLDivElement | null) {
  if (!container) return;

  const tables = container.querySelectorAll('table');
  tables.forEach((table) => {
    // Basic styling - no color logic
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginTop = '1rem';
    table.style.marginBottom = '1rem';

    // Header styling
    const headerRow = table.querySelector('thead tr');
    if (headerRow) {
      headerRow.setAttribute('class', 'bg-slate-100');
      const ths = headerRow.querySelectorAll('th');
      ths.forEach((th) => {
        th.setAttribute('class', 'px-4 py-3 text-left font-bold text-slate-800 border border-slate-200 whitespace-nowrap text-sm bg-slate-50');
      });
    }

    // Body styling - alternating rows, no color logic
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach((row, rowIdx) => {
      row.setAttribute('class', `border-b border-slate-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'} hover:bg-slate-100 transition-colors`);
      
      const cells = row.querySelectorAll('td');
      cells.forEach((cell) => {
        cell.setAttribute('class', 'px-4 py-2.5 border border-slate-200 font-medium text-sm text-slate-700');
      });
    });
  });
}

interface MarkdownTableWrapperProps {
  children: React.ReactNode;
}

export function MarkdownTableWrapper({ children }: MarkdownTableWrapperProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    enhanceMarkdownTables(containerRef.current);
  }, [children]);

  return <div ref={containerRef}>{children}</div>;
}

