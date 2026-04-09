'use client';

import React from 'react';
import CollapsibleBox from '../shared/CollapsibleBox';

export default function TableSection({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const badge = rows.length > 0 ? `${rows.length.toLocaleString()} dòng` : 'Không có kết quả';

  return (
    <CollapsibleBox title="Dữ liệu chi tiết" badge={badge} defaultOpen={false}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-2">Truy vấn SQL không trả về kết quả nào.</p>
      ) : (
        <div className="max-h-[400px] overflow-auto border border-slate-100 rounded-lg">
          <table className="w-full text-sm border-collapse table-auto">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50">
                {columns.map((col, i) => (
                  <th key={i} className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap border-b border-slate-200">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-blue-50/30 transition-colors even:bg-slate-50/20">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-[12px] text-slate-700 whitespace-nowrap">
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
