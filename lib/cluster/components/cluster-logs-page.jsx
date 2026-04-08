'use client';

import { useState, useEffect } from 'react';
import { AppSidebar } from '../../chat/components/app-sidebar.js';
import { SidebarProvider, SidebarInset } from '../../chat/components/ui/sidebar.js';
import { ChatNavProvider } from '../../chat/components/chat-nav-context.js';
import { ClusterIcon } from '../../chat/components/icons.js';
import { getCluster, getClusterLogs, getSessionLog } from '../actions.js';
import { mapLine } from '../../ai/line-mappers.js';
import { CodeLogView } from '../../chat/components/code-log-view.js';

function formatDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return null;
  const ms = new Date(endedAt) - new Date(startedAt);
  if (ms < 0) return null;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function ClusterLogsPage({ session, clusterId }) {
  const [cluster, setCluster] = useState(null);
  const [logData, setLogData] = useState([]);
  const [selectedRole, setSelectedRole] = useState(null);
  const [expandedSessions, setExpandedSessions] = useState(new Set());
  const [sessionContents, setSessionContents] = useState({});
  const [activeTab, setActiveTab] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getCluster(clusterId),
      getClusterLogs(clusterId),
    ]).then(([c, logs]) => {
      setCluster(c);
      setLogData(logs);
      if (logs.length > 0) setSelectedRole(logs[0].roleShortId);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [clusterId]);

  const toggleSession = async (roleShortId, sessionName) => {
    const key = `${roleShortId}/${sessionName}`;
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      next.add(key);
      return next;
    });

    if (!sessionContents[key]) {
      const [stdout, stderr, systemPrompt, userPrompt, legacyPrompt, trigger] = await Promise.all([
        getSessionLog(clusterId, roleShortId, sessionName, 'stdout'),
        getSessionLog(clusterId, roleShortId, sessionName, 'stderr'),
        getSessionLog(clusterId, roleShortId, sessionName, 'system-prompt'),
        getSessionLog(clusterId, roleShortId, sessionName, 'user-prompt'),
        getSessionLog(clusterId, roleShortId, sessionName, 'prompt'),
        getSessionLog(clusterId, roleShortId, sessionName, 'trigger'),
      ]);
      // Support old sessions that only have prompt.md
      const sysPrompt = systemPrompt || (legacyPrompt && !userPrompt ? legacyPrompt : null);
      const usrPrompt = userPrompt || null;
      setSessionContents((prev) => ({ ...prev, [key]: { stdout, stderr, systemPrompt: sysPrompt, userPrompt: usrPrompt, trigger } }));
    }
  };

  const getTab = (key) => activeTab[key] || 'code';
  const setTab = (key, tab) => setActiveTab((prev) => ({ ...prev, [key]: tab }));

  const selectedRoleData = logData.find((r) => r.roleShortId === selectedRole);

  const navProvider = { activeChatId: null, navigateToChat: (id) => { window.location.href = id ? `/chat/${id}` : '/'; } };

  if (loading || !cluster) {
    return (
      <ChatNavProvider value={navProvider}>
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
    <ChatNavProvider value={navProvider}>
      <SidebarProvider>
        <AppSidebar user={session?.user} />
        <SidebarInset>
          <div className="flex h-svh flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <a href="/clusters/list" className="hover:text-foreground transition-colors">Clusters</a>
                <span>/</span>
                <a href={`/cluster/${clusterId}/console`} className="text-foreground font-medium hover:text-muted-foreground transition-colors">{cluster.name || 'Untitled'}</a>
                <span>/</span>
                <span className="text-foreground">Logs</span>
              </div>
              <a
                href={`/cluster/${clusterId}/console`}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Console
              </a>
            </div>

            {/* Body */}
            <div className="flex flex-col md:flex-row flex-1 min-h-0">
              {/* Left: role list */}
              <div className="shrink-0 border-b md:border-b-0 md:border-r border-border overflow-x-auto scrollbar-hide md:overflow-y-auto md:w-56 bg-muted/30">
                <div className="hidden md:block px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Roles
                </div>
                {logData.length === 0 ? (
                  <div className="px-3 py-4 text-xs text-muted-foreground">No logs yet</div>
                ) : (
                  <div className="flex md:block overflow-x-auto scrollbar-hide md:overflow-x-visible gap-2 px-3 py-2 md:p-0">
                    {logData.map((role) => (
                      <button
                        key={role.roleShortId}
                        onClick={() => setSelectedRole(role.roleShortId)}
                        className={`shrink-0 md:w-full text-left px-3 py-2 md:py-2.5 text-sm transition-colors rounded-full md:rounded-none border md:border-0 md:border-l-2 ${
                          selectedRole === role.roleShortId
                            ? 'bg-foreground text-background md:bg-muted/60 md:text-foreground border-foreground md:border-l-foreground'
                            : 'border-input md:border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40'
                        }`}
                      >
                        <div className="font-medium truncate">{role.roleName}</div>
                        <div className="hidden md:block text-xs text-muted-foreground mt-0.5">
                          {role.sessions.length} session{role.sessions.length !== 1 ? 's' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: sessions */}
              <div className="flex-1 overflow-y-auto">
                {!selectedRoleData || selectedRoleData.sessions.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center">
                      <ClusterIcon size={32} />
                      <p className="text-sm text-muted-foreground mt-2">
                        {logData.length === 0 ? 'No session logs yet.' : 'No sessions for this role.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 space-y-2">
                    {selectedRoleData.sessions.map((s) => {
                      const key = `${selectedRoleData.roleShortId}/${s.name}`;
                      const expanded = expandedSessions.has(key);
                      const content = sessionContents[key];
                      const tab = getTab(key);
                      const duration = formatDuration(s.startedAt, s.endedAt);
                      // Folder name: {YYYY-MM-DD}_{HH-mm-ss}_{workerUuid}
                      const nameParts = s.name.split('_');
                      const workerUuid = nameParts.length > 2 ? nameParts.slice(2).join('_').replace(/^_|_$/g, '') : null;

                      return (
                        <div key={s.name} className="border border-border rounded-lg overflow-hidden bg-card">
                          {/* Session header */}
                          <button
                            onClick={() => toggleSession(selectedRoleData.roleShortId, s.name)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                          >
                            <span className="text-muted-foreground text-xs">{expanded ? '▼' : '▶'}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                                {formatTimestamp(s.startedAt) || s.name}
                                {workerUuid && <span className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium text-muted-foreground">{workerUuid}</span>}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                                {duration && (
                                  <span>{duration}</span>
                                )}
                                {s.startedAt && !s.endedAt && (
                                  <span className="text-yellow-500">in progress</span>
                                )}
                              </div>
                            </div>
                          </button>

                          {/* Expanded content */}
                          {expanded && (
                            <div className="border-t border-border">
                              {/* Tabs */}
                              <div className="flex items-center gap-0 border-b border-border bg-muted/30 overflow-x-auto scrollbar-hide max-w-full">
                                {[
                                  { id: 'code', label: 'Code' },
                                  { id: 'console', label: 'Console' },
                                  { id: 'trigger', label: 'Trigger' },
                                  { id: 'system-prompt', label: 'System Prompt' },
                                  { id: 'user-prompt', label: 'User Prompt' },
                                ].map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => setTab(key, t.id)}
                                    className={`px-4 py-2 text-xs font-medium transition-colors border-b-2 shrink-0 whitespace-nowrap ${
                                      tab === t.id
                                        ? 'border-b-foreground text-foreground'
                                        : 'border-b-transparent text-muted-foreground hover:text-foreground'
                                    }`}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>

                              {/* Tab content */}
                              <div className="max-h-[600px] overflow-y-auto p-3 font-mono text-xs bg-background/50">
                                {!content ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                                  </div>
                                ) : (
                                  <SessionTabContent content={content} tab={tab} />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}

function SessionTabContent({ content, tab }) {
  if (tab === 'code') {
    if (!content.stdout) {
      return <div className="text-muted-foreground text-center py-4">No output</div>;
    }
    const logs = content.stdout.split('\n').filter((l) => l.trim()).map((line) => ({
      stream: 'stdout',
      raw: line,
      parsed: mapLine(line),
    }));
    return <CodeLogView logs={logs} />;
  }

  if (tab === 'console') {
    if (!content.stderr) {
      return <div className="text-muted-foreground text-center py-4">No stderr output</div>;
    }
    return (
      <pre className="text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
        {content.stderr}
      </pre>
    );
  }

  if (tab === 'system-prompt') {
    if (!content.systemPrompt) {
      return <div className="text-muted-foreground text-center py-4">No system prompt saved</div>;
    }
    return (
      <pre className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
        {content.systemPrompt}
      </pre>
    );
  }

  if (tab === 'user-prompt') {
    if (!content.userPrompt) {
      return <div className="text-muted-foreground text-center py-4">No user prompt saved</div>;
    }
    return (
      <pre className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
        {content.userPrompt}
      </pre>
    );
  }

  if (tab === 'trigger') {
    if (!content.trigger) {
      return <div className="text-muted-foreground text-center py-4">No trigger data</div>;
    }
    return (
      <pre className="text-foreground whitespace-pre-wrap break-words leading-relaxed">
        {content.trigger}
      </pre>
    );
  }

  return null;
}
