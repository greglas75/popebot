"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect, useRef } from "react";
import { PageLayout } from "./page-layout.js";
import { AgentIcon, CodeIcon, TrashIcon, SearchIcon, PlusIcon, MoreHorizontalIcon, StarIcon, StarFilledIcon, PencilIcon } from "./icons.js";
import { getChats, deleteChat, renameChat, starChat } from "../actions.js";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu.js";
import { ConfirmDialog } from "./ui/confirm-dialog.js";
import { cn } from "../utils.js";
const isCodeChat = (chat) => chat.chatMode === "code";
const BASE_FILTERS = [
  { value: "all", label: "All", icon: null },
  { value: "chat", label: "Agent", icon: AgentIcon }
];
const CODE_FILTER = { value: "code", label: "Code", icon: CodeIcon };
function groupChatsByDate(chats) {
  const now = /* @__PURE__ */ new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 864e5);
  const last7Days = new Date(today.getTime() - 7 * 864e5);
  const last30Days = new Date(today.getTime() - 30 * 864e5);
  const groups = {
    Starred: [],
    Today: [],
    Yesterday: [],
    "Last 7 Days": [],
    "Last 30 Days": [],
    Older: []
  };
  for (const chat of chats) {
    if (chat.starred) {
      groups.Starred.push(chat);
      continue;
    }
    const date = new Date(chat.updatedAt);
    if (date >= today) {
      groups.Today.push(chat);
    } else if (date >= yesterday) {
      groups.Yesterday.push(chat);
    } else if (date >= last7Days) {
      groups["Last 7 Days"].push(chat);
    } else if (date >= last30Days) {
      groups["Last 30 Days"].push(chat);
    } else {
      groups.Older.push(chat);
    }
  }
  return groups;
}
function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1e3);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
function ChatsPage({ session }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filters = [...BASE_FILTERS, CODE_FILTER];
  const navigateToChat = (id) => {
    window.location.href = id ? `/chat/${id}` : "/";
  };
  const loadChats = async () => {
    try {
      const result = await getChats();
      setChats(result);
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadChats();
  }, []);
  useEffect(() => {
    const titleHandler = (e) => {
      const { chatId, title, codeWorkspaceId, chatMode } = e.detail;
      setChats((prev) => {
        const exists = prev.some((c) => c.id === chatId);
        if (exists) return prev.map((c) => c.id === chatId ? { ...c, title } : c);
        return [{ id: chatId, title, starred: 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), codeWorkspaceId: codeWorkspaceId || null, chatMode: chatMode || "agent" }, ...prev];
      });
    };
    const starHandler = (e) => {
      const { chatId, starred } = e.detail;
      setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, starred } : c));
    };
    const deleteHandler = (e) => {
      const { chatId } = e.detail;
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    };
    window.addEventListener("chatTitleUpdated", titleHandler);
    window.addEventListener("chatStarUpdated", starHandler);
    window.addEventListener("chatDeleted", deleteHandler);
    return () => {
      window.removeEventListener("chatTitleUpdated", titleHandler);
      window.removeEventListener("chatStarUpdated", starHandler);
      window.removeEventListener("chatDeleted", deleteHandler);
    };
  }, []);
  const handleDelete = async (chatId) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    const { success } = await deleteChat(chatId);
    if (success) {
      window.dispatchEvent(new CustomEvent("chatDeleted", { detail: { chatId } }));
    } else {
      loadChats();
    }
  };
  const handleStar = async (chatId) => {
    const newStarred = chats.find((c) => c.id === chatId)?.starred ? 0 : 1;
    setChats(
      (prev) => prev.map((c) => c.id === chatId ? { ...c, starred: newStarred } : c)
    );
    const { success } = await starChat(chatId);
    if (success) {
      window.dispatchEvent(new CustomEvent("chatStarUpdated", { detail: { chatId, starred: newStarred } }));
    } else {
      loadChats();
    }
  };
  const handleRename = async (chatId, title) => {
    setChats(
      (prev) => prev.map((c) => c.id === chatId ? { ...c, title } : c)
    );
    const { success } = await renameChat(chatId, title);
    if (success) {
      window.dispatchEvent(new CustomEvent("chatTitleUpdated", { detail: { chatId, title } }));
    } else {
      loadChats();
    }
  };
  const typeFiltered = !filter || filter === "all" ? chats : filter === "code" ? chats.filter(isCodeChat) : chats.filter((c) => !isCodeChat(c));
  const filtered = query ? typeFiltered.filter((c) => c.title?.toLowerCase().includes(query.toLowerCase())) : typeFiltered;
  const grouped = groupChatsByDate(filtered);
  return /* @__PURE__ */ jsxs(PageLayout, { session, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-6", children: [
      /* @__PURE__ */ jsx("h1", { className: "text-2xl font-semibold", children: "Chats" }),
      /* @__PURE__ */ jsxs(
        "a",
        {
          href: "/",
          onClick: (e) => {
            e.preventDefault();
            navigateToChat(null);
          },
          className: "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90",
          style: { textDecoration: "inherit" },
          children: [
            /* @__PURE__ */ jsx(PlusIcon, { size: 14 }),
            "New chat"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative mb-4", children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          placeholder: "Search your chats...",
          value: query,
          onChange: (e) => setQuery(e.target.value),
          className: "w-full rounded-md border border-input bg-background px-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        }
      ),
      /* @__PURE__ */ jsx("div", { className: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none", children: /* @__PURE__ */ jsx(SearchIcon, { size: 16 }) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "flex items-center gap-1 mb-4", children: filters.map(({ value, label, icon: Icon }) => /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setFilter(value),
        className: cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          filter === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        ),
        children: [
          Icon && /* @__PURE__ */ jsx(Icon, { size: 14 }),
          label
        ]
      },
      value
    )) }),
    /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground mb-4", children: [
      filtered.length,
      " ",
      filtered.length === 1 ? "chat" : "chats"
    ] }),
    loading ? /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-3", children: [...Array(5)].map((_, i) => /* @__PURE__ */ jsx("div", { className: "h-14 animate-pulse rounded-md bg-border/50" }, i)) }) : filtered.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground py-8 text-center", children: query ? "No chats match your search." : "No chats yet. Start a conversation!" }) : /* @__PURE__ */ jsx("div", { className: "flex flex-col", children: Object.entries(grouped).map(
      ([label, groupChats]) => groupChats.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2", children: label }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-col divide-y divide-border", children: groupChats.map((chat) => /* @__PURE__ */ jsx(
          ChatRow,
          {
            chat,
            onNavigate: navigateToChat,
            onDelete: handleDelete,
            onStar: handleStar,
            onRename: handleRename
          },
          chat.id
        )) })
      ] }, label) : null
    ) })
  ] });
}
function ChatRow({ chat, onNavigate, onDelete, onStar, onRename }) {
  const [hovered, setHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title || "");
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const showMenu = hovered || dropdownOpen;
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);
  const startRename = () => {
    setEditTitle(chat.title || "");
    setEditing(true);
  };
  const saveRename = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== chat.title) {
      onRename(chat.id, trimmed);
    }
    setEditing(false);
  };
  const cancelRename = () => {
    setEditing(false);
    setEditTitle(chat.title || "");
  };
  return /* @__PURE__ */ jsxs(
    "a",
    {
      href: `/chat/${chat.id}`,
      className: "relative group flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/50 rounded-md",
      style: { textDecoration: "inherit", color: "inherit" },
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onClick: (e) => {
        if (editing) {
          e.preventDefault();
          return;
        }
        if (menuRef.current && menuRef.current.contains(e.target)) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onNavigate(chat.id);
      },
      children: [
        /* @__PURE__ */ jsxs("span", { className: "relative", children: [
          chat.chatMode === "code" ? /* @__PURE__ */ jsx(CodeIcon, { size: 16 }) : /* @__PURE__ */ jsx(AgentIcon, { size: 16 }),
          chat.hasChanges ? /* @__PURE__ */ jsx("span", { className: "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" }) : null
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
          editing ? /* @__PURE__ */ jsx(
            "input",
            {
              ref: inputRef,
              type: "text",
              value: editTitle,
              onChange: (e) => setEditTitle(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") saveRename();
                if (e.key === "Escape") cancelRename();
              },
              onBlur: saveRename,
              onClick: (e) => e.stopPropagation(),
              className: "w-full text-sm bg-background border border-input rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
            }
          ) : /* @__PURE__ */ jsx(
            "span",
            {
              className: "text-sm truncate block",
              onDoubleClick: (e) => {
                e.stopPropagation();
                startRename();
              },
              children: chat.title || "New Chat"
            }
          ),
          /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground", children: [
            "Last message ",
            timeAgo(chat.updatedAt)
          ] })
        ] }),
        !editing && /* @__PURE__ */ jsx("div", { ref: menuRef, className: cn(
          "shrink-0",
          showMenu ? "opacity-100" : "opacity-100 md:opacity-0 md:pointer-events-none"
        ), children: /* @__PURE__ */ jsxs(DropdownMenu, { open: dropdownOpen, onOpenChange: setDropdownOpen, children: [
          /* @__PURE__ */ jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsx(
            "button",
            {
              className: cn(
                "rounded-md p-1.5",
                "text-muted-foreground hover:text-foreground hover:bg-muted"
              ),
              "aria-label": "Chat options",
              children: /* @__PURE__ */ jsx(MoreHorizontalIcon, { size: 14 })
            }
          ) }),
          /* @__PURE__ */ jsxs(DropdownMenuContent, { align: "end", side: "bottom", children: [
            /* @__PURE__ */ jsxs(
              DropdownMenuItem,
              {
                onClick: (e) => {
                  e.stopPropagation();
                  onStar(chat.id);
                },
                children: [
                  chat.starred ? /* @__PURE__ */ jsx(StarFilledIcon, { size: 14 }) : /* @__PURE__ */ jsx(StarIcon, { size: 14 }),
                  chat.starred ? "Unstar" : "Star"
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              DropdownMenuItem,
              {
                onClick: (e) => {
                  e.stopPropagation();
                  startRename();
                },
                children: [
                  /* @__PURE__ */ jsx(PencilIcon, { size: 14 }),
                  "Rename"
                ]
              }
            ),
            /* @__PURE__ */ jsx(DropdownMenuSeparator, {}),
            /* @__PURE__ */ jsxs(
              DropdownMenuItem,
              {
                className: "text-destructive hover:text-destructive",
                onClick: (e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                },
                children: [
                  /* @__PURE__ */ jsx(TrashIcon, { size: 14 }),
                  "Delete"
                ]
              }
            )
          ] })
        ] }) }),
        /* @__PURE__ */ jsx(
          ConfirmDialog,
          {
            open: confirmDelete,
            title: "Delete chat?",
            description: "This will permanently delete this chat and all its messages.",
            confirmLabel: "Delete",
            onConfirm: () => {
              setConfirmDelete(false);
              onDelete(chat.id);
            },
            onCancel: () => setConfirmDelete(false)
          }
        )
      ]
    }
  );
}
export {
  ChatsPage
};
