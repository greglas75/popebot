"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { CirclePlusIcon, PanelLeftIcon, MessageIcon, ClusterIcon, BellIcon, ContainerIcon, ArrowUpCircleIcon, LifeBuoyIcon, GitPullRequestIcon } from "./icons.js";
import { ProjectSidebar } from "./project-sidebar.js";
import { SidebarHistory } from "./sidebar-history.js";
import { SidebarUserNav } from "./sidebar-user-nav.js";
import { UpgradeDialog } from "./upgrade-dialog.js";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar
} from "./ui/sidebar.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip.js";
import { useChatNav } from "./chat-nav-context.js";
function AppSidebar({ user }) {
  const { navigateToChat } = useChatNav();
  const { state, open, setOpenMobile, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const [unreadCount, setUnreadCount] = useState(0);
  const [prCount, setPrCount] = useState(0);
  const [version, setVersion] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [changelog, setChangelog] = useState(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  useEffect(() => {
    function fetchCounts() {
      fetch("/chats/counts").then((r) => r.json()).then(({ notifications, pullRequests }) => {
        setUnreadCount(notifications || 0);
        setPrCount(pullRequests || 0);
      }).catch(() => {
      });
    }
    fetchCounts();
    const interval = setInterval(fetchCounts, 10 * 60 * 1e3);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    fetch("/admin/app-version").then((r) => r.json()).then(({ version: version2, updateAvailable: updateAvailable2, changelog: changelog2 }) => {
      setVersion(version2);
      setUpdateAvailable(updateAvailable2);
      setChangelog(changelog2);
    }).catch(() => {
    });
  }, []);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(Sidebar, { children: [
      /* @__PURE__ */ jsxs(SidebarHeader, { children: [
        /* @__PURE__ */ jsxs("div", { className: collapsed ? "flex justify-center" : "flex items-center justify-between", children: [
          !collapsed && /* @__PURE__ */ jsxs("span", { className: "px-2 font-semibold text-lg", children: [
            "ThePopeBot",
            version && /* @__PURE__ */ jsxs("span", { className: "text-[11px] font-normal text-muted-foreground", children: [
              " v",
              version
            ] })
          ] }),
          /* @__PURE__ */ jsx(
            "button",
            {
              className: "inline-flex shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-background hover:text-foreground",
              onClick: toggleSidebar,
              "aria-label": "Toggle sidebar",
              children: /* @__PURE__ */ jsx(PanelLeftIcon, { size: 16 })
            }
          )
        ] }),
        /* @__PURE__ */ jsx(SidebarMenu, { children: /* @__PURE__ */ jsx(SidebarMenuItem, { className: "mb-2", children: /* @__PURE__ */ jsxs(Tooltip, { children: [
          /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
            SidebarMenuButton,
            {
              href: "/",
              className: collapsed ? "justify-center" : "",
              onClick: (e) => {
                e.preventDefault();
                navigateToChat(null);
                setOpenMobile(false);
              },
              children: [
                /* @__PURE__ */ jsx(CirclePlusIcon, { size: 16 }),
                !collapsed && /* @__PURE__ */ jsx("span", { children: "New chat" })
              ]
            }
          ) }),
          collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "New chat" })
        ] }) }) })
      ] }),
      !collapsed && /* @__PURE__ */ jsxs(SidebarContent, { children: [
        /* @__PURE__ */ jsxs(SidebarMenu, { children: [
          /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                href: "/chats",
                className: collapsed ? "justify-center" : "",
                children: [
                  /* @__PURE__ */ jsx(MessageIcon, { size: 16 }),
                  !collapsed && /* @__PURE__ */ jsx("span", { children: "Chats" })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "Chats" })
          ] }) }),
          /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                href: "/clusters",
                className: collapsed ? "justify-center" : "",
                children: [
                  /* @__PURE__ */ jsx(ClusterIcon, { size: 16 }),
                  !collapsed && /* @__PURE__ */ jsx("span", { children: "Clusters" })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "Clusters" })
          ] }) }),
          /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                href: "/containers",
                className: collapsed ? "justify-center" : "",
                children: [
                  /* @__PURE__ */ jsx(ContainerIcon, { size: 16 }),
                  !collapsed && /* @__PURE__ */ jsx("span", { children: "Containers" })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "Containers" })
          ] }) }),
          /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                href: "/pull-requests",
                className: collapsed ? "justify-center" : "",
                children: [
                  /* @__PURE__ */ jsx(GitPullRequestIcon, { size: 16 }),
                  !collapsed && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
                    "Approvals",
                    prCount > 0 && /* @__PURE__ */ jsx("span", { className: "inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground", children: prCount })
                  ] }),
                  collapsed && prCount > 0 && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground", children: prCount })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "Approvals" })
          ] }) }),
          /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                href: "/notifications",
                className: collapsed ? "justify-center" : "",
                children: [
                  /* @__PURE__ */ jsx(BellIcon, { size: 16 }),
                  !collapsed && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
                    "Notifications",
                    unreadCount > 0 && /* @__PURE__ */ jsx("span", { className: "inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground", children: unreadCount })
                  ] }),
                  collapsed && unreadCount > 0 && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground", children: unreadCount })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "Notifications" })
          ] }) }),
          updateAvailable && /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                className: collapsed ? "justify-center" : "",
                onClick: () => setUpgradeOpen(true),
                children: [
                  /* @__PURE__ */ jsxs("span", { className: "relative", children: [
                    /* @__PURE__ */ jsx(ArrowUpCircleIcon, { size: 16 }),
                    collapsed && /* @__PURE__ */ jsx("span", { className: "absolute -top-1 -right-1 inline-block h-2 w-2 rounded-full bg-emerald-500" })
                  ] }),
                  !collapsed && /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-2", children: [
                    "Upgrade",
                    /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white", children: [
                      "v",
                      updateAvailable
                    ] })
                  ] })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsxs(TooltipContent, { side: "right", children: [
              "Upgrade to v",
              updateAvailable
            ] })
          ] }) }),
          /* @__PURE__ */ jsx(SidebarMenuItem, { children: /* @__PURE__ */ jsxs(Tooltip, { children: [
            /* @__PURE__ */ jsx(TooltipTrigger, { asChild: true, children: /* @__PURE__ */ jsxs(
              SidebarMenuButton,
              {
                href: "https://www.skool.com/ai-architects",
                target: "_blank",
                rel: "noopener noreferrer",
                className: collapsed ? "justify-center" : "",
                children: [
                  /* @__PURE__ */ jsx(LifeBuoyIcon, { size: 16 }),
                  !collapsed && /* @__PURE__ */ jsx("span", { children: "Support" })
                ]
              }
            ) }),
            collapsed && /* @__PURE__ */ jsx(TooltipContent, { side: "right", children: "Support" })
          ] }) })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "mx-4 border-t border-border" }),
        /* @__PURE__ */ jsx(ProjectSidebar, { user }),
        /* @__PURE__ */ jsx("div", { className: "mx-4 border-t border-border" }),
        /* @__PURE__ */ jsx(SidebarHistory, {})
      ] }),
      collapsed && /* @__PURE__ */ jsx("div", { className: "flex-1" }),
      /* @__PURE__ */ jsx(SidebarFooter, { children: user && /* @__PURE__ */ jsx(SidebarUserNav, { user, collapsed }) })
    ] }),
    /* @__PURE__ */ jsx(UpgradeDialog, { open: upgradeOpen, onClose: () => setUpgradeOpen(false), version, updateAvailable, changelog })
  ] });
}
export {
  AppSidebar
};
