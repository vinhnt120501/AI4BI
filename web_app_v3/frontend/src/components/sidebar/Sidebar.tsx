'use client';

import React from 'react';
import { BarChart3, Compass, LayoutDashboard } from 'lucide-react';
import type { PageKey } from '@/components/workspace/types';

interface SidebarProps {
  active: PageKey;
  onSelect: (page: PageKey) => void;
}

const navItems: Array<{
  id: PageKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { id: 'analysis', label: 'Phân tích', icon: BarChart3 },
  { id: 'explore', label: 'Khám phá', icon: Compass },
];

export default function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-slate-200 bg-white">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#19226D] text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">AI4BI</p>
            <p className="text-lg font-semibold text-slate-900">FPT BI</p>
          </div>
        </div>

        <nav className="flex-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={[
                  'mb-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-[#19226D]'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                ].join(' ')}
              >
                <Icon className="h-5 w-5" />
                <span className={isActive ? 'font-semibold' : 'font-medium'}>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
