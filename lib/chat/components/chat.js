"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Messages } from "./messages.js";
import { ChatInput } from "./chat-input.js";
import { ChatHeader } from "./chat-header.js";
import { Greeting } from "./greeting.js";
import { RepoBranchPicker, WorkspaceBar } from "./code-mode-toggle.js";
import { getAvailableAgents } from "../actions.js";
import dynamic from "next/dynamic";
const DiffViewer = dynamic(() => import("./diff-viewer.js").then((m) => ({ default: m.DiffViewer })), { ssr: false });
import { cn } from "../utils.js";
const fetchRepositories = () => fetch("/code/repositories").then((r) => r.json()).catch(() => []);
const fetchBranches = (repoFullName) => fetch(`/code/branches?repo=${encodeURIComponent(repoFullName)}`).then((r) => r.json()).catch(() => []);
function Chat({ chatId, initialMessages = [], workspace = null, chatMode = null }) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const hasNavigated = useRef(false);
  const [codeMode, setCodeMode] = useState(chatMode === "code");
  const [codeModeType, setCodeModeType] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`codeModeType:${chatId}`);
      if (stored === "plan" || stored === "code" || stored === "job") return stored;
    }
    return "code";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(`codeModeType:${chatId}`, codeModeType);
    }
  }, [chatId, codeModeType]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [codingAgent, setCodingAgent] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("thepopebot-coding-agent") || "";
    }
    return "";
  });
  const [codingModel, setCodingModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("thepopebot-coding-model") || "";
    }
    return "";
  });
  useEffect(() => {
    getAvailableAgents().then(({ defaultAgent, agents }) => {
      setAvailableAgents(agents);
      if (!codingAgent && defaultAgent) {
        setCodingAgent(defaultAgent);
      }
    }).catch(() => {
    });
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined" && codingAgent) {
      localStorage.setItem("thepopebot-coding-agent", codingAgent);
    }
  }, [codingAgent]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("thepopebot-coding-model", codingModel);
    }
  }, [codingModel]);
  const [defaultRepo, setDefaultRepo] = useState(null);
  const [repo, setRepo] = useState(workspace?.repo || "");
  const [branch, setBranch] = useState(workspace?.branch || "");
  const [workspaceState, setWorkspaceState] = useState(workspace);
  const [diffStats, setDiffStats] = useState(null);
  const [showDiff, setShowDiff] = useState(false);
  useEffect(() => {
    fetch("/code/default-repo").then((res) => res.json()).then(({ repo: r }) => {
      if (r) {
        setDefaultRepo(r);
        if (!workspace && !repo && !codeMode) {
          setRepo(r);
          setBranch("main");
        }
      }
    }).catch(() => {
    });
  }, []);
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (workspaceState?.containerName && workspaceState?.id) {
      window.location.href = `/code/${workspaceState.id}`;
    }
  }, [workspaceState?.containerName]);
  const codeModeRef = useRef({ codeMode, codeModeType, repo, branch, workspaceId: workspaceState?.id, codingAgent, codingModel });
  codeModeRef.current = { codeMode, codeModeType, repo, branch, workspaceId: workspaceState?.id, codingAgent, codingModel };
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/stream/chat",
      body: () => ({
        chatId,
        codeMode: codeModeRef.current.codeMode,
        codeModeType: codeModeRef.current.codeModeType,
        repo: codeModeRef.current.repo,
        branch: codeModeRef.current.branch,
        workspaceId: codeModeRef.current.workspaceId,
        codingAgent: codeModeRef.current.codingAgent,
        codingModel: codeModeRef.current.codingModel || void 0
      })
    }),
    [chatId]
  );
  const {
    messages,
    status,
    stop,
    error,
    sendMessage,
    regenerate,
    setMessages
  } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onError: (err) => console.error("Chat error:", err)
  });
  const prevStatus = useRef(status);
  useEffect(() => {
    if (!workspaceState?.id) return;
    const isMount = prevStatus.current === status;
    const isFinished = prevStatus.current !== "ready" && status === "ready";
    if (isMount || isFinished) {
      fetch(`/code/workspace-diff/${workspaceState.id}`).then((r) => r.json()).then((r) => {
        if (r.success) {
          setDiffStats(r);
          if (r.currentBranch) {
            setWorkspaceState((prev) => prev && r.currentBranch !== prev.featureBranch ? { ...prev, featureBranch: r.currentBranch } : prev);
          }
        }
      }).catch(() => {
      });
    }
    prevStatus.current = status;
  }, [status, workspaceState?.id]);
  useEffect(() => {
    if (!hasNavigated.current && messages.length >= 1 && status !== "ready" && window.location.pathname !== `/chat/${chatId}`) {
      hasNavigated.current = true;
      window.history.replaceState({}, "", `/chat/${chatId}`);
    }
  }, [messages.length, status, chatId]);
  const handleSend = async () => {
    if (!input.trim() && files.length === 0) return;
    const text = input;
    const isFirstMessage = messages.length === 0;
    const currentFiles = files;
    setInput("");
    setFiles([]);
    const fileParts = currentFiles.map((f) => ({
      type: "file",
      mediaType: f.file.type || "text/plain",
      url: f.previewUrl,
      filename: f.file.name,
      ...f.width && { width: f.width, height: f.height }
    }));
    await sendMessage({ text: text || void 0, files: fileParts });
    if (isFirstMessage && text) {
      fetch("/chat/finalize-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: text })
      }).then((res) => res.json()).then(({ title, codeWorkspaceId, featureBranch }) => {
        if (title) {
          window.dispatchEvent(new CustomEvent("chatTitleUpdated", { detail: { chatId, title, codeWorkspaceId, chatMode: codeMode ? "code" : "agent" } }));
        }
        if (codeWorkspaceId) {
          setWorkspaceState({ id: codeWorkspaceId, featureBranch, repo, branch, containerName: null });
        }
      }).catch((err) => console.error("Failed to finalize chat:", err));
    }
  };
  const handleRetry = useCallback((message) => {
    if (message.role === "assistant") {
      regenerate({ messageId: message.id });
    } else {
      const idx = messages.findIndex((m) => m.id === message.id);
      const nextAssistant = messages.slice(idx + 1).find((m) => m.role === "assistant");
      if (nextAssistant) {
        regenerate({ messageId: nextAssistant.id });
      } else {
        const text = message.parts?.filter((p) => p.type === "text").map((p) => p.text).join("\n") || message.content || "";
        if (text.trim()) {
          sendMessage({ text });
        }
      }
    }
  }, [messages, regenerate, sendMessage]);
  const handleEdit = useCallback((message, newText) => {
    const idx = messages.findIndex((m) => m.id === message.id);
    if (idx === -1) return;
    setMessages(messages.slice(0, idx));
    sendMessage({ text: newText });
  }, [messages, setMessages, sendMessage]);
  const isInteractiveActive = !!workspaceState?.containerName;
  const [togglingMode, setTogglingMode] = useState(false);
  const handleInteractiveToggle = useCallback(async () => {
    if (!workspaceState?.id || togglingMode || isInteractiveActive) return;
    setTogglingMode(true);
    try {
      const { startInteractiveMode } = await import("../../code/actions.js");
      const result = await startInteractiveMode(workspaceState.id);
      if (result.containerName) {
        setWorkspaceState((prev) => ({ ...prev, containerName: result.containerName }));
      }
    } catch (err) {
      console.error("Failed to toggle mode:", err);
    } finally {
      setTogglingMode(false);
    }
  }, [workspaceState?.id, togglingMode, isInteractiveActive]);
  const codeModeSettings = {
    mode: codeModeType,
    onModeChange: setCodeModeType,
    isInteractiveActive,
    onInteractiveToggle: handleInteractiveToggle,
    togglingMode,
    codingAgent,
    codingModel,
    availableAgents,
    onAgentChange: setCodingAgent,
    onModelChange: setCodingModel
  };
  const handleBranchChange = useCallback((newBranch) => {
    setBranch(newBranch);
    if (workspaceState?.id) {
      fetch("/code/workspace-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspaceState.id, branch: newBranch })
      }).catch(() => {
      });
    }
  }, [workspaceState?.id]);
  const handleDiffStatsRefresh = useCallback(async () => {
    if (!workspaceState?.id) return null;
    try {
      const r = await fetch(`/code/workspace-diff/${workspaceState.id}`);
      const data = await r.json();
      if (data.success) {
        setDiffStats(data);
        if (data.currentBranch) {
          setWorkspaceState((prev) => prev && data.currentBranch !== prev.featureBranch ? { ...prev, featureBranch: data.currentBranch } : prev);
        }
        return data;
      }
    } catch {
    }
    return null;
  }, [workspaceState?.id]);
  return /* @__PURE__ */ jsxs("div", { className: "flex h-svh flex-col", children: [
    /* @__PURE__ */ jsx(ChatHeader, { chatId }),
    messages.length === 0 ? /* @__PURE__ */ jsx("div", { className: "flex flex-1 flex-col items-center justify-center px-2.5 md:px-6", children: /* @__PURE__ */ jsxs("div", { className: "w-full max-w-4xl", children: [
      /* @__PURE__ */ jsx(Greeting, { codeMode }),
      error && /* @__PURE__ */ jsx("div", { className: "mt-4 mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive", children: error.message || "Something went wrong. Please try again." }),
      /* @__PURE__ */ jsx("div", { className: "mt-4", children: /* @__PURE__ */ jsx(
        ChatInput,
        {
          input,
          setInput,
          onSubmit: handleSend,
          status,
          stop,
          files,
          setFiles,
          codeMode,
          codeModeSettings
        }
      ) }),
      /* @__PURE__ */ jsxs("div", { className: "mt-5 pb-8", children: [
        codeMode && /* @__PURE__ */ jsx(
          RepoBranchPicker,
          {
            repo,
            onRepoChange: setRepo,
            branch,
            onBranchChange: handleBranchChange,
            getRepositories: fetchRepositories,
            getBranches: fetchBranches
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-center gap-3 mt-4", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => {
                const next = !codeMode;
                setCodeMode(next);
                if (next) {
                  setRepo("");
                  setBranch("");
                } else if (defaultRepo) {
                  setRepo(defaultRepo);
                  setBranch("main");
                } else {
                  setRepo("");
                  setBranch("");
                }
              },
              className: "inline-flex items-center gap-2 group",
              role: "switch",
              "aria-checked": codeMode,
              "aria-label": "Toggle Code mode",
              children: [
                /* @__PURE__ */ jsx("span", { className: cn(
                  "text-xs transition-colors",
                  !codeMode ? "font-bold text-foreground" : "font-medium text-muted-foreground group-hover:text-foreground"
                ), children: "Agent" }),
                /* @__PURE__ */ jsx(
                  "span",
                  {
                    className: cn(
                      "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                      codeMode ? "bg-primary" : "bg-muted-foreground/30"
                    ),
                    children: /* @__PURE__ */ jsx(
                      "span",
                      {
                        className: cn(
                          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                          codeMode && "translate-x-4"
                        )
                      }
                    )
                  }
                ),
                /* @__PURE__ */ jsx("span", { className: cn(
                  "text-xs transition-colors",
                  codeMode ? "font-bold text-foreground" : "font-medium text-muted-foreground group-hover:text-foreground"
                ), children: "Code" })
              ]
            }
          ),
          availableAgents.length > 0 && /* @__PURE__ */ jsx(
            "select",
            {
              value: codingAgent,
              onChange: (e) => setCodingAgent(e.target.value),
              className: "rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors",
              children: availableAgents.map((a) => /* @__PURE__ */ jsx("option", { value: a.value, children: a.label }, a.value))
            }
          ),
          availableAgents.length > 0 && (() => {
            const agent = availableAgents.find((a) => a.value === codingAgent);
            const models = agent?.models || [];
            return models.length > 0 ? /* @__PURE__ */ jsxs(
              "select",
              {
                value: codingModel || "",
                onChange: (e) => setCodingModel(e.target.value),
                className: "rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors",
                children: [
                  /* @__PURE__ */ jsx("option", { value: "", children: "Default model" }),
                  models.map((m) => /* @__PURE__ */ jsx("option", { value: m.value, children: m.label }, m.value))
                ]
              }
            ) : null;
          })()
        ] })
      ] })
    ] }) }) : /* @__PURE__ */ jsxs("div", { className: "flex flex-1 flex-col min-h-0 overflow-hidden relative", children: [
      showDiff && workspaceState?.id && /* @__PURE__ */ jsx("div", { className: "absolute inset-0 z-10 bg-black/50" }),
      showDiff && workspaceState?.id ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "flex-1 min-h-0 z-20 p-0 md:p-4 flex flex-col", children: /* @__PURE__ */ jsx(
          DiffViewer,
          {
            workspaceId: workspaceState.id,
            diffStats,
            onClose: () => setShowDiff(false)
          }
        ) }),
        /* @__PURE__ */ jsx("div", { className: "z-20 px-4 pb-4", children: /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full max-w-4xl", children: [
          workspaceState && /* @__PURE__ */ jsx("div", { className: "rounded-t-xl border border-b-0 border-border px-3 py-2.5 bg-background", children: /* @__PURE__ */ jsx(
            WorkspaceBar,
            {
              repo,
              branch,
              onBranchChange: handleBranchChange,
              getBranches: fetchBranches,
              workspace: workspaceState,
              diffStats,
              onDiffStatsRefresh: handleDiffStatsRefresh,
              onShowDiff: () => setShowDiff(true)
            }
          ) }),
          /* @__PURE__ */ jsx(
            ChatInput,
            {
              bare: true,
              input,
              setInput,
              onSubmit: handleSend,
              status,
              stop,
              files,
              setFiles,
              disabled: isInteractiveActive,
              placeholder: isInteractiveActive ? "Interactive mode is active." : "Send a message...",
              className: workspaceState ? "rounded-t-none" : void 0,
              codeMode,
              codeModeSettings
            }
          )
        ] }) })
      ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(Messages, { messages, status, onRetry: handleRetry, onEdit: handleEdit }),
        error && /* @__PURE__ */ jsx("div", { className: "mx-auto w-full max-w-4xl px-2 md:px-4", children: /* @__PURE__ */ jsx("div", { className: "rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive", children: error.message || "Something went wrong. Please try again." }) }),
        /* @__PURE__ */ jsxs("div", { className: "mx-auto w-full max-w-4xl px-4 pb-4 md:px-6", children: [
          isInteractiveActive && /* @__PURE__ */ jsxs(
            "a",
            {
              href: `/code/${workspaceState?.id}`,
              className: "flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 mb-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors",
              children: [
                /* @__PURE__ */ jsx("span", { className: "h-2 w-2 rounded-full bg-green-500 animate-pulse" }),
                "Click here to access Interactive Mode"
              ]
            }
          ),
          workspaceState && /* @__PURE__ */ jsx("div", { className: "rounded-t-xl border border-b-0 border-border px-3 py-2.5", children: /* @__PURE__ */ jsx(
            WorkspaceBar,
            {
              repo,
              branch,
              onBranchChange: handleBranchChange,
              getBranches: fetchBranches,
              workspace: workspaceState,
              diffStats,
              onDiffStatsRefresh: handleDiffStatsRefresh,
              onShowDiff: () => setShowDiff(true)
            }
          ) }),
          /* @__PURE__ */ jsx(
            ChatInput,
            {
              bare: true,
              input,
              setInput,
              onSubmit: handleSend,
              status,
              stop,
              files,
              setFiles,
              disabled: isInteractiveActive,
              placeholder: isInteractiveActive ? "Interactive mode is active." : "Send a message...",
              className: workspaceState ? "rounded-t-none" : void 0,
              codeMode,
              codeModeSettings
            }
          )
        ] })
      ] })
    ] })
  ] });
}
export {
  Chat
};
