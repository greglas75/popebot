'use client';

import { useState, useEffect } from 'react';
import { timeAgo } from './settings-shared.js';
import { useChatNav } from './chat-nav-context.js';
import { FolderIcon, ChevronDownIcon, ChevronRightIcon, CirclePlusIcon } from './icons.js';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from './ui/sidebar.js';

function ThreadItem({ thread, isActive, onNavigate }) {
  const updatedAt = thread.updatedAt ? new Date(thread.updatedAt).getTime() : null;
  const isReady = thread.containerStatus === 'ready';

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={isActive}
        className="group flex items-center gap-2 text-sm"
        onClick={(e) => {
          e.preventDefault();
          onNavigate(thread.id);
        }}
      >
        <span className="flex-1 truncate">{thread.title || 'Untitled'}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {updatedAt && (
            <span className="text-xs text-muted-foreground">{timeAgo(updatedAt).replace(' ago', '')}</span>
          )}
          {isReady && (
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Container ready" />
          )}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectFolder({ project, threads, expanded, onToggle, activeChatId, onNavigate }) {
  const visibleThreads = threads.slice(0, 3);
  const totalCount = threads.length;
  const hasMore = totalCount > 3;

  return (
    <SidebarGroup className="pt-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <FolderIcon size={14} />
        <span className="flex-1 truncate text-left">{project.title || project.name || 'Untitled'}</span>
        {expanded ? (
          <ChevronDownIcon size={14} className="text-muted-foreground" />
        ) : (
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <SidebarGroupContent>
          <SidebarMenu>
            {visibleThreads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeChatId}
                onNavigate={onNavigate}
              />
            ))}
            {hasMore && (
              <SidebarMenuItem>
                <a
                  href={`/chats?project=${encodeURIComponent(project.id)}`}
                  className="flex items-center px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  See all ({totalCount})
                </a>
              </SidebarMenuItem>
            )}
            {visibleThreads.length === 0 && (
              <li className="px-3 py-1 text-xs text-muted-foreground">No threads yet</li>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}

export function ProjectSidebar({ user }) {
  const [projects, setProjects] = useState([]);
  const [looseChats, setLooseChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const { activeChatId, navigateToChat } = useChatNav();

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const r = await fetch('/projects/list');
        if (!r.ok) throw new Error('Failed to fetch projects');
        const data = await r.json();
        if (!cancelled) {
          // Support both old (array) and new ({projects, looseChats}) formats
          const projectList = Array.isArray(data) ? data : (data.projects || []);
          const loose = Array.isArray(data) ? [] : (data.looseChats || []);
          setProjects(projectList);
          setLooseChats(loose);
          // Expand all projects + "Recent" by default
          const ids = new Set(projectList.map((p) => p.id));
          if (loose.length > 0) ids.add('__recent__');
          setExpandedProjects(ids);
        }
      } catch (err) {
        console.warn('[project-sidebar] Failed to load projects:', err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProjects();
    return () => { cancelled = true; };
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
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex flex-col gap-2 px-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-border/50" />
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      {projects.map((project) => (
        <ProjectFolder
          key={project.id}
          project={project}
          threads={project.recentChats || []}
          expanded={expandedProjects.has(project.id)}
          onToggle={() => toggleProject(project.id)}
          activeChatId={activeChatId}
          onNavigate={handleNavigate}
        />
      ))}

      {looseChats.length > 0 && (
        <ProjectFolder
          project={{ id: '__recent__', name: 'Recent' }}
          threads={looseChats}
          expanded={expandedProjects.has('__recent__')}
          onToggle={() => toggleProject('__recent__')}
          activeChatId={activeChatId}
          onNavigate={handleNavigate}
        />
      )}

      {projects.length === 0 && looseChats.length === 0 && (
        <SidebarGroup>
          <SidebarGroupContent>
            <p className="px-4 py-2 text-sm text-muted-foreground">
              No projects yet.
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      <SidebarGroup className="pt-2">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                  // Placeholder — will navigate to project creation when endpoint exists
                  navigateToChat(null);
                }}
              >
                <CirclePlusIcon size={14} />
                <span>Add project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
