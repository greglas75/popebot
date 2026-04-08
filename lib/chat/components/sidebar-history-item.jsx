'use client';

import { useState } from 'react';
import { AgentIcon, CodeIcon, TrashIcon, MoreHorizontalIcon, StarIcon, StarFilledIcon, PencilIcon } from './icons.js';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from './ui/sidebar.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from './ui/dropdown-menu.js';
import { ConfirmDialog } from './ui/confirm-dialog.js';
import { RenameDialog } from './ui/rename-dialog.js';
import { useChatNav } from './chat-nav-context.js';
import { cn } from '../utils.js';

export function SidebarHistoryItem({ chat, isActive, onDelete, onStar, onRename }) {
  const { navigateToChat } = useChatNav();
  const { setOpenMobile } = useSidebar();
  const [hovered, setHovered] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);

  const showMenu = hovered || dropdownOpen;

  return (
    <SidebarMenuItem>
      <div
        className="relative group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <SidebarMenuButton
          href={chat.codeWorkspaceId && chat.containerName ? `/code/${chat.codeWorkspaceId}` : `/chat/${chat.id}`}
          className="pr-8"
          isActive={isActive}
          onClick={(e) => {
            e.preventDefault();
            if (chat.codeWorkspaceId && chat.containerName) {
              window.location.href = `/code/${chat.codeWorkspaceId}`;
            } else {
              navigateToChat(chat.id);
            }
            setOpenMobile(false);
          }}
        >
          <span className="relative">
            {chat.chatMode === 'code' ? <CodeIcon size={14} /> : <AgentIcon size={14} />}
            {chat.hasChanges ? <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive" /> : null}
          </span>
          <span className="truncate flex-1">
            {chat.title}
          </span>
        </SidebarMenuButton>

        <div className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 z-10',
          showMenu ? 'opacity-100' : 'opacity-100 md:opacity-0 md:pointer-events-none'
        )}>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'rounded-md p-1',
                  'text-muted-foreground hover:text-foreground',
                  'bg-foreground/10 hover:bg-foreground/15'
                )}
                aria-label="Chat options"
              >
                <MoreHorizontalIcon size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onStar(chat.id);
                }}
              >
                {chat.starred ? <StarFilledIcon size={14} /> : <StarIcon size={14} />}
                {chat.starred ? 'Unstar' : 'Star'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameDialogOpen(true);
                }}
              >
                <PencilIcon size={14} />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
              >
                <TrashIcon size={14} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete chat?"
        description="This will permanently delete this chat and all its messages."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(chat.id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      <RenameDialog
        open={renameDialogOpen}
        currentValue={chat.title || ''}
        onSave={(newTitle) => onRename(chat.id, newTitle)}
        onCancel={() => setRenameDialogOpen(false)}
      />
    </SidebarMenuItem>
  );
}
