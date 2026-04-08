'use client';

import { useState, useEffect, useRef } from 'react';
import { AppSidebar } from '../../chat/components/app-sidebar.js';
import { SidebarProvider, SidebarInset } from '../../chat/components/ui/sidebar.js';
import { ChatNavProvider } from '../../chat/components/chat-nav-context.js';
import { PencilIcon, ClusterIcon } from '../../chat/components/icons.js';
import { triggerRoleManually, stopRoleAction, getCluster, getWorkerPrompts } from '../actions.js';
import { CodeLogView } from '../../chat/components/code-log-view.js';
import { ConfirmDialog } from '../../chat/components/ui/confirm-dialog.js';

const MAX_LOG_ENTRIES = 500;

function autoColumns(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export function ClusterConsolePage({ session, clusterId }) {
  const [cluster, setCluster] = useState(null);
  const [roleData, setRoleData] = useState({}); // { [roleId]: { roleName, maxConcurrency, containers: [] } }
  const [colSetting, setColSetting] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('cluster-console-cols') || 'auto';
    }
    return 'auto';
  });
  const logBuffers = useRef(new Map()); // containerName -> []
  const [logVersion, setLogVersion] = useState(0);
  const reconnectRef = useRef(null);
  const esRef = useRef(null);

  // Load cluster data
  useEffect(() => {
    getCluster(clusterId).then(setCluster).catch(console.error);
  }, [clusterId]);

  // SSE connection
  useEffect(() => {
    let cancelled = false;
    let backoff = 1000;

    function connect() {
      if (cancelled) return;
      const es = new EventSource(`/stream/cluster/${clusterId}/logs`);
      esRef.current = es;

      es.addEventListener('log', (e) => {
        try {
          const data = JSON.parse(e.data);
          const { containerName, stream, raw, parsed } = data;
          if (!logBuffers.current.has(containerName)) {
            logBuffers.current.set(containerName, []);
          }
          const buf = logBuffers.current.get(containerName);
          buf.push({ stream, raw, parsed });
          if (buf.length > MAX_LOG_ENTRIES) {
            buf.splice(0, buf.length - MAX_LOG_ENTRIES);
          }
          setLogVersion((v) => v + 1);
        } catch {}
      });

      es.addEventListener('status', (e) => {
        try {
          const data = JSON.parse(e.data);
          setRoleData(data.roles || {});
        } catch {}
      });

      es.addEventListener('ping', () => {});

      es.onopen = () => { backoff = 1000; };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!cancelled) {
          reconnectRef.current = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 30000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (esRef.current) esRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [clusterId]);

  const handleColChange = (val) => {
    setColSetting(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cluster-console-cols', val);
    }
  };

  // Collect all running containers across roles
  const allContainers = [];
  for (const [roleId, rd] of Object.entries(roleData)) {
    for (const c of (rd.containers || [])) {
      allContainers.push({ ...c, roleId, roleName: rd.roleName });
    }
  }
  const runningContainers = allContainers.filter((c) => c.running);
  const totalRunning = runningContainers.length;
  const cols = colSetting === 'auto' ? autoColumns(totalRunning) : parseInt(colSetting, 10);

  // Role summary for header
  const roleSummary = Object.entries(roleData).map(([roleId, rd]) => {
    const running = (rd.containers || []).filter((c) => c.running).length;
    return { roleId, roleName: rd.roleName, running, max: rd.maxConcurrency };
  });

  if (!cluster) {
    return (
      <ChatNavProvider value={{ activeChatId: null, navigateToChat: (id) => { window.location.href = id ? `/chat/${id}` : '/'; } }}>
        <SidebarProvider>
          <AppSidebar user={session?.user} />
          <SidebarInset>
            <div className="flex h-svh items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </ChatNavProvider>
    );
  }

  return (
    <ChatNavProvider value={{ activeChatId: null, navigateToChat: (id) => { window.location.href = id ? `/chat/${id}` : '/'; } }}>
      <SidebarProvider>
        <AppSidebar user={session?.user} />
        <SidebarInset>
          <div className="flex h-svh flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <a href="/clusters/list" className="hover:text-foreground transition-colors">Clusters</a>
                <span>/</span>
                <span className="text-foreground font-medium">{cluster.name || 'Untitled'}</span>
              </div>
              <a
                href={`/cluster/${clusterId}`}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Edit cluster"
              >
                <PencilIcon size={14} />
              </a>

              {/* Role summary + Run buttons */}
              <div className="flex items-center gap-2 flex-wrap ml-0 md:ml-4">
                {roleSummary.map((rs) => (
                  <RoleHeaderButton key={rs.roleId} {...rs} clusterId={clusterId} />
                ))}
                <a
                  href={`/cluster/${clusterId}/logs`}
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                >
                  Logs
                </a>
              </div>

              <div className="ml-auto hidden md:flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Columns:</span>
                {['auto', '1', '2', '3', '4'].map((val) => (
                  <button
                    key={val}
                    onClick={() => handleColChange(val)}
                    className={`px-2 py-1 text-xs rounded-md transition-colors ${
                      colSetting === val
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    {val === 'auto' ? 'Auto' : val}
                  </button>
                ))}
              </div>
            </div>

            {/* Container grid */}
            <div
              className="flex-1 overflow-auto p-4"
              style={{ minHeight: 0 }}
            >
              {totalRunning === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center">
                    <ClusterIcon size={32} />
                    <p className="text-sm text-muted-foreground mt-2">No active containers.</p>
                  </div>
                </div>
              ) : (
                <div
                  className="grid gap-4 h-full"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {runningContainers.map((container) => (
                    <ContainerTile
                      key={container.name}
                      container={container}
                      clusterId={clusterId}
                      logs={logBuffers.current.get(container.name) || []}
                      logVersion={logVersion}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom stats panel */}
            {allContainers.length > 0 && (
              <>
                <div className="hidden md:block">
                  <StatsPanel containers={allContainers} />
                </div>
                <div className="md:hidden shrink-0 border-t border-border bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {(() => {
                    let cpu = 0, mem = 0, run = 0;
                    for (const c of allContainers) {
                      if (c.running) { run++; cpu += c.cpu || 0; mem += c.memUsage || 0; }
                    }
                    return `${run} running · ${cpu.toFixed(1)}% · ${formatBytes(mem)}`;
                  })()}
                </div>
              </>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}

function RoleHeaderButton({ roleId, roleName, running, max, clusterId }) {
  const [triggering, setTriggering] = useState(false);
  const [warning, setWarning] = useState(null); // { title, description }

  const handleRun = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTriggering(true);
    try {
      const result = await triggerRoleManually(roleId);
      if (result?.error) {
        if (result.error === 'Cluster is disabled') {
          setWarning({
            title: 'Cluster Disabled',
            description: `This cluster is currently disabled. Enable it from the cluster settings to run roles.`,
          });
        } else if (result.error === 'Max concurrency reached') {
          setWarning({
            title: 'Max Concurrency Reached',
            description: `${roleName} is already running at its maximum of ${max} concurrent container${max === 1 ? '' : 's'}. Wait for a container to finish or stop one first.`,
          });
        } else {
          setWarning({ title: 'Error', description: result.error });
        }
      }
    } catch {}
    setTriggering(false);
  };

  const playIcon = triggering ? (
    <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M6.25 4.75l5.5 3.25-5.5 3.25V4.75z" />
    </svg>
  );

  return (
    <>
      <button
        onClick={handleRun}
        disabled={triggering}
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
          running > 0
            ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted'
        }`}
      >
        <span className="mr-2 pr-2 border-r border-current/20 inline-flex items-center">
          {playIcon}
        </span>
        <span className="select-none">
          {roleName} ({running}/{max})
        </span>
      </button>
      <ConfirmDialog
        open={!!warning}
        onCancel={() => setWarning(null)}
        onConfirm={() => setWarning(null)}
        title={warning?.title}
        description={warning?.description}
        confirmLabel="OK"
        variant="default"
      />
    </>
  );
}

const TILE_TABS = ['code', 'console', 'trigger', 'system', 'user'];
const TILE_TAB_LABELS = { code: 'Code', console: 'Console', trigger: 'Trigger', system: 'System', user: 'User' };

function ContainerTile({ container, clusterId, logs, logVersion }) {
  const [mode, setMode] = useState('code');
  const [stopping, setStopping] = useState(false);
  const [expandedTools, setExpandedTools] = useState(new Set());
  const [prompts, setPrompts] = useState(null);
  const logEndRef = useRef(null);
  const containerShortId = container.workerUuid || container.name.split('-').pop();

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logVersion, mode]);

  // Fetch prompt data once per container
  useEffect(() => {
    if (clusterId && container.workerUuid) {
      getWorkerPrompts(clusterId, container.workerUuid).then(setPrompts).catch(() => {});
    }
  }, [clusterId, container.workerUuid]);

  const handleStop = async () => {
    setStopping(true);
    try { await stopRoleAction(container.roleId); } catch {}
    setStopping(false);
  };

  const toggleTool = (id) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden min-h-0">
      {/* Tile header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <span className="text-sm font-medium truncate">{container.roleName}</span>
        <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium">{containerShortId}</span>
        <span className={`ml-auto w-2 h-2 rounded-full shrink-0 ${container.running ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
        {container.running && (
          <button
            onClick={handleStop}
            disabled={stopping}
            className="rounded px-2 py-1 text-xs font-medium border border-input hover:bg-muted disabled:opacity-40"
          >
            {stopping ? 'Stopping...' : 'Stop'}
          </button>
        )}
        <div className="ml-auto flex items-center rounded-md border border-input overflow-hidden">
          {TILE_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setMode(tab)}
              className={`px-2 py-1 text-xs transition-colors ${mode === tab ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {TILE_TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Log area */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-background/50">
        {mode === 'trigger' || mode === 'system' || mode === 'user' ? (
          <PromptTabContent mode={mode} prompts={prompts} />
        ) : (() => {
          const filtered = mode === 'console'
            ? logs.filter((e) => e.stream === 'stderr')
            : logs.filter((e) => e.stream === 'stdout');
          if (filtered.length === 0) {
            return (
              <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                {container.running ? 'Waiting for output...' : 'No active session'}
              </div>
            );
          }
          if (mode === 'console') {
            return (
              <div className="space-y-0">
                {filtered.map((entry, i) => (
                  <div key={i} className="text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
                    {entry.raw}
                  </div>
                ))}
              </div>
            );
          }
          return <CodeLogView logs={filtered} expandedTools={expandedTools} toggleTool={toggleTool} />;
        })()}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function PromptTabContent({ mode, prompts }) {
  if (!prompts) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        Loading...
      </div>
    );
  }
  const content = mode === 'trigger' ? prompts.trigger
    : mode === 'system' ? prompts.systemPrompt
    : prompts.userPrompt;
  if (!content) {
    const label = mode === 'trigger' ? 'trigger data' : mode === 'system' ? 'system prompt' : 'user prompt';
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
        No {label}
      </div>
    );
  }
  return <pre className="whitespace-pre-wrap break-words text-foreground/80 leading-relaxed">{content}</pre>;
}

function StatsPanel({ containers }) {
  let totalCpu = 0;
  let totalMem = 0;
  let totalRunning = 0;

  for (const c of containers) {
    if (c.running) {
      totalRunning++;
      totalCpu += c.cpu || 0;
      totalMem += c.memUsage || 0;
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-muted font-mono text-xs overflow-x-auto">
      <table className="w-full whitespace-nowrap">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-medium">CONTAINER</th>
            <th className="text-right px-3 py-1.5 font-medium w-20">CPU %</th>
            <th className="text-right px-3 py-1.5 font-medium w-32">MEM</th>
            <th className="text-right px-3 py-1.5 font-medium w-32">NET I/O</th>
            <th className="text-right px-3 py-1.5 font-medium w-20">STATUS</th>
          </tr>
        </thead>
        <tbody>
          {containers.map((c) => {
            const containerShortId = c.workerUuid || c.name.split('-').pop();
            return (
              <tr key={c.name} className="border-b border-border last:border-0">
                <td className="px-3 py-1">
                  <span className="text-foreground">{c.roleName}</span>{' '}
                  <span className="text-muted-foreground">{containerShortId}</span>
                </td>
                <td className="text-right px-3 py-1">{c.running ? `${(c.cpu || 0).toFixed(1)}%` : '—'}</td>
                <td className="text-right px-3 py-1">
                  {c.running ? `${formatBytes(c.memUsage || 0)} / ${formatBytes(c.memLimit || 0)}` : '—'}
                </td>
                <td className="text-right px-3 py-1">
                  {c.running ? `${formatBytes(c.netRx || 0)} / ${formatBytes(c.netTx || 0)}` : '—'}
                </td>
                <td className="text-right px-3 py-1">
                  {c.running
                    ? <span className="text-green-500">RUN</span>
                    : <span className="text-muted-foreground/60">STOP</span>}
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-border text-muted-foreground font-medium">
            <td className="px-3 py-1.5">TOTAL ({totalRunning}/{containers.length})</td>
            <td className="text-right px-3 py-1.5">{totalCpu.toFixed(1)}%</td>
            <td className="text-right px-3 py-1.5">{formatBytes(totalMem)}</td>
            <td className="text-right px-3 py-1.5"></td>
            <td className="text-right px-3 py-1.5"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
