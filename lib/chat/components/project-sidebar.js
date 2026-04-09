"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { timeAgo } from "./settings-shared.js";
import { useChatNav } from "./chat-nav-context.js";
import { FolderIcon, ChevronDownIcon, ChevronRightIcon, CirclePlusIcon } from "./icons.js";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton
} from "./ui/sidebar.js";
function ThreadItem({ thread, isActive, onNavigate }) {
  const updatedAt = thread.updatedAt ? new Date(thread.updatedAt).getTime() : null;
  const isReady = thread.containerStatus === "ready";
  return /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(
    SidebarMenuButton,
    {
      isActive,
      className: "group flex items-center gap-2 text-sm",
      onClick: (e) => {
        e.preventDefault();
        onNavigate(thread.id);
      },
      children: [
        /* @__PURE__ */ jsx("span", { className: "flex-1 truncate", children: thread.title || "Untitled" }),
        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 shrink-0", children: [
          updatedAt && /* @__PURE__ */ jsx("span", { className: "text-xs text-muted-foreground", children: timeAgo(updatedAt).replace(" ago", "") }),
          isReady && /* @__PURE__ */ jsx("span", { className: "inline-block h-2 w-2 rounded-full bg-green-500", title: "Container ready" })
        ] })
      ]
    }
  ) });
}
function ProjectFolder({ project, threads, expanded, onToggle, activeChatId, onNavigate }) {
  const visibleThreads = threads.slice(0, 3);
  const totalCount = threads.length;
  const hasMore = totalCount > 3;
  return /* @__PURE__ */ jsxs(SidebarGroup, { className: "pt-1", children: [
    /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: onToggle,
        className: "flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors",
        children: [
          /* @__PURE__ */ jsx(FolderIcon, { size: 14 }),
          /* @__PURE__ */ jsx("span", { className: "flex-1 truncate text-left", children: project.title || project.name || "Untitled" }),
          expanded ? /* @__PURE__ */ jsx(ChevronDownIcon, { size: 14, className: "text-muted-foreground" }) : /* @__PURE__ */ jsx(ChevronRightIcon, { size: 14, className: "text-muted-foreground" })
        ]
      }
    ),
    expanded && /* @__PURE__ */ jsx(SidebarGroupContent, { children: /* @__PURE__ */ jsxs(SidebarMenu, { children: [
      visibleThreads.map((thread) => /* @__PURE__ */ jsx(
        ThreadItem,
        {
          thread,
          isActive: thread.id === activeChatId,
          onNavigate
        },
        thread.id
      )),
      hasMore && /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(
        "a",
        {
          href: `/chats?project=${encodeURIComponent(project.id)}`,
          className: "flex items-center px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors",
          children: [
            "See all (",
            totalCount,
            ")"
          ]
        }
      ) }),
      visibleThreads.length === 0 && /* @__PURE__ */ jsx("li", { className: "px-3 py-1 text-xs text-muted-foreground", children: "No threads yet" })
    ] }) })
  ] });
}
function ProjectSidebar({ user }) {
  const [projects, setProjects] = useState([]);
  const [looseChats, setLooseChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState(/* @__PURE__ */ new Set());
  const { activeChatId, navigateToChat } = useChatNav();
  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      try {
        const r = await fetch("/projects/list");
        if (!r.ok) throw new Error("Failed to fetch projects");
        const data = await r.json();
        if (!cancelled) {
          const projectList = Array.isArray(data) ? data : data.projects || [];
          const loose = Array.isArray(data) ? [] : data.looseChats || [];
          setProjects(projectList);
          setLooseChats(loose);
          const ids = new Set(projectList.map((p) => p.id));
          if (loose.length > 0) ids.add("__recent__");
          setExpandedProjects(ids);
        }
      } catch (err) {
        console.warn("[project-sidebar] Failed to load projects:", err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };
  const handleNavigate = (chatId) => {
    navigateToChat(chatId);
  };
  if (loading) {
    return /* @__PURE__ */ jsx(SidebarGroup, { children: /* @__PURE__ */ jsx(SidebarGroupContent, { children: /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-2 px-2", children: [...Array(3)].map((_, i) => /* @__PURE__ */ jsx("div", { className: "h-8 animate-pulse rounded-md bg-border/50" }, i)) }) }) });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    projects.map((project) => /* @__PURE__ */ jsx(
      ProjectFolder,
      {
        project,
        threads: project.recentChats || [],
        expanded: expandedProjects.has(project.id),
        onToggle: () => toggleProject(project.id),
        activeChatId,
        onNavigate: handleNavigate
      },
      project.id
    )),
    looseChats.length > 0 && /* @__PURE__ */ jsx(
      ProjectFolder,
      {
        project: { id: "__recent__", name: "Recent" },
        threads: looseChats,
        expanded: expandedProjects.has("__recent__"),
        onToggle: () => toggleProject("__recent__"),
        activeChatId,
        onNavigate: handleNavigate
      }
    ),
    projects.length === 0 && looseChats.length === 0 && /* @__PURE__ */ jsx(SidebarGroup, { children: /* @__PURE__ */ jsx(SidebarGroupContent, { children: /* @__PURE__ */ jsx("p", { className: "px-4 py-2 text-sm text-muted-foreground", children: "No projects yet." }) }) }),
    /* @__PURE__ */ jsx(SidebarGroup, { className: "pt-2", children: /* @__PURE__ */ jsx(SidebarGroupContent, { children: /* @__PURE__ */ jsx(SidebarMenu, { children: /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(
      SidebarMenuButton,
      {
        className: "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
        onClick: () => {
          navigateToChat(null);
        },
        children: [
          /* @__PURE__ */ jsx(CirclePlusIcon, { size: 14 }),
          /* @__PURE__ */ jsx("span", { children: "Add project" })
        ]
      }
    ) }) }) }) })
  ] });
}
export {
  ProjectSidebar
};
