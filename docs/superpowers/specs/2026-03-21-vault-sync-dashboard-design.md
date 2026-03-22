# Vault Sync Dashboard — Design Spec

**Date:** 2026-03-21
**Status:** Approved
**Component:** vault-sync plugin

## Overview

A unified web dashboard served by the vault-sync daemon at `localhost:37778` that provides both newcomer-friendly vault exploration and developer diagnostics. Single self-contained HTML file (no build step, no framework), similar to claude-mem's viewer.html pattern.

## Architecture

### Delivery

- **Single file:** `vault-sync/ui/dashboard.html` — self-contained HTML/CSS/JS
- **Served by:** The existing Hono daemon on port 37778
- **Route:** `GET /` serves the dashboard HTML
- **Data:** Dashboard fetches all data from the daemon's API via `fetch()` with 5-second auto-refresh polling
- **No build step:** Ships as a static file, copied to `dist/ui/` by the build script

### Backend: Daemon as Single API

The daemon becomes the sole backend for the dashboard. All vault operations proxy through the daemon rather than calling vault-mcp or reading the filesystem directly from the frontend. This keeps the frontend simple (one base URL) and allows caching later.

**New daemon endpoints required:**

| Endpoint | Method | Purpose | Data Source |
|----------|--------|---------|-------------|
| `GET /` | GET | Serve dashboard HTML | Static file |
| `GET /vault/notes` | GET | List notes with metadata | Read vault filesystem, parse frontmatter |
| `GET /vault/notes/:path` | GET | Read full note content | Read vault filesystem |
| `GET /vault/git-status` | GET | Vault repo sync state | Run git commands against VAULT_PATH |
| `GET /hook-status` | GET | Hook firing history | Read `~/.lore/hook-status.json` |
| `GET /session-history` | GET | Past session records | Read `~/.lore/session-history.json` |
| `POST /suggestions/promote/:index` | POST | Create vault note from suggestion | Write markdown file directly to VAULT_PATH, remove from pending |
| `DELETE /suggestions/:index` | DELETE | Dismiss a single suggestion | Remove from `~/.lore/pending-suggestions.json` |

**Note:** The existing `POST /suggestions/dismiss` (bulk dismiss all) is retained for the SessionStart hook's workflow. `DELETE /suggestions/:index` is for individual dismissal from the dashboard.

**Modified existing endpoints:**

| Endpoint | Change |
|----------|--------|
| `GET /health` | Add `pid` field to response |

**Query parameters for `GET /vault/notes`:**

- `?status=established` or `?status=exploratory` — filter by note status
- `?tag=architecture` — filter by tag
- `?q=search+term` — full-text search across title and body
- `?project=vault-sync` — filter by project
- `?branch=main` — filter by branch

### New Persistent State Files

| File | Written By | Format |
|------|-----------|--------|
| `~/.lore/session-history.json` | Stop hook (after evaluation) | Array of `SessionRecord` |
| `~/.lore/hook-status.json` | Each hook (on fire) | Map of `{ [hookName]: HookHeartbeat }` |

**Types:**

```typescript
interface SessionRecord {
  startedAt: number;
  endedAt: number;
  observationCount: number;
  suggestionCount: number;
  suggestions: Array<{ title: string; confidence: number }>;
}

interface HookHeartbeat {
  lastFiredAt: number;
  success: boolean;
  error?: string;
}
```

## UI Layout

### Theme & Frame

- Dark theme (GitHub dark color palette: `#0d1117` background, `#161b22` cards, `#30363d` borders)
- Page header with:
  - Green health dot + "Vault Sync Dashboard" title
  - Mode badge: "Supercharged Mode" (blue) or "Standalone Mode" (gray)
  - Auto-refresh indicator: "Auto-refresh: 5s"
- Two-column responsive grid layout with cards
- Priority sections span full width; diagnostic sections use half-width

### Section 1: Pending Suggestions (full width, top priority)

**Data:** `GET /suggestions`

Shows suggestion cards with amber left-border accent. Each card displays:
- Title (bold)
- Content (2-3 sentence explanation)
- Tags as pills
- Confidence score

**Actions per suggestion:**
- **Promote** button — `POST /suggestions/promote/:index` — creates vault note with `status: exploratory`, removes from pending list
- **Dismiss** button — `DELETE /suggestions/:index` — removes suggestion

**Promote implementation:** The daemon writes a markdown file directly to `VAULT_PATH` (no MCP dependency). It constructs frontmatter from the suggestion data and reasonable defaults:
- `title`: from suggestion title
- `status`: `exploratory`
- `tags`: from suggestion tags
- `project`: inferred from the daemon's current working directory name, or empty
- `branch`: `main` (promoted from dashboard, not from a feature branch)
- `created`: current timestamp
The filename is derived from the title (slugified). This mirrors what `vault-create-note` does but avoids coupling the daemon to the MCP server.

**Empty state:** "No pending suggestions. Suggestions are generated when you end a Claude Code session."

### Section 2: Vault Explorer (full width)

**Data:** `GET /vault/notes` (list) + `GET /vault/notes/:path` (detail)

**Layout:** Master-detail split panel (side panel pattern)
- **Left panel:** Search bar + filter chips + scrollable note list
- **Right panel:** Full note content rendered as HTML (markdown-to-HTML in the browser)

**Search bar:** Full-text search, debounced 300ms, queries `?q=` param.

**Filter chips:** Dynamically populated from vault contents:
- Status: All | Established (green dot) | Exploratory (amber dot)
- Tags: populated from actual tags present in the vault
- Filters combine with AND logic
- Multiple chips can be active simultaneously

**Note list items show:** Status dot + title, tags, project or branch, date.

**Detail panel shows:**
- Title with status dot
- Metadata row: status, tags (as pills), project, creation date
- Full note content (rendered markdown)
- Empty state when no note selected: "Select a note to view its content"

### Section 3: Session History (half width)

**Data:** `GET /session-history`

**Layout:** Vertical timeline with color-coded dots:
- Green dot: current/active session
- Blue dot: evaluated session (completed normally)
- Gray dot: older sessions

**Each entry shows:**
- Date range (start - end, or "now" for current)
- Observation count captured
- Suggestion count generated
- Most recent sessions first, scrollable

### Section 4: Vault Sync Status (half width)

**Data:** `GET /vault/git-status`

**Layout:** 2x2 grid of stat boxes:
- **Status:** "In Sync" (green) / "Uncommitted Changes" (amber) / "Behind Remote" (amber)
- **Last Pull:** relative time
- **Last Push:** relative time
- **Uncommitted:** file count

### Section 5: Hook Status (half width)

**Data:** `GET /hook-status`

**Layout:** List of all 6 hooks with status indicators:
- Green + last fired time: hook is working
- Red + error message: last run failed
- Gray + "Pending": hook hasn't fired yet (expected for Stop/SessionEnd during active session)

**Hooks listed:** Setup, SessionStart, PostToolUse, UserPromptSubmit, Stop, SessionEnd

### Section 6: Daemon Health (half width)

**Data:** `GET /health`

**Layout:** 4-stat horizontal row:
- Status: "OK" (green) or "Error" (red)
- Uptime: formatted as hours/minutes
- Port: 37778
- PID: process ID

### Section 7: Observation Pipeline (full width, bottom)

**Data:** Combines `GET /health` (queueDepth) + `GET /suggestions` (count) + `GET /vault/notes` (total count)

**Layout:** Horizontal flow diagram with counts:
```
[Queued: 6] -> [Suggestions: 2] -> [In Vault: 14]
```

Note: The original mockup included an "Evaluating" stage, but evaluation is synchronous in the Stop hook and would effectively always show 0. Simplified to 3 stages.

**Below the pipeline:** One-line explanation for newcomers:
"PostToolUse captures -> Stop hook evaluates -> SessionStart presents -> User promotes to vault"

## Hook Modifications

### Hooks (except Setup): Write heartbeat

The 5 TypeScript hooks (SessionStart, PostToolUse, UserPromptSubmit, Stop, SessionEnd) write to `~/.lore/hook-status.json` on entry/exit:

```typescript
// In each hook's main(), wrap with heartbeat
try {
  writeHookStatus(hookName, { lastFiredAt: Date.now(), success: true });
  // ... existing hook logic ...
} catch (err) {
  writeHookStatus(hookName, { lastFiredAt: Date.now(), success: false, error: err.message });
  throw err;
}
```

`writeHookStatus` reads the existing file, updates the entry for `hookName`, and writes back. Race-safe via atomic write (write to temp, rename).

### Setup hook: Write heartbeat from smart-install.js

The Setup hook runs `scripts/smart-install.js` directly (plain JS, not compiled TypeScript). Add heartbeat writing directly in `smart-install.js` using the same `~/.lore/hook-status.json` file. Since `smart-install.js` is vanilla JS, it writes the JSON file directly rather than importing the shared `writeHookStatus` utility.

### Stop hook: Write session history

After evaluation completes, append a `SessionRecord` to `~/.lore/session-history.json`:

```typescript
const record: SessionRecord = {
  startedAt: daemonState.startedAt,  // from GET /health
  endedAt: Date.now(),
  observationCount: observations.length,
  suggestionCount: suggestions.length,
  suggestions: suggestions.map(s => ({ title: s.title, confidence: s.confidence })),
};
```

## Vault Filesystem Reading

The daemon needs to read the vault directory to serve `GET /vault/notes`. Reuse the frontmatter parsing logic from `vault-context.ts`:

- Walk `VAULT_PATH` recursively
- Skip: `.obsidian/`, `.git/`, `README.md`, `.vault-mcp.json`, `.gitkeep`, `sessions/`
- Parse YAML frontmatter: title, status, tags, project, branch, created date
- For search (`?q=`): match against title and body content
- For full note read: return raw markdown content (frontend renders)

`VAULT_PATH` is resolved from:
1. `process.env.VAULT_PATH` (set by MCP config)
2. Reading `.vault-mcp.json` from common vault locations
3. Fallback: `~/.lore/vault`

## Frontend Implementation Details

### Auto-refresh

```javascript
setInterval(() => refreshAll(), 5000);
```

`refreshAll()` fetches all endpoints in parallel and updates the DOM. No framework — direct DOM manipulation with `getElementById` / `innerHTML`.

### Markdown rendering

For the vault note detail panel, use a lightweight inline markdown renderer. Options:
- Simple regex-based renderer for basic markdown (headings, paragraphs, code blocks, lists, links)
- Keep it under 100 lines — vault notes are short claim-style documents, not complex markdown

### Relative time formatting

Format timestamps as "2 min ago", "3 hours ago", "Yesterday" etc. Simple helper function, no library needed.

### Error states

- **Daemon unreachable:** Show a full-page error with "Daemon not running. Start it with: `node dist/daemon.cjs start`"
- **Vault not configured:** Show setup instructions in the Vault Explorer section
- **Individual section errors:** Show inline error message in the card, don't break other sections

## File Changes Summary

### New files
- `vault-sync/ui/dashboard.html` — the dashboard (single file)

### Modified files
- `vault-sync/src/daemon.ts` — add new endpoints (vault notes, git status, hook status, session history, per-suggestion promote/dismiss, serve dashboard HTML)
- `vault-sync/src/hooks/stop.ts` — write session history record after evaluation
- `vault-sync/src/hooks/*.ts` (all hooks) — write heartbeat to hook-status.json
- `vault-sync/src/types.ts` — add `SessionRecord` and `HookHeartbeat` types
- `vault-sync/build.js` — copy `ui/dashboard.html` to `dist/ui/`

### New shared utilities
- `vault-sync/src/hook-heartbeat.ts` — `writeHookStatus()` function (used by all hooks)
- `vault-sync/src/vault-reader.ts` — vault filesystem reading + frontmatter parsing (extracted from vault-context.ts for reuse in daemon)
