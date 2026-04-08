'use client';

import { useState } from 'react';

export function CodeLogView({ logs, expandedTools: externalExpanded, toggleTool: externalToggle }) {
  const [internalExpanded, setInternalExpanded] = useState(new Set());

  const expandedTools = externalExpanded || internalExpanded;
  const toggleTool = externalToggle || ((id) => {
    setInternalExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  });

  const toolResults = new Map();
  for (const entry of logs) {
    if (!entry.parsed) continue;
    for (const ev of entry.parsed) {
      if (ev.type === 'tool-result' && ev.toolCallId) {
        toolResults.set(ev.toolCallId, ev);
      }
    }
  }

  const elements = [];
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    if (!entry.parsed) continue;
    for (const ev of entry.parsed) {
      if (ev.type === 'text' && ev.text) {
        elements.push(
          <div key={`${i}-text`} className="text-foreground whitespace-pre-wrap mb-1 leading-relaxed">
            {ev.text}
          </div>
        );
      } else if (ev.type === 'tool-call') {
        const expanded = expandedTools.has(ev.toolCallId);
        const result = toolResults.get(ev.toolCallId);
        const keyArg = ev.args ? Object.values(ev.args)[0] : '';
        const keyArgStr = typeof keyArg === 'string' ? keyArg : '';
        const shortArg = keyArgStr.length > 60 ? keyArgStr.slice(0, 57) + '...' : keyArgStr;

        elements.push(
          <div key={`${i}-tool-${ev.toolCallId}`} className="my-1">
            <button
              onClick={() => toggleTool(ev.toolCallId)}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 rounded bg-muted/60 hover:bg-muted transition-colors"
            >
              <span className="text-muted-foreground text-xs">{expanded ? '▼' : '▶'}</span>
              <span className="font-medium text-xs text-primary">{ev.toolName}</span>
              {shortArg && <span className="text-muted-foreground text-xs truncate">({shortArg})</span>}
            </button>
            {expanded && (
              <div className="ml-4 mt-1 space-y-1">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all bg-muted/30 rounded p-1.5 max-h-48 overflow-y-auto">
                  {JSON.stringify(ev.args, null, 2)}
                </pre>
                {result && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Result:</span>
                    <pre className="whitespace-pre-wrap break-all bg-muted/30 rounded p-1.5 mt-0.5 max-h-48 overflow-y-auto">
                      {typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }
    }
  }

  return <div>{elements}</div>;
}
