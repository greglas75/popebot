"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { cn } from "../utils.js";
function GitToolbar({ workspaceId, containerName, diffStats: externalDiffStats }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [diffStats, setDiffStats] = useState(externalDiffStats || null);
  const [result, setResult] = useState(null);
  const dropdownRef = useRef(null);
  useEffect(() => {
    if (!workspaceId || !containerName) return;
    fetch(`/code/workspace-diff/${workspaceId}`).then((r) => r.json()).then((r) => {
      if (r.success !== false) setDiffStats(r);
    }).catch(() => {
    });
  }, [workspaceId, containerName]);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 3e3);
    return () => clearTimeout(t);
  }, [result]);
  if (!containerName) return null;
  const runAction = async (action) => {
    setBusy(action);
    setOpen(false);
    try {
      let body = { workspaceId, action };
      if (action === "commit") {
        const message = window.prompt("Commit message:");
        if (!message) {
          setBusy(null);
          return;
        }
        body.message = message;
      }
      const res = await fetch("/chat/git-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setResult(data);
      if (action === "commit" && data.success) {
        fetch(`/code/workspace-diff/${workspaceId}`).then((r) => r.json()).then((r) => {
          if (r.success !== false) setDiffStats(r);
        }).catch(() => {
        });
      }
    } catch (err) {
      setResult({ success: false, output: err.message });
    } finally {
      setBusy(null);
    }
  };
  const added = diffStats?.added || 0;
  const deleted = diffStats?.deleted || 0;
  const hasChanges = added > 0 || deleted > 0;
  return /* @__PURE__ */ jsxs("div", { className: "relative inline-flex items-center gap-1.5", ref: dropdownRef, children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setOpen((prev) => !prev),
        disabled: !!busy,
        className: cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
          result?.success ? "border border-green-500/30 text-green-500" : result?.success === false ? "border border-destructive/30 text-destructive" : "text-muted-foreground hover:text-foreground"
        ),
        children: [
          busy ? /* @__PURE__ */ jsxs("svg", { className: "animate-spin h-3 w-3", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [
            /* @__PURE__ */ jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
            /* @__PURE__ */ jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
          ] }) : /* @__PURE__ */ jsxs("svg", { width: "12", height: "12", viewBox: "0 0 16 16", fill: "currentColor", children: [
            /* @__PURE__ */ jsx("circle", { cx: "8", cy: "4", r: "2" }),
            /* @__PURE__ */ jsx("circle", { cx: "8", cy: "12", r: "2" }),
            /* @__PURE__ */ jsx("line", { x1: "8", y1: "6", x2: "8", y2: "10", stroke: "currentColor", strokeWidth: "1.5" })
          ] }),
          result ? result.success ? "Done" : "Failed" : busy ? `${busy}...` : "Git"
        ]
      }
    ),
    hasChanges && !result && /* @__PURE__ */ jsxs("span", { className: "text-xs tabular-nums", children: [
      /* @__PURE__ */ jsxs("span", { className: "text-green-500", children: [
        "+",
        added
      ] }),
      " ",
      /* @__PURE__ */ jsxs("span", { className: "text-destructive", children: [
        "-",
        deleted
      ] })
    ] }),
    open && /* @__PURE__ */ jsx("div", { className: "absolute bottom-full left-0 mb-1 rounded-lg border border-border bg-background shadow-lg py-1 min-w-[140px] z-50", children: [
      { action: "commit", label: "Commit" },
      { action: "push", label: "Push" },
      { action: "create-pr", label: "Create PR" },
      { action: "create-branch", label: "Create branch" }
    ].map(({ action, label }) => /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => runAction(action),
        className: "w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors",
        children: label
      },
      action
    )) })
  ] });
}
export {
  GitToolbar
};
