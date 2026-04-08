"use client";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { ClusterIcon, TrashIcon, SearchIcon, PlusIcon, PencilIcon } from "../../chat/components/icons.js";
import { getClusters, deleteCluster, createCluster } from "../actions.js";
import { ConfirmDialog } from "../../chat/components/ui/confirm-dialog.js";
import { cn } from "../../chat/utils.js";
function groupByDate(items) {
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
  for (const item of items) {
    if (item.starred) {
      groups.Starred.push(item);
      continue;
    }
    const date = new Date(item.updatedAt);
    if (date >= today) groups.Today.push(item);
    else if (date >= yesterday) groups.Yesterday.push(item);
    else if (date >= last7Days) groups["Last 7 Days"].push(item);
    else if (date >= last30Days) groups["Last 30 Days"].push(item);
    else groups.Older.push(item);
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
function ClustersPage() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const loadClusters = async () => {
    try {
      const result = await getClusters();
      setClusters(result);
    } catch (err) {
      console.error("Failed to load clusters:", err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadClusters();
  }, []);
  const handleCreate = async () => {
    const cluster = await createCluster();
    window.location.href = `/cluster/${cluster.id}`;
  };
  const handleDelete = async (clusterId) => {
    setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    const { success } = await deleteCluster(clusterId);
    if (!success) loadClusters();
  };
  const filtered = query ? clusters.filter((c) => c.name?.toLowerCase().includes(query.toLowerCase())) : clusters;
  const grouped = groupByDate(filtered);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative flex-1 max-w-sm", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "text",
            placeholder: "Search clusters...",
            value: query,
            onChange: (e) => setQuery(e.target.value),
            className: "w-full rounded-md border border-input bg-background px-9 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none", children: /* @__PURE__ */ jsx(SearchIcon, { size: 16 }) })
      ] }),
      /* @__PURE__ */ jsxs(
        "button",
        {
          onClick: handleCreate,
          className: "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90",
          children: [
            /* @__PURE__ */ jsx(PlusIcon, { size: 16 }),
            "New cluster"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("p", { className: "text-sm text-muted-foreground mb-4", children: [
      filtered.length,
      " ",
      filtered.length === 1 ? "cluster" : "clusters"
    ] }),
    loading ? /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-3", children: [...Array(3)].map((_, i) => /* @__PURE__ */ jsx("div", { className: "h-14 animate-pulse rounded-md bg-border/50" }, i)) }) : filtered.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground py-8 text-center", children: query ? "No clusters match your search." : "No clusters yet. Create one to get started!" }) : /* @__PURE__ */ jsx("div", { className: "flex flex-col", children: Object.entries(grouped).map(
      ([label, groupItems]) => groupItems.length > 0 ? /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
        /* @__PURE__ */ jsx("h2", { className: "text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2", children: label }),
        /* @__PURE__ */ jsx("div", { className: "flex flex-col divide-y divide-border", children: groupItems.map((cluster) => /* @__PURE__ */ jsx(
          ClusterRow,
          {
            cluster,
            onDelete: handleDelete
          },
          cluster.id
        )) })
      ] }, label) : null
    ) })
  ] });
}
function ClusterRow({ cluster, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(
      "a",
      {
        href: `/cluster/${cluster.id}/console`,
        className: "relative group flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-muted/50 rounded-md",
        style: { textDecoration: "inherit", color: "inherit" },
        children: [
          /* @__PURE__ */ jsx(ClusterIcon, { size: 16 }),
          /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsx("span", { className: "text-sm truncate", children: cluster.name || "New Cluster" }),
              /* @__PURE__ */ jsxs("span", { className: cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium shrink-0",
                cluster.enabled ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
              ), children: [
                /* @__PURE__ */ jsx("span", { className: cn(
                  "size-1.5 rounded-full",
                  cluster.enabled ? "bg-green-500" : "bg-destructive"
                ) }),
                cluster.enabled ? "On" : "Off"
              ] })
            ] }),
            /* @__PURE__ */ jsxs("span", { className: "text-xs text-muted-foreground", children: [
              "Updated ",
              timeAgo(cluster.updatedAt)
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "shrink-0 flex items-center gap-1", children: [
            /* @__PURE__ */ jsx(
              "a",
              {
                href: `/cluster/${cluster.id}`,
                className: "rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted",
                "aria-label": "Edit cluster",
                onClick: (e) => e.stopPropagation(),
                children: /* @__PURE__ */ jsx(PencilIcon, { size: 16 })
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted",
                "aria-label": "Delete",
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmDelete(true);
                },
                children: /* @__PURE__ */ jsx(TrashIcon, { size: 16 })
              }
            )
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx(
      ConfirmDialog,
      {
        open: confirmDelete,
        title: "Delete cluster?",
        description: "This will permanently delete this cluster and all its roles.",
        confirmLabel: "Delete",
        onConfirm: () => {
          setConfirmDelete(false);
          onDelete(cluster.id);
        },
        onCancel: () => setConfirmDelete(false)
      }
    )
  ] });
}
export {
  ClustersPage
};
