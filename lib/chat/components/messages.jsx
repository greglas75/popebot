'use client';

import { useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { PreviewMessage, ThinkingMessage } from './message.js';
import { Greeting } from './greeting.js';
import { ArrowDown } from 'lucide-react';

export function Messages({ messages, status, onRetry, onEdit }) {
  const virtuosoRef = useRef(null);
  const [atBottom, setAtBottom] = useState(true);

  const isStreaming = status === 'streaming';
  const lastMessage = messages.at(-1);

  const scrollToBottom = () => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
  };

  return (
    <div className="relative flex-1">
      <div className="absolute inset-0">
        {messages.length === 0 && (
          <div className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 px-4 py-4 md:gap-6 md:px-6">
            <Greeting />
          </div>
        )}

        {messages.length > 0 && (
          <Virtuoso
            ref={virtuosoRef}
            data={isStreaming ? messages.slice(0, -1) : messages}
            computeItemKey={(index, message) => message?.id ?? `msg-${index}`}
            itemContent={(index, message) => (
              <div className="mx-auto max-w-4xl px-4 md:px-6 py-2 md:py-3">
                <PreviewMessage
                  message={message}
                  isLoading={false}
                  onRetry={onRetry}
                  onEdit={onEdit}
                />
              </div>
            )}
            followOutput="smooth"
            increaseViewportBy={{ top: 2000, bottom: 2000 }}
            atBottomStateChange={setAtBottom}
            className="touch-pan-y"
            components={{
              Footer: () => (
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-2 md:py-3">
                  {isStreaming && lastMessage && (
                    <PreviewMessage
                      message={lastMessage}
                      isLoading={true}
                      onRetry={onRetry}
                      onEdit={onEdit}
                    />
                  )}
                  {status === 'submitted' && <ThinkingMessage />}
                  <div className="min-h-[24px] shrink-0" />
                </div>
              ),
            }}
          />
        )}

        {!atBottom && (
          <button
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background p-2 shadow-lg hover:bg-muted"
            onClick={scrollToBottom}
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
