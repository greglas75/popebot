"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { cn } from "../utils.js";
const TerminalView = dynamic(() => import("../../code/terminal-view.js"), { ssr: false });
const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.7;
function TerminalPanel({ workspaceId, containerName }) {
  const [mode, setMode] = useState("collapsed");
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  useEffect(() => {
    if (mode !== "fullscreen") return;
    const onKey = (e) => {
      if (e.key === "Escape") setMode("expanded");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);
  const onDividerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
  }, [height]);
  useEffect(() => {
    if (mode !== "expanded") return;
    const onMove = (e) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      setHeight(Math.max(MIN_HEIGHT, Math.min(maxH, startH.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [mode]);
  if (!containerName) return null;
  if (mode === "fullscreen") {
    return /* @__PURE__ */ jsxs("div", { className: "fixed inset-0 z-50 flex flex-col bg-black", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-border px-3 py-1.5", children: [
        /* @__PURE__ */ jsx("span", { className: "text-xs font-medium text-muted-foreground", children: "Terminal" }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setMode("expanded"),
              className: "text-xs text-muted-foreground hover:text-foreground transition-colors",
              children: "Exit fullscreen"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setMode("collapsed"),
              className: "text-xs text-muted-foreground hover:text-foreground transition-colors",
              children: "Collapse"
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsx(
        TerminalView,
        {
          codeWorkspaceId: workspaceId,
          showToolbar: false,
          isActive: true
        }
      ) })
    ] });
  }
  if (mode === "collapsed") {
    return /* @__PURE__ */ jsx("div", { className: "border-t border-border", children: /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => setMode("expanded"),
        className: "flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors",
        children: [
          /* @__PURE__ */ jsx("span", { children: "\u25B8" }),
          /* @__PURE__ */ jsx("span", { children: "Terminal" })
        ]
      }
    ) });
  }
  return /* @__PURE__ */ jsxs("div", { className: "border-t border-border flex flex-col", style: { height }, children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        onMouseDown: onDividerDown,
        className: "h-1 cursor-row-resize bg-border hover:bg-primary/30 transition-colors shrink-0"
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-3 py-1 bg-black shrink-0", children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => setMode("collapsed"),
          className: "text-xs text-muted-foreground hover:text-foreground transition-colors",
          children: "\u25BE Terminal"
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => setMode("fullscreen"),
          className: "text-xs text-muted-foreground hover:text-foreground transition-colors",
          children: "Fullscreen"
        }
      )
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0", children: /* @__PURE__ */ jsx(
      TerminalView,
      {
        codeWorkspaceId: workspaceId,
        showToolbar: false,
        isActive: true
      }
    ) })
  ] });
}
export {
  TerminalPanel
};
