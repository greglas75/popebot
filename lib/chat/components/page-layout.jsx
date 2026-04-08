'use client';

import { AppSidebar } from './app-sidebar.js';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './ui/sidebar.js';
import { ChatNavProvider } from './chat-nav-context.js';

function defaultNavigateToChat(id) {
  if (id) {
    window.location.href = `/chat/${id}`;
  } else {
    window.location.href = '/';
  }
}

export function PageLayout({ session, children, contentClassName }) {
  return (
    <ChatNavProvider value={{ activeChatId: null, navigateToChat: defaultNavigateToChat }}>
      <SidebarProvider>
        <AppSidebar user={session.user} />
        <SidebarInset>
          <div className="sticky top-0 z-10 flex items-center bg-background px-2 py-1.5 md:hidden">
            <SidebarTrigger />
          </div>
          <div className={contentClassName || "flex flex-col h-full max-w-4xl mx-auto w-full min-w-0 px-4 py-6"}>
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ChatNavProvider>
  );
}
