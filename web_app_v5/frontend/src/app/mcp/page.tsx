'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Ellipsis,
  Globe,
  Plug,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react';

type ConnectorStatus = 'connected' | 'not_connected';
type ConnectorKind = 'builtin' | 'custom';
type ToolGroupId = 'interactive' | 'readonly';
type ToolPermission = 'blocked' | 'ask' | 'allowed';

type Connector = {
  id: string;
  name: string;
  status: ConnectorStatus;
  kind: ConnectorKind;
  category: 'web' | 'local' | 'other';
  description: string;
  keyFeatures: string[];
  notes?: string[];
  tools: Record<ToolGroupId, string[]>;
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

function PermissionButton({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={classNames(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate-600 transition-colors',
        active ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 hover:bg-slate-50'
      )}
    >
      {icon}
    </button>
  );
}

function PermissionSelect({
  value,
  onChange,
  disabled,
}: {
  value: ToolPermission;
  onChange: (value: ToolPermission) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ToolPermission)}
      disabled={disabled}
      className={classNames(
        'h-9 rounded-xl border px-3 text-[13px] font-semibold text-slate-700',
        disabled ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white hover:bg-slate-50'
      )}
    >
      <option value="blocked">Blocked</option>
      <option value="ask">Ask</option>
      <option value="allowed">Allowed</option>
    </select>
  );
}

export default function McpConnectorsPage() {
  const router = useRouter();
  const [connectors, setConnectors] = useState<Connector[]>(() => INITIAL_CONNECTORS);
  const [activeConnectorId, setActiveConnectorId] = useState<string>('');

  const activeConnector = useMemo(() => {
    return connectors.find((c) => c.id === activeConnectorId) ?? null;
  }, [activeConnectorId, connectors]);

  const [collapsed, setCollapsed] = useState<Record<ToolGroupId, boolean>>({
    interactive: false,
    readonly: false,
  });

  const toolIds = useMemo(() => {
    if (!activeConnector) return [];
    const ids: Array<{ group: ToolGroupId; id: string }> = [];
    (Object.keys(activeConnector.tools) as ToolGroupId[]).forEach((group) => {
      activeConnector.tools[group].forEach((id) => ids.push({ group, id }));
    });
    return ids;
  }, [activeConnector]);

  const [toolPerms, setToolPerms] = useState<Record<string, ToolPermission>>(() => ({}));

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

  // Ensure new connector tools have defaults without resetting user changes.
  useEffect(() => {
    setToolPerms((prev) => {
      const next = { ...prev };
      toolIds.forEach(({ id }) => {
        if (!next[id]) next[id] = 'blocked';
      });
      return next;
    });
  }, [toolIds]);

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

  const groupEffective = (group: ToolGroupId): ToolPermission => {
    if (!activeConnector) return 'blocked';
    const tools = activeConnector.tools[group];
    if (!tools.length) return 'blocked';
    const first = toolPerms[tools[0]] ?? 'blocked';
    const allSame = tools.every((t) => (toolPerms[t] ?? 'blocked') === first);
    return allSame ? first : 'ask';
  };

  const setGroupPermission = (group: ToolGroupId, perm: ToolPermission) => {
    if (!activeConnector) return;
    setToolPerms((prev) => {
      const next = { ...prev };
      activeConnector.tools[group].forEach((toolId) => {
        next[toolId] = perm;
      });
      return next;
    });
  };

  const openAddCustomModal = () => {
    setAdvancedOpen(false);
    setCustomName('');
    setCustomUrl('');
    setIsAddModalOpen(true);
  };

  const handleAddCustom = () => {
    const name = customName.trim();
    const url = customUrl.trim();
    if (!name || !url) return;
    const idBase = slugifyId(name);
    const id = connectors.some((c) => c.id === idBase) ? `${idBase}-${Date.now()}` : idBase;

    const newConnector: Connector = {
      id,
      name,
      status: 'connected',
      kind: 'custom',
      category: 'web',
      description: `Connector custom tới MCP server: ${url}`,
      keyFeatures: ['Kết nối MCP server qua URL', 'Thiết lập quyền tools theo connector', 'Dùng làm nguồn dữ liệu/ngữ cảnh cho AI4BI'],
      notes: ['Đây là cấu hình demo UI (chưa gọi backend).'],
      tools: { interactive: [], readonly: [] },
      configured: true,
    };

    setConnectors((prev) => [newConnector, ...prev]);
    setActiveConnectorId(newConnector.id);
    setIsAddModalOpen(false);
    showToast(`Đã thiết lập xong MCP: ${name}`);
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--color-background-primary)] text-[color:var(--color-text-primary)] overflow-hidden">
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
                    Kết nối AI4BI tới MCP server của bạn. Điền thông tin bên dưới để thiết lập connector (demo UI).
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
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-2 py-1 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
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
                Trạng thái sau khi add: connector sẽ hiển thị ở danh sách Web và có badge “Connected/Đã thiết lập”.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/40 px-7 py-4">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
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
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl hover:bg-slate-50"
              aria-label="Quay lại"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="text-[16px] font-bold">Customize</div>
          </div>

          <nav className="px-3 pb-6">
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-transparent transition-colors hover:bg-slate-50"
                aria-label="Tìm kiếm"
              >
                <Search className="h-4 w-4 text-slate-700" />
              </button>
              <button
                type="button"
                onClick={openAddCustomModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-transparent transition-colors hover:bg-slate-50"
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
                    'flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors',
                    c.id === activeConnectorId ? 'border-slate-200 bg-slate-50' : 'border-transparent hover:bg-slate-50'
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
        <section className="min-w-0 flex-1 bg-[var(--color-background-primary)]">
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
                      'inline-flex h-10 items-center justify-center rounded-xl border px-4 text-[13px] font-semibold transition-colors',
                      activeConnector.status === 'connected'
                        ? 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    )}
                  >
                    {activeConnector.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50"
                    aria-label="Tuỳ chọn khác"
                  >
                    <Ellipsis className="h-5 w-5 text-slate-700" />
                  </button>
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

                <div className="mt-8">
                  <div className="text-[14px] font-bold text-slate-900">Tool permissions</div>
                  <div className="mt-1 text-[13px] text-slate-600">Chọn khi nào AI4BI được phép dùng các tools của connector.</div>

                  {(['interactive', 'readonly'] as ToolGroupId[]).map((group) => {
                    const groupLabel = group === 'interactive' ? 'Interactive tools' : 'Read-only tools';
                    const tools = activeConnector.tools[group] ?? [];
                    const isCollapsed = collapsed[group];
                    const disabled = tools.length === 0;
                    const effective = groupEffective(group);

                    return (
                      <div key={group} className="mt-5 rounded-2xl border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-3 px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
                            className="inline-flex items-center gap-2 text-left"
                            disabled={disabled}
                          >
                            {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                            <div className="text-[13px] font-bold text-slate-900">{groupLabel}</div>
                            <Badge>{tools.length}</Badge>
                          </button>

                          <PermissionSelect value={effective} onChange={(v) => setGroupPermission(group, v)} disabled={disabled} />
                        </div>

                        {isCollapsed || disabled ? null : (
                          <div className="border-t border-slate-100">
                            {tools.map((toolId) => {
                              const perm = toolPerms[toolId] ?? 'blocked';
                              return (
                                <div key={toolId} className="flex items-center justify-between gap-3 px-5 py-3">
                                  <div className="min-w-0">
                                    <div className="truncate font-mono text-[13px] text-slate-800">{toolId}</div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <PermissionButton
                                      active={perm === 'allowed'}
                                      label="Allowed"
                                      onClick={() => setToolPerms((p) => ({ ...p, [toolId]: 'allowed' }))}
                                      icon={<ShieldCheck className="h-4 w-4" />}
                                    />
                                    <PermissionButton
                                      active={perm === 'ask'}
                                      label="Ask"
                                      onClick={() => setToolPerms((p) => ({ ...p, [toolId]: 'ask' }))}
                                      icon={<CircleHelp className="h-4 w-4" />}
                                    />
                                    <PermissionButton
                                      active={perm === 'blocked'}
                                      label="Blocked"
                                      onClick={() => setToolPerms((p) => ({ ...p, [toolId]: 'blocked' }))}
                                      icon={<ShieldOff className="h-4 w-4" />}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
                  Thêm connector để AI4BI dùng MCP làm nguồn dữ liệu/ngữ cảnh. Nhấn nút <span className="font-semibold">+</span> ở cột Connectors.
                </div>
                <button
                  type="button"
                  onClick={openAddCustomModal}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800"
                >
                  Add custom connector
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
