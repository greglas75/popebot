'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from './page-layout.js';
import { SpinnerIcon, RefreshIcon } from './icons.js';
import { getRunnersStatus } from '../actions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-md bg-border/50" />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow List
// ─────────────────────────────────────────────────────────────────────────────

const conclusionBadgeStyles = {
  success: 'bg-green-500/10 text-green-500',
  failure: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-yellow-500/10 text-yellow-500',
  skipped: 'bg-muted text-muted-foreground',
};

function RunnersWorkflowList({ runs }) {
  if (!runs || runs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No workflow runs.
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {runs.map((run) => {
        const isActive = run.status === 'in_progress' || run.status === 'queued';
        const isRunning = run.status === 'in_progress';
        const isQueued = run.status === 'queued';

        return (
          <a
            key={run.run_id}
            href={run.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-md hover:bg-accent transition-colors no-underline text-inherit"
          >
            {/* Status indicator */}
            {isRunning && (
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 animate-pulse" />
            )}
            {isQueued && (
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />
            )}
            {!isActive && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase shrink-0 ${
                  conclusionBadgeStyles[run.conclusion] || 'bg-muted text-muted-foreground'
                }`}
              >
                {run.conclusion || 'unknown'}
              </span>
            )}

            {/* Workflow name */}
            <span className="text-sm font-medium truncate">
              {run.workflow_name || run.branch}
            </span>

            {/* Duration or time ago */}
            <span className="text-xs text-muted-foreground shrink-0">
              {isActive
                ? formatDuration(run.duration_seconds)
                : timeAgo(run.updated_at || run.started_at)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Link label */}
            <span className="text-xs text-blue-500 shrink-0">
              View
            </span>
          </a>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export function RunnersPage({ session }) {
  const [runs, setRuns] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [maxPage, setMaxPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const PAGE_SIZE = 25;

  const loadInitial = useCallback(async () => {
    try {
      const data = await getRunnersStatus(1);
      setRuns(data.runs || []);
      setHasMore(data.hasMore || false);
      setMaxPage(1);
    } catch (err) {
      console.error('Failed to fetch runners status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = maxPage + 1;
      const data = await getRunnersStatus(nextPage);
      const newRuns = data.runs || [];
      setRuns(prev => {
        const existingIds = new Set(prev.map(r => r.run_id));
        return [...prev, ...newRuns.filter(r => !existingIds.has(r.run_id))];
      });
      setHasMore(data.hasMore || false);
      setMaxPage(nextPage);
    } catch (err) {
      console.error('Failed to load more runners:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [maxPage]);

  const autoRefresh = useCallback(async () => {
    try {
      const data = await getRunnersStatus(1);
      const freshRuns = data.runs || [];
      setRuns(prev => {
        const freshIds = new Set(freshRuns.map(r => r.run_id));
        const olderRuns = prev.slice(PAGE_SIZE).filter(r => !freshIds.has(r.run_id));
        return [...freshRuns, ...olderRuns];
      });
      if (maxPage === 1) setHasMore(data.hasMore || false);
    } catch (err) {
      console.error('Failed to auto-refresh runners:', err);
    }
  }, [maxPage]);

  // Initial load
  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Auto-refresh page 1 every 10s
  useEffect(() => {
    const interval = setInterval(autoRefresh, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <PageLayout session={session}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Runners</h1>
        {!loading && (
          <button
            onClick={() => { setRefreshing(true); loadInitial(); }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 min-h-[44px] text-xs font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
          >
            {refreshing ? (
              <>
                <SpinnerIcon size={14} />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshIcon size={14} />
                Refresh
              </>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton />
      ) : (
        <div>
          <RunnersWorkflowList runs={runs} />
          {/* Show more */}
          {hasMore && (
            <div className="flex justify-center mt-4 pt-4 border-t border-border">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 min-h-[44px] text-sm font-medium border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
              >
                {loadingMore ? (
                  <>
                    <SpinnerIcon size={14} />
                    Loading...
                  </>
                ) : (
                  'Show more'
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
