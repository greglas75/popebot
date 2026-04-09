'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '../utils.js';

const TerminalView = dynamic(() => import('../../code/terminal-view.js'), { ssr: false });

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.7;

export function TerminalPanel({ workspaceId, containerName }) {
  const [mode, setMode] = useState('collapsed'); // collapsed | expanded | fullscreen
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  // ESC to exit fullscreen
  useEffect(() => {
    if (mode !== 'fullscreen') return;
    const onKey = (e) => {
      if (e.key === 'Escape') setMode('expanded');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode]);

  // Draggable divider handlers
  const onDividerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = height;
  }, [height]);

  useEffect(() => {
    if (mode !== 'expanded') return;

    const onMove = (e) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      setHeight(Math.max(MIN_HEIGHT, Math.min(maxH, startH.current + delta)));
    };

    const onUp = () => {
      dragging.current = false;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [mode]);

  if (!containerName) return null;

  // Fullscreen overlay
  if (mode === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">Terminal</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('expanded')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Exit fullscreen
            </button>
            <button
              type="button"
              onClick={() => setMode('collapsed')}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Collapse
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <TerminalView
            codeWorkspaceId={workspaceId}
            showToolbar={false}
            isActive
          />
        </div>
      </div>
    );
  }

  // Collapsed bar
  if (mode === 'collapsed') {
    return (
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setMode('expanded')}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>&#x25B8;</span>
          <span>Terminal</span>
        </button>
      </div>
    );
  }

  // Expanded (half-screen)
  return (
    <div className="border-t border-border flex flex-col" style={{ height }}>
      {/* Draggable divider */}
      <div
        onMouseDown={onDividerDown}
        className="h-1 cursor-row-resize bg-border hover:bg-primary/30 transition-colors shrink-0"
      />
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-black shrink-0">
        <button
          type="button"
          onClick={() => setMode('collapsed')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          &#x25BE; Terminal
        </button>
        <button
          type="button"
          onClick={() => setMode('fullscreen')}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Fullscreen
        </button>
      </div>
      {/* Terminal */}
      <div className="flex-1 min-h-0">
        <TerminalView
          codeWorkspaceId={workspaceId}
          showToolbar={false}
          isActive
        />
      </div>
    </div>
  );
}
