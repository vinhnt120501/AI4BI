'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UI_STRINGS, LAYOUT } from '@/types/types';

// ===== ICONS (SVG) =====
const PanelIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <line x1="9" x2="9" y1="3" y2="21" />
  </svg>
);

const NewChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const SearchIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ChatIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const menuItems = [
  { icon: NewChatIcon, label: UI_STRINGS.MENU_NEW_CHAT },
  { icon: SearchIcon, label: UI_STRINGS.MENU_SEARCH },
  { icon: ChatIcon, label: UI_STRINGS.MENU_CHAT },
];

/**
 * Sidebar — thu gọn chỉ hiện icon, mở rộng hiện icon + text
 */
export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const collapsedW = LAYOUT.SIDEBAR_COLLAPSED_WIDTH;
  const expandedW = LAYOUT.SIDEBAR_EXPANDED_WIDTH;

  return (
    <motion.aside
      initial={{ width: collapsedW }}
      animate={{ width: isCollapsed ? collapsedW : expandedW }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="bg-white border-r border-slate-200 flex flex-col h-full shrink-0 overflow-hidden"
    >
      <div
        className="flex flex-col h-full pt-2 pb-3"
        style={{ width: isCollapsed ? collapsedW : expandedW }}
      >
        {/* Header: Logo + nút toggle */}
        <div className="flex items-center px-2 mb-1 h-11">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-800 transition-colors shrink-0"
            title={isCollapsed ? UI_STRINGS.SIDEBAR_OPEN : undefined}
          >
            <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold text-[9px]">
              AI
            </div>
          </button>

          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-between flex-1 min-w-0 ml-1"
              >
                <span className="font-semibold text-slate-800 text-sm whitespace-nowrap">
                  {UI_STRINGS.APP_NAME}
                </span>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors shrink-0"
                  title={UI_STRINGS.SIDEBAR_CLOSE}
                >
                  <PanelIcon />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Menu điều hướng */}
        <nav className="flex-1 px-2 space-y-0.5 mt-1">
          {menuItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center w-full rounded-xl transition-colors text-slate-600 hover:bg-slate-100 px-3 py-3"
              title={isCollapsed ? item.label : undefined}
            >
              <span className="shrink-0 w-6 flex items-center justify-center">
                <item.icon />
              </span>
              {!isCollapsed && (
                <span className="ml-3 text-sm font-medium whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </motion.aside>
  );
}
