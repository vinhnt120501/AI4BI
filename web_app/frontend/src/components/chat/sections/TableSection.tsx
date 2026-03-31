'use client';

import React from 'react';
import CollapsibleBox from '../shared/CollapsibleBox';

export default function TableSection({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const badge = rows.length > 0 ? `${rows.length.toLocaleString()} dong` : 'Khong co ket qua';
  return (
    <CollapsibleBox title="Du lieu chi tiet" badge={badge} defaultOpen={false}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-2">Truy van SQL khong tra ve ket qua nao.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                {columns.map((col, i) => (
                  <th key={i} className="px-4 py-2.5 text-left font-medium text-slate-600 whitespace-nowrap border-b border-slate-200">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2 text-slate-700 whitespace-nowrap border-b border-slate-100">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CollapsibleBox>
  );
}
