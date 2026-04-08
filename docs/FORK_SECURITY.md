# Security Hardening (Fork)

Changes made to the upstream thepopebot for production team use.

## Fixes applied

### 1. Default role: user (not admin)

**File:** `lib/db/schema.js`

Upstream defaults new users to `admin`. Changed to `user`. First account created via setup wizard is still admin (set explicitly).

### 2. LRU token rotation race condition

**File:** `lib/db/oauth-tokens.js`

Upstream reads all tokens, sorts by `lastUsedAt`, then updates — two concurrent requests could select the same token. Fixed by wrapping selection + update in a single SQLite transaction.

### 3. Webhook payload validation

**File:** `lib/cluster/execute.js`

Upstream passes webhook payload directly as agent prompt without validation. Added:
- Type check: `payload.prompt` must be string, max 50000 chars
- Null byte stripping
- Template variable injection prevention (`{{` / `}}` in values)

### 4. Docker resource limits

**File:** `lib/tools/docker.js`

Agent containers had no resource limits. Added to both `runClusterWorkerContainer` and `runAgentJobContainer`:
- `Memory: 2GB`
- `MemorySwap: 2GB` (no swap)
- `CpuShares: 1024`
- `PidsLimit: 512`

### 5. Claude Code timeout

**File:** `docker/coding-agent/scripts/agents/claude-code/run.sh`

No timeout on Claude Code process — could run indefinitely. Added `timeout 3600` (1 hour).

### 6. Container umask

**File:** `docker/coding-agent/entrypoint.sh`

No `umask` set — files could be world-readable. Added `umask 077` at start.

### 7. Auth error handling

**File:** `docker/coding-agent/scripts/agent-job/3_agent-auth.sh`

Auth failures were silent. Added `set -e` and error trap with script/line reporting.

### 8. System prompt merge

**File:** `docker/coding-agent/scripts/agent-job/6_agent-run.sh`

`SYSTEM_PROMPT_FILE` replaced existing `SYSTEM_PROMPT` entirely. Changed to append with newline separator. Also: `PERMISSION` now respects input (`${PERMISSION:-code}`) instead of unconditional override.

### 9. Debounce validation

**File:** `lib/cluster/runtime.js`

`debounceMs` could be 0 or negative. Added `Math.max(100, ...)`. Also capped `changedFiles` Set at 1000 entries to prevent memory leak.

### 10. Title truncation

**File:** `lib/tools/create-agent-job.js`

Title fallback truncated mid-word. Changed to word-boundary truncation.

## VPS hardening

- SSH key-only (password auth disabled)
- UFW firewall: only ports 22, 80, 443, 3000
- Auto backup enabled (Contabo, daily, 10 versions)

## Remaining risks (upstream)

- No rate limiting on any endpoint
- No per-job cost budget enforcement
- No audit log table for config changes
- Agent containers share Docker network (no per-role isolation)
