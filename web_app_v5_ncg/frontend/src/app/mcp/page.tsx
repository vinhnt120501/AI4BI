'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  Eye,
  EyeOff,
  Globe,
  Plug,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react';

type ConnectorStatus = 'connected' | 'not_connected';
type ConnectorKind = 'builtin' | 'custom';

type Column = {
  name: string;
  data_type: string;
  full_type: string;
  nullable: boolean;
  default: string | null;
  description: string;
  position: number;
};

type Table = {
  name: string;
  description: string;
  column_count: number;
  row_count: number;
  columns: Column[];
};

type Connector = {
  id: string;
  name: string;
  status: ConnectorStatus;
  kind: ConnectorKind;
  category: 'web' | 'local' | 'other';
  description: string;
  keyFeatures: string[];
  notes?: string[];
  configured?: boolean;
};

const INITIAL_CONNECTORS: Connector[] = [];

function classNames(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(' ');
}

function slugifyId(value: string) {
  const base = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || `custom-${Date.now()}`;
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'neutral' | 'custom' | 'connected' }) {
  const cls =
    tone === 'connected'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : tone === 'custom'
        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
        : 'bg-slate-50 text-slate-700 border-slate-200';
  return (
    <span className={classNames('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', cls)}>
      {children}
    </span>
  );
}

function IconBadge({ label }: { label: string }) {
  const icon = label === 'Figma' ? (
    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-pink-500 via-orange-400 to-indigo-500" />
  ) : label.includes('Active') || label.includes('MCP') ? (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
      <Database className="h-4 w-4" />
    </div>
  ) : (
    <div className="h-7 w-7 rounded-lg bg-slate-200" />
  );

  return (
    <div className="flex items-center gap-3">
      {icon}
      <span className="text-[14px] font-semibold text-slate-900">{label}</span>
    </div>
  );
}

export default function McpConnectorsPage() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<Connector[]>(() => INITIAL_CONNECTORS);
  const [activeConnectorId, setActiveConnectorId] = useState<string>('');
  const [mcpConfig, setMcpConfig] = useState<{ configured: boolean; metadata: any } | null>(null);
  const [revealConnectionInfo, setRevealConnectionInfo] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [loadingTables, setLoadingTables] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8333';
      const res = await fetch(`${apiUrl}/mcp/status`);
      if (res.ok) {
        const data = await res.json();
        setMcpConfig(data);
        if (data.configured && data.metadata) {
          const mcpConn: Connector = {
            id: 'mcp-active',
            name: 'Active Connector',
            status: 'connected',
            kind: 'custom',
            category: 'local',
            description: `Đang kết nối tới ${data.metadata.host || 'Server'}.`,
            keyFeatures: ['Truy vấn trực tiếp', 'Phân tích dữ liệu 3F'],
            configured: true,
          };
          setConnectors([mcpConn]);
          setActiveConnectorId('mcp-active');
        } else {
          setConnectors([]);
          setActiveConnectorId('');
          setTables([]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch MCP status:', e);
    }
  }, []);

  const fetchTables = useCallback(async () => {
    if (!mcpConfig?.configured) {
      setTables([]);
      return;
    }

    setLoadingTables(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8333';
      const res = await fetch(`${apiUrl}/mcp/tables`);
      if (res.ok) {
        const data = await res.json();
        setTables(data.tables || []);
      }
    } catch (e) {
      console.error('Failed to fetch tables:', e);
    } finally {
      setLoadingTables(false);
    }
  }, [mcpConfig?.configured]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
      }
      return newSet;
    });
  };

  const activeConnector = useMemo(() => {
    return connectors.find((c) => c.id === activeConnectorId) ?? null;
  }, [activeConnectorId, connectors]);

  const [toast, setToast] = useState<string>('');
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 3200);
  }, []);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const maskValue = useCallback((value: string) => {
    const raw = (value || '').trim();
    if (!raw || raw === 'N/A') return 'N/A';
    const schemeSplit = raw.split('://');
    if (schemeSplit.length >= 2) {
      return `${schemeSplit[0]}://••••••••••••••••`;
    }
    return '••••••••••••••••';
  }, []);

  const openAddCustomModal = () => {
    setAdvancedOpen(false);
    setCustomName('');
    setCustomUrl('');
    setIsAddModalOpen(true);
  };

  const handleAddCustom = async () => {
    const name = customName.trim();
    const url = customUrl.trim();
    if (!name || !url) return;
    
    // Call backend to setup MCP link
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
      const response = await fetch(`${apiUrl}/mcp/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      
      if (!response.ok) {
        let msg = 'Unknown error';
        try {
          const err = await response.json();
          msg = err.detail || msg;
        } catch(e) {}
        showToast(`Setup failed: ${msg}`);
        return;
      }
      
      showToast(`Đã thiết lập xong MCP: ${name}`);
      setIsAddModalOpen(false);
      fetchStatus();
      
    } catch (error) {
      showToast('Network error during setup MCP.');
    }
  };

  const handleDisconnect = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8333';
      const response = await fetch(`${apiUrl}/mcp/disconnect`, {
        method: 'POST',
      });
      if (response.ok) {
        showToast('Đã ngắt kết nối MCP.');
        fetchStatus();
      } else {
        showToast('Gặp lỗi khi ngắt kết nối.');
      }
    } catch (error) {
      showToast('Network error during disconnect.');
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background-primary)] text-[color:var(--color-text-primary)] overflow-auto">
      <style jsx global>{`
        button,
        [role='button'],
        select {
          cursor: pointer;
        }

        button:disabled,
        select:disabled {
          cursor: not-allowed;
        }
      `}</style>

      {/* Banner giống giao diện chính */}
      <div className="w-full shrink-0 border-b border-slate-200 bg-white">
        <img
          src="/banner.png"
          alt="AI4BI Banner"
          className="w-full h-auto object-cover block"
        />
      </div>

      {toast ? (
        <div className="pointer-events-none fixed right-6 top-24 z-[60]">
          <div className="pointer-events-auto rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-800 shadow-lg">
            {toast}
          </div>
        </div>
      ) : null}

      {/* Modals */}
      {isAddModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-[680px] overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="px-7 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-[18px] font-bold text-slate-900">Add custom connector</div>
                    <Badge>beta</Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                    
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-400">
                  {/* <label className="block text-[12px] font-semibold text-slate-500">Name</label> */}
                  <input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="mt-1 w-full bg-transparent text-[14px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="Name"
                    autoFocus
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-400">
                  {/* <label className="block text-[12px] font-semibold text-slate-500">Remote MCP server URL</label> */}
                  <input
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="mt-1 w-full bg-transparent text-[14px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
                    placeholder="Remote MCP server URL"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAdvancedOpen((p) => !p)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-1 text-[13px] font-semibold text-slate-700"
              >
                {advancedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Advanced settings
              </button>

              {advancedOpen ? (
                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700">
                  Only use connectors from developers you trust. Anthropic does not control which tools developers make available and cannot verify that they will work as intended or that they won't change.
                </div>
              ) : null}

              <div className="mt-5 pb-6 text-[12px] leading-relaxed text-slate-500">
                
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/40 px-7 py-4">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={!customName.trim() || !customUrl.trim()}
                className={classNames(
                  'h-10 rounded-xl px-4 text-[13px] font-semibold',
                  customName.trim() && customUrl.trim()
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                )}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <aside className="w-[260px] shrink-0 border-r border-[color:var(--color-border-tertiary)] bg-[var(--color-background-primary)]">
          <div className="flex items-center gap-3 px-5 py-4">
              <button
              type="button"
              onClick={() => router.push('/')}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl"
              aria-label="Quay lại"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="text-[16px] font-bold">Customize</div>
          </div>

          <nav className="px-3 pb-6">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-slate-700"
            >
              <Wrench className="h-4 w-4" />
              Models
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-[13px] font-semibold text-slate-900"
              aria-current="page"
            >
              <Plug className="h-4 w-4" />
              Connectors
            </button>
          </nav>
        </aside>

        {/* Connector list */}
        <aside className="w-[360px] shrink-0 border-r border-[color:var(--color-border-tertiary)] bg-[var(--color-background-primary)]">
          <div className="flex items-center justify-between gap-3 px-6 py-4">
            <div className="text-[16px] font-bold">Connectors</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-transparent"
                aria-label="Tìm kiếm"
              >
                <Search className="h-4 w-4 text-slate-700" />
              </button>
              <button
                type="button"
                onClick={openAddCustomModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-transparent"
                aria-label="Thêm connector"
              >
                <Plus className="h-4 w-4 text-slate-700" />
              </button>
            </div>
          </div>

          <div className="px-4 pb-6">
            <div className="space-y-1.5">
              {connectors.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveConnectorId(c.id)}
                  className={classNames(
                    'flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left',
                    c.id === activeConnectorId ? 'border-slate-200 bg-slate-50' : 'border-transparent'
                  )}
                >
                  <IconBadge label={c.name} />
                  <div className="flex items-center gap-2">
                    {c.kind === 'custom' ? <Badge tone="custom">CUSTOM</Badge> : null}
                    {c.configured ? <Badge tone="connected">SETUP</Badge> : null}
                  </div>
                </button>
              ))}
            </div>

          </div>
        </aside>

        {/* Detail */}
        <section className="min-w-0 flex-1 bg-[var(--color-background-primary)] overflow-y-auto">
          {activeConnector ? (
            <>
              <div className="flex items-start justify-between gap-4 px-8 py-6">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <SlidersHorizontal className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-[18px] font-bold text-slate-900">{activeConnector.name}</div>
                        {activeConnector.status === 'connected' ? <Badge tone="connected">Connected</Badge> : <Badge>Not connected</Badge>}
                        {activeConnector.configured ? <Badge tone="connected">Đã thiết lập</Badge> : null}
                        {activeConnector.kind === 'custom' ? <Badge tone="custom">CUSTOM</Badge> : null}
                      </div>
                      <div className="mt-1 text-[13px] text-slate-600">
                        {activeConnector.category === 'web' ? 'Web' : activeConnector.category === 'local' ? 'Local' : 'Other'}
                      </div>
                    </div>
                  </div>
                </div>

              <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={classNames(
                      'inline-flex h-10 items-center justify-center rounded-xl border px-4 text-[13px] font-semibold',
                      activeConnector.status === 'connected'
                        ? 'border-slate-200 bg-white text-slate-900'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    )}
                  >
                    {activeConnector.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500"
                    title="Xoá kết nối"
                    aria-label="Xoá kết nối"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="w-full max-w-[980px] px-8 py-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Plug className="h-4 w-4 text-indigo-500" />
                    <div className="text-[14px] font-bold text-slate-900 uppercase tracking-tight">Cấu hình kết nối hiện tại</div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-slate-500 font-bold uppercase">Connection URL</span>
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-indigo-900">
                          {revealConnectionInfo ? (mcpConfig?.metadata?.url || 'N/A') : maskValue(mcpConfig?.metadata?.url || 'N/A')}
                        </span>
                        <button
                          type="button"
                          onClick={() => setRevealConnectionInfo((p) => !p)}
                          aria-label={revealConnectionInfo ? 'Ẩn thông tin kết nối' : 'Hiện thông tin kết nối'}
                          title={revealConnectionInfo ? 'Ẩn' : 'Hiện'}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700"
                        >
                          {revealConnectionInfo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-500 font-bold uppercase">Host / Port</span>
                        <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-[14px] font-semibold text-slate-900">
                          {revealConnectionInfo ? (mcpConfig?.metadata?.host || 'N/A') : maskValue(mcpConfig?.metadata?.host || 'N/A')}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-500 font-bold uppercase">Database</span>
                        <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl text-[14px] font-semibold text-slate-900">
                          {revealConnectionInfo ? (mcpConfig?.metadata?.database || 'N/A') : maskValue(mcpConfig?.metadata?.database || 'N/A')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="max-w-[980px] px-8 pb-10">
                <p className="text-[14px] leading-6 text-slate-700">{activeConnector.description}</p>

                <div className="mt-6">
                  <div className="text-[14px] font-bold text-slate-900">Key features</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-slate-700">
                    {activeConnector.keyFeatures.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>

                {/* Database Tables Section */}
                <div className="mt-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[16px] font-bold text-slate-900">Database Tables</div>
                    <div className="text-[12px] text-slate-600">
                      {loadingTables ? 'Loading...' : `${tables.length} tables`}
                    </div>
                  </div>

                  {tables.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                      <Database className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                      <div className="text-[13px] text-slate-600">
                        {loadingTables ? 'Đang tải thông tin bảng...' : 'Không tìm thấy bảng nào'}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tables.map((table) => (
                        <div key={table.name} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => toggleTable(table.name)}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {expandedTables.has(table.name) ? (
                                <ChevronDown className="h-4 w-4 text-slate-600" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-slate-600" />
                              )}
                              <div className="text-[14px] font-semibold text-slate-900 font-mono">
                                {table.name}
                              </div>
                              <div className="text-[12px] text-slate-600">
                                {table.column_count} columns
                              </div>
                              <div className="text-[12px] text-slate-600">
                                {table.row_count.toLocaleString()} rows
                              </div>
                            </div>
                            {table.description && (
                              <div className="text-[12px] text-slate-600 max-w-md truncate">
                                {table.description}
                              </div>
                            )}
                          </button>

                          {expandedTables.has(table.name) && (
                            <div className="border-t border-slate-200 bg-slate-50">
                              <table className="w-full text-[12px]">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Column</th>
                                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Type</th>
                                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Nullable</th>
                                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {table.columns.map((col) => (
                                    <tr key={col.name} className="border-t border-slate-200">
                                      <td className="px-4 py-2 font-mono text-slate-900">{col.name}</td>
                                      <td className="px-4 py-2 text-slate-600">{col.full_type}</td>
                                      <td className="px-4 py-2 text-slate-600">
                                        {col.nullable ? 'YES' : 'NO'}
                                      </td>
                                      <td className="px-4 py-2 text-slate-600">{col.description}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {activeConnector.notes?.length ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white text-slate-700">
                        <CircleHelp className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-slate-900">Note</div>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-slate-700">
                          {activeConnector.notes.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="w-full max-w-[560px] p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  <Globe className="h-6 w-6" />
                </div>
                <div className="text-[16px] font-bold text-slate-900">Chưa có MCP connector</div>
                <div className="mt-2 text-[13px] leading-relaxed text-slate-600">
                  Thêm connector để AI4BI dùng MCP làm nguồn dữ liệu. Nhấn nút <span className="font-semibold">+</span> ở cột Connectors.
                </div>
                <button
                  type="button"
                  onClick={openAddCustomModal}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
