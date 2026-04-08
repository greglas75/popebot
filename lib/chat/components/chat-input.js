"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useCallback, useState } from "react";
import { SendIcon, StopIcon, PaperclipIcon, XIcon, FileTextIcon, MicIcon } from "./icons.js";
import { useVoiceInput } from "../../voice/use-voice-input.js";
const getVoiceTokenFetch = () => fetch("/chat/voice-token").then((r) => r.json()).catch(() => ({ error: "Failed to get voice token" }));
import { VoiceBars } from "./voice-bars.jsx";
import { cn } from "../utils.js";
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/css",
  "text/javascript",
  "text/x-python",
  "text/x-typescript",
  "application/json"
];
const MAX_FILES = 5;
function isAcceptedType(file) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = file.name?.split(".").pop()?.toLowerCase();
  const textExts = ["txt", "md", "csv", "json", "js", "ts", "jsx", "tsx", "py", "html", "css", "yml", "yaml", "xml", "sh", "bash", "rb", "go", "rs", "java", "c", "cpp", "h", "hpp"];
  return textExts.includes(ext);
}
function getEffectiveType(file) {
  if (ACCEPTED_TYPES.includes(file.type) && file.type !== "") return file.type;
  const ext = file.name?.split(".").pop()?.toLowerCase();
  const extMap = {
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    js: "text/javascript",
    ts: "text/x-typescript",
    jsx: "text/javascript",
    tsx: "text/x-typescript",
    py: "text/x-python",
    html: "text/html",
    css: "text/css",
    yml: "text/plain",
    yaml: "text/plain",
    xml: "text/plain",
    sh: "text/plain",
    bash: "text/plain",
    rb: "text/plain",
    go: "text/plain",
    rs: "text/plain",
    java: "text/plain",
    c: "text/plain",
    cpp: "text/plain",
    h: "text/plain",
    hpp: "text/plain"
  };
  return extMap[ext] || file.type || "text/plain";
}
function ChatInput({ input, setInput, onSubmit, status, stop, files, setFiles, disabled = false, placeholder = "Send a message...", canSendOverride, bare = false, className, codeMode = false, codeModeSettings }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const [partialText, setPartialText] = useState("");
  const dropdownRef = useRef(null);
  const isStreaming = status === "streaming" || status === "submitted";
  const volumeRef = useRef(0);
  const { voiceAvailable, isConnecting, isRecording, startRecording, stopRecording } = useVoiceInput({
    getToken: getVoiceTokenFetch,
    onVolumeChange: (rms) => {
      volumeRef.current = rms;
    },
    onTranscript: (text) => {
      setInput((prev) => {
        const needsSpace = prev && !prev.endsWith(" ");
        return prev + (needsSpace ? " " : "") + text;
      });
    },
    onPartialTranscript: (text) => setPartialText(text),
    onError: (err) => console.error("[voice]", err)
  });
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    textarea.scrollTop = textarea.scrollHeight;
  }, []);
  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!modeDropdownOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setModeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modeDropdownOpen]);
  const handleFiles = useCallback(async (fileList) => {
    const accepted = Array.from(fileList).filter(isAcceptedType);
    if (accepted.length === 0) return;
    const toProcess = accepted.slice(0, MAX_FILES);
    const processed = await Promise.all(toProcess.map(
      (file) => (async () => {
        const previewUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.onabort = () => reject(new Error("File read aborted"));
          reader.readAsDataURL(file);
        });
        let width, height;
        if (file.type.startsWith("image/")) {
          try {
            const bitmap = await createImageBitmap(file);
            width = bitmap.width;
            height = bitmap.height;
            bitmap.close();
          } catch {
          }
        }
        return { file, previewUrl, width, height };
      })().catch((err) => {
        console.warn(`[chat-input] Failed to read file "${file.name}":`, err?.message || err);
        return null;
      })
    ));
    const valid = processed.filter(Boolean);
    if (valid.length > 0) {
      setFiles((current) => {
        const remaining = MAX_FILES - current.length;
        return remaining > 0 ? [...current, ...valid.slice(0, remaining)] : current;
      });
    }
  }, [setFiles]);
  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };
  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (disabled || !input.trim() && !partialText.trim() && files.length === 0 || isStreaming) return;
    if (canSendOverride !== void 0 && !canSendOverride) return;
    if (partialText) {
      const needsSpace = input && !input.endsWith(" ");
      setInput(input + (needsSpace ? " " : "") + partialText);
    }
    setPartialText("");
    onSubmit();
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) {
      handleFiles(e.dataTransfer.files);
    }
  };
  const canSend = canSendOverride !== void 0 ? canSendOverride && (input.trim() || files.length > 0) : input.trim() || files.length > 0;
  if (disabled && !isStreaming) {
    const disabledContent = /* @__PURE__ */ jsx("div", { className: cn("flex flex-col rounded-xl border border-border bg-muted p-2", className), children: /* @__PURE__ */ jsx("div", { className: "flex items-center px-2 py-1.5", children: /* @__PURE__ */ jsx("span", { className: "text-sm text-muted-foreground", children: placeholder }) }) });
    if (bare) return disabledContent;
    return /* @__PURE__ */ jsx("div", { className: "mx-auto w-full max-w-4xl px-1.5 pb-[max(1rem,var(--safe-area-bottom))] md:px-6", children: disabledContent });
  }
  const formContent = /* @__PURE__ */ jsx("form", { onSubmit: handleSubmit, className: "relative", children: /* @__PURE__ */ jsxs(
    "div",
    {
      className: cn(
        "flex flex-col rounded-xl border bg-muted p-2 transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        className
      ),
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      children: [
        files.length > 0 && /* @__PURE__ */ jsx("div", { className: "mb-2 flex gap-2 overflow-x-auto px-1 py-1", children: files.map((f, i) => {
          const isImage = f.file.type.startsWith("image/");
          return /* @__PURE__ */ jsxs("div", { className: "group relative flex-shrink-0", children: [
            isImage ? /* @__PURE__ */ jsx(
              "img",
              {
                src: f.previewUrl,
                alt: f.file.name,
                className: "h-16 w-16 rounded-lg object-cover"
              }
            ) : /* @__PURE__ */ jsxs("div", { className: "flex h-16 items-center gap-1.5 rounded-lg bg-foreground/10 px-3", children: [
              /* @__PURE__ */ jsx(FileTextIcon, { size: 14 }),
              /* @__PURE__ */ jsx("span", { className: "max-w-[100px] truncate text-xs", children: f.file.name })
            ] }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => removeFile(i),
                className: "absolute -right-1.5 -top-1.5 hidden rounded-full bg-foreground p-0.5 text-background group-hover:flex items-center justify-center",
                "aria-label": `Remove ${f.file.name}`,
                children: /* @__PURE__ */ jsx(XIcon, { size: 10 })
              }
            )
          ] }, i);
        }) }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            ref: textareaRef,
            value: input + (partialText ? (input && !input.endsWith(" ") ? " " : "") + partialText : ""),
            onChange: (e) => {
              setInput(e.target.value);
              setPartialText("");
            },
            onKeyDown: handleKeyDown,
            placeholder,
            rows: 1,
            className: cn(
              "w-full resize-none bg-transparent px-2 py-1.5 text-sm text-foreground",
              "placeholder:text-muted-foreground focus:outline-none",
              "min-h-[84px] md:min-h-0 max-h-[40vh] md:max-h-[200px]"
            ),
            disabled: isStreaming
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => fileInputRef.current?.click(),
                className: "inline-flex items-center justify-center rounded-lg p-2.5 text-muted-foreground hover:text-foreground",
                "aria-label": "Attach files",
                disabled: isStreaming,
                children: /* @__PURE__ */ jsx(PaperclipIcon, { size: 16 })
              }
            ),
            codeModeSettings && /* @__PURE__ */ jsxs("div", { className: "relative", ref: dropdownRef, children: [
              /* @__PURE__ */ jsxs(
                "button",
                {
                  type: "button",
                  onClick: () => setModeDropdownOpen((prev) => !prev),
                  className: cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    codeModeSettings.mode === "code" ? "bg-green-500/15 text-green-500 hover:bg-green-500/25" : codeModeSettings.mode === "job" ? "bg-blue-500/15 text-blue-500 hover:bg-blue-500/25" : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  ),
                  children: [
                    codeModeSettings.mode === "code" ? "Code" : codeModeSettings.mode === "job" ? "Job" : "Plan",
                    " \u25BE"
                  ]
                }
              ),
              modeDropdownOpen && /* @__PURE__ */ jsxs("div", { className: "absolute bottom-full left-0 mb-1 rounded-lg border border-border bg-background shadow-lg py-1 min-w-[100px] z-50", children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      codeModeSettings.onModeChange("plan");
                      setModeDropdownOpen(false);
                    },
                    className: cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                      codeModeSettings.mode === "plan" ? "text-destructive font-medium" : "text-foreground"
                    ),
                    children: "Plan"
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      codeModeSettings.onModeChange("code");
                      setModeDropdownOpen(false);
                    },
                    className: cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                      codeModeSettings.mode === "code" ? "text-green-500 font-medium" : "text-foreground"
                    ),
                    children: "Code"
                  }
                ),
                !codeMode && /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      codeModeSettings.onModeChange("job");
                      setModeDropdownOpen(false);
                    },
                    className: cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                      codeModeSettings.mode === "job" ? "text-blue-500 font-medium" : "text-foreground"
                    ),
                    children: "Job"
                  }
                )
              ] })
            ] }),
            codeModeSettings?.availableAgents?.length > 0 && /* @__PURE__ */ jsx(
              "select",
              {
                value: codeModeSettings.codingAgent || "",
                onChange: (e) => codeModeSettings.onAgentChange?.(e.target.value),
                className: "rounded-md border-0 bg-muted-foreground/10 px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none transition-colors cursor-pointer",
                children: codeModeSettings.availableAgents.map((a) => /* @__PURE__ */ jsx("option", { value: a.value, children: a.label }, a.value))
              }
            ),
            (() => {
              const agent = codeModeSettings?.availableAgents?.find((a) => a.value === codeModeSettings?.codingAgent);
              const models = agent?.models || [];
              return models.length > 0 ? /* @__PURE__ */ jsxs(
                "select",
                {
                  value: codeModeSettings?.codingModel || "",
                  onChange: (e) => codeModeSettings?.onModelChange?.(e.target.value),
                  className: "rounded-md border-0 bg-muted-foreground/10 px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none transition-colors cursor-pointer",
                  children: [
                    /* @__PURE__ */ jsx("option", { value: "", children: "Default" }),
                    models.map((m) => /* @__PURE__ */ jsx("option", { value: m.value, children: m.label }, m.value))
                  ]
                }
              ) : null;
            })(),
            codeModeSettings && !codeModeSettings.isInteractiveActive && /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: codeModeSettings.onInteractiveToggle,
                disabled: codeModeSettings.togglingMode || codeModeSettings.isInteractiveActive,
                className: "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors",
                children: [
                  codeModeSettings.togglingMode && /* @__PURE__ */ jsxs("svg", { className: "animate-spin h-3 w-3", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [
                    /* @__PURE__ */ jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }),
                    /* @__PURE__ */ jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
                  ] }),
                  /* @__PURE__ */ jsx(
                    "span",
                    {
                      className: cn(
                        "relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors duration-200",
                        codeModeSettings.isInteractiveActive ? "bg-primary" : "bg-muted-foreground/30"
                      ),
                      children: /* @__PURE__ */ jsx(
                        "span",
                        {
                          className: cn(
                            "absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform duration-200",
                            codeModeSettings.isInteractiveActive && "translate-x-2.5"
                          )
                        }
                      )
                    }
                  ),
                  codeModeSettings.togglingMode ? "Launching..." : "Interactive"
                ]
              }
            ),
            /* @__PURE__ */ jsx(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                multiple: true,
                accept: "image/*,application/pdf,text/*,application/json,.md,.csv,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.yml,.yaml,.xml,.sh,.rb,.go,.rs,.java,.c,.cpp,.h",
                className: "hidden",
                onChange: (e) => {
                  if (e.target.files?.length) handleFiles(e.target.files);
                  e.target.value = "";
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
            voiceAvailable && !isStreaming && /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: isRecording ? stopRecording : startRecording,
                disabled: isConnecting,
                className: cn(
                  "inline-flex items-center justify-center rounded-lg p-2.5",
                  isConnecting ? "bg-muted-foreground/20 text-muted-foreground cursor-wait animate-pulse" : isRecording ? "bg-destructive text-white hover:opacity-80" : "bg-background text-foreground border border-border hover:bg-muted"
                ),
                "aria-label": isConnecting ? "Connecting..." : isRecording ? "Stop recording" : "Start voice input",
                children: isRecording ? /* @__PURE__ */ jsx(VoiceBars, { volumeRef, isRecording }) : /* @__PURE__ */ jsx(MicIcon, { size: 16 })
              }
            ),
            isStreaming ? /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: stop,
                className: "inline-flex items-center justify-center rounded-lg bg-foreground p-2.5 text-background hover:opacity-80",
                "aria-label": "Stop generating",
                children: /* @__PURE__ */ jsx(StopIcon, { size: 16 })
              }
            ) : /* @__PURE__ */ jsx(
              "button",
              {
                type: "submit",
                disabled: !canSend,
                className: cn(
                  "inline-flex items-center justify-center rounded-lg p-2.5",
                  canSend ? "bg-foreground text-background hover:opacity-80" : "bg-muted-foreground/20 text-muted-foreground cursor-not-allowed"
                ),
                "aria-label": "Send message",
                children: /* @__PURE__ */ jsx(SendIcon, { size: 16 })
              }
            )
          ] })
        ] })
      ]
    }
  ) });
  if (bare) return formContent;
  return /* @__PURE__ */ jsx("div", { className: "mx-auto w-full max-w-4xl px-1.5 pb-[max(1rem,var(--safe-area-bottom))] md:px-6", children: formContent });
}
export {
  ChatInput
};
