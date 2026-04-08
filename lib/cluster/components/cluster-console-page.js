"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { AppSidebar } from "../../chat/components/app-sidebar.js";
import { SidebarProvider, SidebarInset } from "../../chat/components/ui/sidebar.js";
import { ChatNavProvider } from "../../chat/components/chat-nav-context.js";
import { PencilIcon, ClusterIcon } from "../../chat/components/icons.js";
import { triggerRoleManually, stopRoleAction, getCluster, getWorkerPrompts } from "../actions.js";
import { CodeLogView } from "../../chat/components/code-log-view.js";
import { ConfirmDialog } from "../../chat/components/ui/confirm-dialog.js";
const MAX_LOG_ENTRIES = 500;
function autoColumns(count) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}
function ClusterConsolePage({ session, clusterId }) {
  const [cluster, setCluster] = useState(null);
  const [roleData, setRoleData] = useState({});
  const [colSetting, setColSetting] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("cluster-console-cols") || "auto";
    }
    return "auto";
  });
  const logBuffers = useRef(/* @__PURE__ */ new Map());
  const [logVersion, setLogVersion] = useState(0);
  const reconnectRef = useRef(null);
  const esRef = useRef(null);
  useEffect(() => {
    getCluster(clusterId).then(setCluster).catch(console.error);
  }, [clusterId]);
  useEffect(() => {
    let cancelled = false;
    let backoff = 1e3;
    function connect() {
      if (cancelled) return;
      const es = new EventSource(`/stream/cluster/${clusterId}/logs`);
      esRef.current = es;
      es.addEventListener("log", (e) => {
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
        } catch {
        }
      });
      es.addEventListener("status", (e) => {
        try {
          const data = JSON.parse(e.data);
          setRoleData(data.roles || {});
        } catch {
        }
      });
      es.addEventListener("ping", () => {
      });
      es.onopen = () => {
        backoff = 1e3;
      };
      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!cancelled) {
          reconnectRef.current = setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 3e4);
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
    if (typeof window !== "undefined") {
      localStorage.setItem("cluster-console-cols", val);
    }
  };
  const allContainers = [];
  for (const [roleId, rd] of Object.entries(roleData)) {
    for (const c of rd.containers || []) {
      allContainers.push({ ...c, roleId, roleName: rd.roleName });
    }
  }
  const runningContainers = allContainers.filter((c) => c.running);
  const totalRunning = runningContainers.length;
  const cols = colSetting === "auto" ? autoColumns(totalRunning) : parseInt(colSetting, 10);
  const roleSummary = Object.entries(roleData).map(([roleId, rd]) => {
    const running = (rd.containers || []).filter((c) => c.running).length;
    return { roleId, roleName: rd.roleName, running, max: rd.maxConcurrency };
  });
  if (!cluster) {
    return /* @__PURE__ */ jsx(ChatNavProvider, { value: { activeChatId: null, navigateToChat: (id) => {
      window.location.href = id ? `/chat/${id}` : "/";
    } }, children: /* @__PURE__ */ jsxs(SidebarProvider, { children: [
      /* @__PURE__ */ jsx(AppSidebar, { user: session?.user }),
      /* @__PURE__ */ jsx(SidebarInset, { children: /* @__PURE__ */ jsx("div", { className: "flex h-svh items-center justify-center", children: /* @__PURE__ */ jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" }) }) })
    ] }) });
  }
  return /* @__PURE__ */ jsx(ChatNavProvider, { value: { activeChatId: null, navigateToChat: (id) => {
    window.location.href = id ? `/chat/${id}` : "/";
  } }, children: /* @__PURE__ */ jsxs(SidebarProvider, { children: [
    /* @__PURE__ */ jsx(AppSidebar, { user: session?.user }),
    /* @__PURE__ */ jsx(SidebarInset, { children: /* @__PURE__ */ jsxs("div", { className: "flex h-svh flex-col overflow-hidden", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 flex-wrap", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [
          /* @__PURE__ */ jsx("a", { href: "/clusters/list", className: "hover:text-foreground transition-colors", children: "Clusters" }),
          /* @__PURE__ */ jsx("span", { children: "/" }),
          /* @__PURE__ */ jsx("span", { className: "text-foreground font-medium", children: cluster.name || "Untitled" })
        ] }),
        /* @__PURE__ */ jsx(
          "a",
          {
            href: `/cluster/${clusterId}`,
            className: "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
            title: "Edit cluster",
            children: /* @__PURE__ */ jsx(PencilIcon, { size: 14 })
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 flex-wrap ml-0 md:ml-4", children: [
          roleSummary.map((rs) => /* @__PURE__ */ jsx(RoleHeaderButton, { ...rs, clusterId }, rs.roleId)),
          /* @__PURE__ */ jsx(
            "a",
            {
              href: `/cluster/${clusterId}/logs`,
              className: "inline-flex items-center rounded-full px-3 py-1 text-xs bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors",
              children: "Logs"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "ml-auto hidden md:flex items-center gap-1.5", children: [
          /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: "Columns:" }),
          ["auto", "1", "2", "3", "4"].map((val) => /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => handleColChange(val),
              className: `px-2 py-1 text-xs rounded-md transition-colors ${colSetting === val ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`,
              children: val === "auto" ? "Auto" : val
            },
            val
          ))
        ] })
      ] }),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "flex-1 overflow-auto p-4",
          style: { minHeight: 0 },
          children: totalRunning === 0 ? /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full", children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
            /* @__PURE__ */ jsx(ClusterIcon, { size: 32 }),
            /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground mt-2", children: "No active containers." })
          ] }) }) : /* @__PURE__ */ jsx(
            "div",
            {
              className: "grid gap-4 h-full",
              style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` },
              children: runningContainers.map((container) => /* @__PURE__ */ jsx(
                ContainerTile,
                {
                  container,
                  clusterId,
                  logs: logBuffers.current.get(container.name) || [],
                  logVersion
                },
                container.name
              ))
            }
          )
        }
      ),
      allContainers.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "hidden md:block", children: /* @__PURE__ */ jsx(StatsPanel, { containers: allContainers }) }),
        /* @__PURE__ */ jsx("div", { className: "md:hidden shrink-0 border-t border-border bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground", children: (() => {
          let cpu = 0, mem = 0, run = 0;
          for (const c of allContainers) {
            if (c.running) {
              run++;
              cpu += c.cpu || 0;
              mem += c.memUsage || 0;
            }
          }
          return `${run} running \xB7 ${cpu.toFixed(1)}% \xB7 ${formatBytes(mem)}`;
        })() })
      ] })
    ] }) })
  ] }) });
}
function RoleHeaderButton({ roleId, roleName, running, max, clusterId }) {
  const [triggering, setTriggering] = useState(false);
  const [warning, setWarning] = useState(null);
  const handleRun = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setTriggering(true);
    try {
      const result = await triggerRoleManually(roleId);
      if (result?.error) {
        if (result.error === "Cluster is disabled") {
          setWarning({
            title: "Cluster Disabled",
            description: `This cluster is currently disabled. Enable it from the cluster settings to run roles.`
          });
        } else if (result.error === "Max concurrency reached") {
          setWarning({
            title: "Max Concurrency Reached",
            description: `${roleName} is already running at its maximum of ${max} concurrent container${max === 1 ? "" : "s"}. Wait for a container to finish or stop one first.`
          });
        } else {
          setWarning({ title: "Error", description: result.error });
        }
      }
    } catch {
    }
    setTriggering(false);
  };
  const playIcon = triggering ? /* @__PURE__ */ jsxs("svg", { className: "animate-spin h-3.5 w-3.5", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [
    /* @__PURE__ */ jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
    /* @__PURE__ */ jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
  ] }) : /* @__PURE__ */ jsx("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 16 16", fill: "currentColor", className: "h-3.5 w-3.5", children: /* @__PURE__ */ jsx("path", { d: "M6.25 4.75l5.5 3.25-5.5 3.25V4.75z" }) });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: handleRun,
        disabled: triggering,
        className: `inline-flex items-center rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-40 ${running > 0 ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" : "bg-muted/50 text-muted-foreground hover:bg-muted"}`,
        children: [
          /* @__PURE__ */ jsx("span", { className: "mr-2 pr-2 border-r border-current/20 inline-flex items-center", children: playIcon }),
          /* @__PURE__ */ jsxs("span", { className: "select-none", children: [
            roleName,
            " (",
            running,
            "/",
            max,
            ")"
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      ConfirmDialog,
      {
        open: !!warning,
        onCancel: () => setWarning(null),
        onConfirm: () => setWarning(null),
        title: warning?.title,
        description: warning?.description,
        confirmLabel: "OK",
        variant: "default"
      }
    )
  ] });
}
const TILE_TABS = ["code", "console", "trigger", "system", "user"];
const TILE_TAB_LABELS = { code: "Code", console: "Console", trigger: "Trigger", system: "System", user: "User" };
function ContainerTile({ container, clusterId, logs, logVersion }) {
  const [mode, setMode] = useState("code");
  const [stopping, setStopping] = useState(false);
  const [expandedTools, setExpandedTools] = useState(/* @__PURE__ */ new Set());
  const [prompts, setPrompts] = useState(null);
  const logEndRef = useRef(null);
  const containerShortId = container.workerUuid || container.name.split("-").pop();
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logVersion, mode]);
  useEffect(() => {
    if (clusterId && container.workerUuid) {
      getWorkerPrompts(clusterId, container.workerUuid).then(setPrompts).catch(() => {
      });
    }
  }, [clusterId, container.workerUuid]);
  const handleStop = async () => {
    setStopping(true);
    try {
      await stopRoleAction(container.roleId);
    } catch {
    }
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
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col rounded-lg border border-border bg-card overflow-hidden min-h-0", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-border shrink-0", children: [
      /* @__PURE__ */ jsx("span", { className: "text-sm font-medium truncate", children: container.roleName }),
      /* @__PURE__ */ jsx("span", { className: "px-1.5 py-0.5 rounded bg-muted text-xs font-mono font-medium", children: containerShortId }),
      /* @__PURE__ */ jsx("span", { className: `ml-auto w-2 h-2 rounded-full shrink-0 ${container.running ? "bg-green-500" : "bg-muted-foreground/30"}` })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0", children: [
      container.running && /* @__PURE__ */ jsx(
        "button",
        {
          onClick: handleStop,
          disabled: stopping,
          className: "rounded px-2 py-1 text-xs font-medium border border-input hover:bg-muted disabled:opacity-40",
          children: stopping ? "Stopping..." : "Stop"
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "ml-auto flex items-center rounded-md border border-input overflow-hidden", children: TILE_TABS.map((tab) => /* @__PURE__ */ jsx(
        "button",
        {
          onClick: () => setMode(tab),
          className: `px-2 py-1 text-xs transition-colors ${mode === tab ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`,
          children: TILE_TAB_LABELS[tab]
        },
        tab
      )) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto p-2 font-mono text-xs min-h-0 bg-background/50", children: [
      mode === "trigger" || mode === "system" || mode === "user" ? /* @__PURE__ */ jsx(PromptTabContent, { mode, prompts }) : (() => {
        const filtered = mode === "console" ? logs.filter((e) => e.stream === "stderr") : logs.filter((e) => e.stream === "stdout");
        if (filtered.length === 0) {
          return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-muted-foreground text-xs", children: container.running ? "Waiting for output..." : "No active session" });
        }
        if (mode === "console") {
          return /* @__PURE__ */ jsx("div", { className: "space-y-0", children: filtered.map((entry, i) => /* @__PURE__ */ jsx("div", { className: "text-muted-foreground whitespace-pre-wrap break-all leading-relaxed", children: entry.raw }, i)) });
        }
        return /* @__PURE__ */ jsx(CodeLogView, { logs: filtered, expandedTools, toggleTool });
      })(),
      /* @__PURE__ */ jsx("div", { ref: logEndRef })
    ] })
  ] });
}
function PromptTabContent({ mode, prompts }) {
  if (!prompts) {
    return /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center h-full text-muted-foreground text-xs", children: "Loading..." });
  }
  const content = mode === "trigger" ? prompts.trigger : mode === "system" ? prompts.systemPrompt : prompts.userPrompt;
  if (!content) {
    const label = mode === "trigger" ? "trigger data" : mode === "system" ? "system prompt" : "user prompt";
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-center h-full text-muted-foreground text-xs", children: [
      "No ",
      label
    ] });
  }
  return /* @__PURE__ */ jsx("pre", { className: "whitespace-pre-wrap break-words text-foreground/80 leading-relaxed", children: content });
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
  return /* @__PURE__ */ jsx("div", { className: "shrink-0 border-t border-border bg-muted font-mono text-xs overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "w-full whitespace-nowrap", children: [
    /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-border text-muted-foreground", children: [
      /* @__PURE__ */ jsx("th", { className: "text-left px-3 py-1.5 font-medium", children: "CONTAINER" }),
      /* @__PURE__ */ jsx("th", { className: "text-right px-3 py-1.5 font-medium w-20", children: "CPU %" }),
      /* @__PURE__ */ jsx("th", { className: "text-right px-3 py-1.5 font-medium w-32", children: "MEM" }),
      /* @__PURE__ */ jsx("th", { className: "text-right px-3 py-1.5 font-medium w-32", children: "NET I/O" }),
      /* @__PURE__ */ jsx("th", { className: "text-right px-3 py-1.5 font-medium w-20", children: "STATUS" })
    ] }) }),
    /* @__PURE__ */ jsxs("tbody", { children: [
      containers.map((c) => {
        const containerShortId = c.workerUuid || c.name.split("-").pop();
        return /* @__PURE__ */ jsxs("tr", { className: "border-b border-border last:border-0", children: [
          /* @__PURE__ */ jsxs("td", { className: "px-3 py-1", children: [
            /* @__PURE__ */ jsx("span", { className: "text-foreground", children: c.roleName }),
            " ",
            /* @__PURE__ */ jsx("span", { className: "text-muted-foreground", children: containerShortId })
          ] }),
          /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1", children: c.running ? `${(c.cpu || 0).toFixed(1)}%` : "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1", children: c.running ? `${formatBytes(c.memUsage || 0)} / ${formatBytes(c.memLimit || 0)}` : "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1", children: c.running ? `${formatBytes(c.netRx || 0)} / ${formatBytes(c.netTx || 0)}` : "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1", children: c.running ? /* @__PURE__ */ jsx("span", { className: "text-green-500", children: "RUN" }) : /* @__PURE__ */ jsx("span", { className: "text-muted-foreground/60", children: "STOP" }) })
        ] }, c.name);
      }),
      /* @__PURE__ */ jsxs("tr", { className: "border-t border-border text-muted-foreground font-medium", children: [
        /* @__PURE__ */ jsxs("td", { className: "px-3 py-1.5", children: [
          "TOTAL (",
          totalRunning,
          "/",
          containers.length,
          ")"
        ] }),
        /* @__PURE__ */ jsxs("td", { className: "text-right px-3 py-1.5", children: [
          totalCpu.toFixed(1),
          "%"
        ] }),
        /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1.5", children: formatBytes(totalMem) }),
        /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1.5" }),
        /* @__PURE__ */ jsx("td", { className: "text-right px-3 py-1.5" })
      ] })
    ] })
  ] }) });
}
export {
  ClusterConsolePage
};
