# Shared Knowledge Vault — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Goal:** A TypeScript MCP server, Claude Code plugin, and GitHub template repo that gives any dev team a shared, git-synced Obsidian knowledge vault with automatic lifecycle management.

---

## Problem

Per-developer memory tools (claude-mem, auto-memory, `.claude/` files) work well for individual context, but they're invisible to the rest of the team. When a different developer — or the same developer in a fresh session — picks up work, the context rebuilding starts from scratch. Team knowledge about architecture, conventions, and past decisions exists only in people's heads or scattered across Slack threads and PR comments.

## Solution

A shared, persistent knowledge layer alongside existing per-developer memory:

| Tier | System | Purpose | Scope |
|------|--------|---------|-------|
| Ephemeral | Claude-mem (existing) | Session-level debugging context, throwaway observations | Local, per-developer |
| Persistent | Obsidian vault (git repo) | Validated team knowledge, architecture decisions, research | Shared, one vault per team |

Notes in the vault follow a git-like lifecycle via frontmatter tags:

```
exploratory → established (on merge to main)
exploratory → discarded (on branch abandonment)
```

## Key Architectural Decisions

1. **Custom TypeScript MCP server** (`vault-mcp`) for vault CRUD, frontmatter lifecycle, git sync. Portable across editors.
2. **smart-connections as optional add-on** for semantic search. Core vault works without it.
3. **Explicit git tools** (`vault-pull`, `vault-push`, `vault-status`) — Claude Code hooks orchestrate automatically; Cursor users call directly.
4. **AI-suggested, human-approved** note capture. Claude suggests vault-worthy observations; developer confirms.
5. **One vault per team**, `project` frontmatter field filters notes by project.
6. **Sessions folder included** for transcript storage. Voice notes deferred to a later version.
7. **Stash/pull/pop conflict resolution**, abort and notify if that fails.
8. **Cursor-compatible** via MCP server. Claude Code plugin adds intelligent orchestration on top.
9. **Approach C: Smart MCP Server, Orchestration Plugin** — MCP server owns portable vault operations; Claude Code plugin owns editor-specific intelligence (observation suggestions, session-start checks, promoter agent).

---

## Deliverables

### 1. `vault-template` — GitHub Template Repo

A template repository that teams fork/clone to create their shared vault.

#### Folder Structure

```
vault-template/
├── .gitignore
├── .obsidian/
│   └── app.json
├── README.md
├── 00-home/
│   ├── index.md
│   ├── daily/
│   └── top-of-mind.md
├── atlas/
│   ├── projects.md
│   └── research.md
├── inbox/
├── knowledge/
│   ├── architecture/
│   ├── conventions/
│   ├── research/
│   └── debugging/
└── sessions/
```

#### .gitignore

```gitignore
# Obsidian workspace (per-user, don't share)
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/appearance.json

# OS
.DS_Store
Thumbs.db

# Smart Connections cache
.smart-connections/

# Vault MCP config (per-developer)
.vault-mcp.json
```

### 2. `vault-mcp` — TypeScript MCP Server

The portable vault operations layer. Handles note CRUD, frontmatter lifecycle, queries, and git sync. Works with any MCP-compatible editor (Claude Code, Cursor, Windsurf, etc.).

#### Project Structure

```
vault-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/                # One file per tool
│   ├── vault/                # Core vault logic (frontmatter, file ops)
│   └── git/                  # Git sync logic (pull, push, stash/pop)
└── tests/
```

#### Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `gray-matter` — Frontmatter parsing
- `simple-git` — Git operations
- Node.js >= 18
- Build: `tsc` to `dist/`, entry point `dist/index.js`

#### Transport & Configuration

The server runs over **stdio** transport. Editor configuration:

```json
{
  "mcpServers": {
    "vault-mcp": {
      "command": "node",
      "args": ["<path-to-vault-mcp>/dist/index.js"],
      "env": {
        "VAULT_PATH": "<local-vault-path>",
        "VAULT_AUTHOR": "<github-username>"
      }
    }
  }
}
```

In Claude Code, register via CLI: `claude mcp add --scope user --env VAULT_PATH=<path> --env VAULT_AUTHOR=<user> -- vault-mcp node <path-to-dist>/index.js`. In Cursor, add the config above to `.cursor/mcp.json`.

#### Config File Schema (`.vault-mcp.json`)

Stored at `<vault_path>/.vault-mcp.json`, gitignored:

```json
{
  "vault_path": "/Users/dev/obsidian/team-vault",
  "author": "github-username",
  "projects": {
    "key-and-arrow": "/Users/dev/projects/key-and-arrow",
    "lore": "/Users/dev/Node/lore"
  }
}
```

- `vault_path` — Absolute path to the vault repo
- `author` — GitHub username for frontmatter
- `projects` — Map of project names to local repo paths (used by `/vault-cleanup` to check branch existence)

### 3. `vault-sync` — Claude Code Plugin

Orchestration layer that adds intelligent UX on top of vault-mcp. Installable via `claude plugins install` using the `git-subdir` source type from the `lore` monorepo.

#### Plugin Structure

```
vault-sync/
├── plugin.json
├── skills/
│   ├── setup.md
│   ├── promote.md
│   ├── cleanup.md
│   └── vault-note.md
├── agents/
│   └── promoter.md
└── templates/
    └── note-template.md
```

Note: Hooks are prompt-based (defined inline in `plugin.json`), not shell scripts. No `hooks/` directory needed.

#### Marketplace Entry

```json
{
  "name": "vault-sync",
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/yourorg/lore.git",
    "path": "vault-sync"
  }
}
```

#### plugin.json

```json
{
  "name": "vault-sync",
  "version": "1.0.0",
  "description": "Shared Obsidian knowledge vault with git sync and note lifecycle management",
  "skills": [
    {
      "name": "setup",
      "description": "Set up the shared knowledge vault: clone vault repo, configure MCP server, install hooks",
      "path": "skills/setup.md"
    },
    {
      "name": "promote",
      "description": "Review and promote exploratory notes to established status after branch merge",
      "path": "skills/promote.md",
      "command": "promote-to-vault"
    },
    {
      "name": "cleanup",
      "description": "Find and remove exploratory notes for abandoned/deleted branches",
      "path": "skills/cleanup.md",
      "command": "vault-cleanup"
    },
    {
      "name": "vault-note",
      "description": "Create a new note in the vault with proper frontmatter and wikilinks",
      "path": "skills/vault-note.md",
      "command": "vault-note"
    }
  ],
  "hooks": [
    {
      "name": "pre-write-pull",
      "event": "PreToolUse",
      "match_tool": "vault-create-note|vault-update-note|vault-promote|vault-discard",
      "type": "prompt",
      "prompt": "Before executing this vault write, call the vault-pull MCP tool to sync latest changes. If vault-pull returns a conflict error, BLOCK this tool call and report the conflict to the user."
    },
    {
      "name": "post-write-push",
      "event": "PostToolUse",
      "match_tool": "vault-create-note|vault-update-note|vault-promote|vault-discard",
      "type": "prompt",
      "prompt": "After this vault write completes, call the vault-push MCP tool to commit and push changes. If push fails, warn the user but do not roll back."
    },
    {
      "name": "session-start-check",
      "event": "Notification",
      "type": "prompt",
      "prompt": "Check if the current project branch is main. If so, call vault-query with status=exploratory to find notes from recently merged branches. If any exist, tell the user: 'Found N exploratory notes from recently merged branches. Run /promote-to-vault to review.'"
    },
    {
      "name": "observation-suggestion",
      "event": "PostToolUse",
      "match_tool": "Write|Edit|MultiEdit",
      "type": "prompt",
      "prompt": "Review what you just wrote. If it involved an architectural decision, a convention discovery, or a notable debugging solution, suggest saving it to the vault. Say: 'This looks like it could be worth saving to the vault: <suggested claim title>. Save it? (y/n)'. Only suggest at most once per user prompt — do not ask multiple times in a single response."
    }
  ],
  "agents": [
    {
      "name": "promoter",
      "description": "Reviews exploratory notes from a merged branch and proposes which to promote, update, or discard",
      "path": "agents/promoter.md"
    }
  ]
}
```

---

## MCP Server Tools (`vault-mcp`)

### Note CRUD (4 tools)

#### `vault-create-note`

Creates a note with validated frontmatter.

**Parameters:**
- `title` (string, required) — Claim-style title
- `content` (string, required) — Note body in markdown
- `tags` (string[], required) — Array of tags (can be empty)
- `project` (string, required) — Project name
- `branch` (string, optional) — Current branch. Required when creating exploratory notes.

**Auto-filled:** `status: exploratory`, `author` from config, `created` as today's date.

**File placement:** Determined by tags:
- Tags contain `architecture` → `knowledge/architecture/`
- Tags contain `convention` or `pattern` → `knowledge/conventions/`
- Tags contain `research` → `knowledge/research/`
- Tags contain `debugging` or `bug` → `knowledge/debugging/`
- No matching tag → `inbox/`

**Filename:** Generated from title: `title.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim()`. Spaces are preserved. Examples:
- `"JWT refresh tokens prevent session fixation attacks"` → `jwt refresh tokens prevent session fixation attacks.md`
- `"C++ templates don't work with SFINAE"` → `c templates dont work with sfinae.md`

**Errors:**
- Note with same title already exists → returns error with existing path
- Missing required fields → returns validation error
- Vault not configured → returns setup instructions

#### `vault-read-note`

Reads a note by path or title.

**Parameters:**
- `path` (string, optional) — Vault-relative path
- `title` (string, optional) — Note title (case-insensitive substring match against the `title` frontmatter field; returns first match)

One of `path` or `title` is required. Returns content + parsed frontmatter.

#### `vault-update-note`

Updates content and/or frontmatter fields.

**Parameters:**
- `path` (string, required) — Vault-relative path
- `content` (string, optional) — New body content
- `frontmatter` (object, optional) — Fields to update (merged with existing)

Validates frontmatter schema on write. Cannot change `status` directly — use `vault-promote` or `vault-discard`.

#### `vault-delete-note`

Deletes a note by path. Restricted to `exploratory` notes only — established notes represent validated team knowledge and cannot be deleted.

**Parameters:**
- `path` (string, required) — Vault-relative path

**Errors:**
- Note is `established` → "Cannot delete established notes. They represent validated team knowledge."

### Lifecycle (2 tools)

#### `vault-promote`

Transitions a note from `exploratory` → `established`.

**Parameters:**
- `path` (string, required) — Vault-relative path
- `content` (string, optional) — Updated content (if revising during promotion)

**Actions:** Sets `status: established`, adds `established: <today>`, removes `branch` field.

**Errors:**
- Note is not `exploratory` → "Note is already `<status>`. Only exploratory notes can be promoted."

#### `vault-discard`

Deletes an exploratory note. The discard is logged via the git commit message: `vault: discarded '<title>' — <reason> (by <author>)`.

**Parameters:**
- `path` (string, required) — Vault-relative path
- `reason` (string, optional) — Why it's being discarded (included in commit message)

**Errors:**
- Note is not `exploratory` → "Only exploratory notes can be discarded. Established notes represent validated team knowledge and cannot be removed."

### Query (2 tools)

#### `vault-query`

Query notes by frontmatter fields.

**Parameters:**
- `status` (string, optional) — Filter by status
- `branch` (string, optional) — Filter by branch
- `project` (string, optional) — Filter by project
- `tags` (string[], optional) — Filter by tags (AND logic)
- `author` (string, optional) — Filter by author
- `created_after` (string, optional) — ISO date, notes created after
- `created_before` (string, optional) — ISO date, notes created before

Returns array of `{ path, title, frontmatter }`.

#### `vault-search`

Full-text search across note content. Synchronous grep-style search: reads all `.md` files in the vault and matches against the query string (case-insensitive). No pre-built index — acceptable for vaults up to ~1000 notes.

**Parameters:**
- `query` (string, required) — Search terms
- `limit` (number, optional) — Max results (default 20)

Returns array of `{ path, title, matches[] }` where each match includes the matching line and 2 lines of surrounding context.

### Git Sync (3 tools)

#### `vault-pull`

Pulls latest from remote with conflict resolution.

**Flow:**
1. `git pull --rebase`
2. On conflict: `git rebase --abort` → `git stash` → `git pull --rebase` → `git stash pop`
3. If pop fails: `git stash drop` → return error with conflicting files

**Returns:** Success message with files updated, or error with conflict details.

#### `vault-push`

Stages, commits, and pushes vault changes.

**Flow:**
1. `git add -A`
2. `git commit -m "vault: auto-sync from <author>"`
3. `git push`

**Returns:** Success message, or warning if push fails (changes remain committed locally).

#### `vault-status`

Returns current vault git status.

**Returns:** `{ uncommitted_changes: string[], ahead: number, behind: number, branch: string }`

### Config (1 tool)

#### `vault-init`

Initializes MCP server configuration.

**Parameters:**
- `vault_path` (string, required) — Absolute path to the vault repo
- `author` (string, required) — GitHub username

**Stores config in:** `<vault_path>/.vault-mcp.json`

**Validates:**
- Path exists
- Path is a git repo
- Path contains expected vault structure (at minimum, a `knowledge/` directory)

---

## Claude Code Plugin Components

### Skills

#### `/vault-setup` — Onboarding Flow

1. Prompts for: vault repo URL, local clone path (default `~/obsidian/team-vault`), GitHub username
2. Clones the vault repo
3. Runs `vault-init` MCP tool to configure the server
4. Optionally installs smart-connections if desired
5. Installs the git sync hooks
6. Runs a test `vault-query` to confirm everything works
7. Output: "Vault connected. You can now search and create notes."

#### `/vault-note` — Manual Note Creation

1. Asks what the insight is (or accepts as argument)
2. Suggests a claim-style title
3. Auto-detects current project branch and project name from git
4. Calls `vault-create-note` MCP tool
5. Git sync triggered by hooks

#### `/promote-to-vault` — Guided Promotion

1. Detects current branch or asks which merged branch to promote
2. Calls `vault-query` for `status: exploratory AND branch: <branch>`
3. If no notes found: "No exploratory notes for this branch."
4. If notes found with `status: established`: "Already promoted by <author>. Want to add supplementary notes?"
5. If exploratory notes found: dispatches **promoter agent** to review
6. Presents recommendations; developer approves/edits/discards each
7. Calls `vault-promote` or `vault-discard` per decision

#### `/vault-cleanup` — Prune Abandoned Branches

1. Calls `vault-query` for all `status: exploratory` notes
2. Filters to notes matching the current project (auto-detected from cwd git remote, matched against `project` frontmatter field)
3. For each unique `branch`, checks if branch exists in the project repo path from `.vault-mcp.json` `projects` config (local + remote)
4. Groups: orphaned (branch gone), stale (30+ days inactive), active
5. Prompts developer to bulk discard orphaned, review stale

### Hooks

All hooks are **prompt-based** (defined in `plugin.json`), not shell scripts. Claude Code evaluates the prompt and takes the described action. This means hooks can call MCP tools directly as part of Claude's response.

#### `pre-write-pull` (PreToolUse)

- **Matches:** `vault-create-note`, `vault-update-note`, `vault-promote`, `vault-discard`
- **Behavior:** Instructs Claude to call `vault-pull` before the write. If pull fails with a conflict, blocks the write.

#### `post-write-push` (PostToolUse)

- **Matches:** Same tools as pre-write-pull
- **Behavior:** Instructs Claude to call `vault-push` after the write. If push fails, warns but does not roll back.

#### `session-start-check` (Notification)

- **Matches:** Session start
- **Behavior:** If current project branch is `main`, calls `vault-query` for exploratory notes. If found, tells user to run `/promote-to-vault`.

#### `observation-suggestion` (PostToolUse)

- **Matches:** `Write`, `Edit`, `MultiEdit` (project repo tools, not vault tools)
- **Behavior:** After Claude writes code, reviews whether the change involved an architectural decision, convention discovery, or notable debugging solution. If so, suggests a claim-style title and asks the user to confirm before creating a vault note.
- **Debouncing:** At most one suggestion per user prompt. Does not fire repeatedly within a single response.

### Promoter Agent

Dispatched by `/promote-to-vault`:

1. Receives branch name and list of exploratory notes
2. Reads each note + optionally reads related session transcripts from `sessions/`
3. Assesses accuracy against the merged code
4. Recommends: promote as-is, edit then promote, or discard
5. Returns recommendations to the skill for developer approval

#### Session Transcript Format

Session transcripts in `sessions/` are optional raw captures. Naming convention: `YYYY-MM-DD-<branch>-<short-description>.md`. No frontmatter required — these are reference material, not lifecycle-managed notes. The promoter agent reads them for context but they are not promoted or discarded. Populating `sessions/` is left to the developer (manual paste, future automation, or export from Claude Code).

---

## Frontmatter Schema

```yaml
---
title: "Claim-style title describing what this note asserts"
status: exploratory | established
branch: feature/xyz          # required when status is exploratory, removed on promote
author: github-username
created: 2026-03-16
established: 2026-03-18      # added on promote, only on established notes
tags: [architecture, api, drizzle]
project: key-and-arrow        # which project repo this relates to
---
```

### Validation Rules

- `title` — required, non-empty
- `status` — required, one of: `exploratory`, `established` (`archived` deferred to v2)
- `branch` — required when `status: exploratory`, rejected when `status: established`
- `author` — required, auto-filled from config
- `created` — required, auto-filled on create
- `established` — required when `status: established`, auto-filled on promote
- `tags` — required, must be array (can be empty)
- `project` — required

### Note Naming Convention

Notes are named as claims, not categories:

- NOT `memory-systems.md` → instead `memory graphs beat giant context dumps.md`
- NOT `auth-architecture.md` → instead `JWT refresh tokens prevent session fixation attacks.md`
- NOT `testing-strategy.md` → instead `integration tests must hit real database not mocks.md`

### Wikilink Convention

Links read as prose:

```markdown
We learned that [[memory graphs beat giant context dumps]]
when we [[benchmarked retrieval across vault sizes]].
```

The MCP server does not parse or enforce wikilinks — this is an authoring convention for Obsidian's graph view.

---

## Git Sync & Conflict Resolution

### Write Flow

```
1. Pre-write: vault-pull
   ├── git pull --rebase
   ├── Success → proceed to write
   └── Conflict →
       ├── git rebase --abort (clean up failed rebase)
       ├── git stash (save local changes)
       ├── git pull --rebase (should succeed now — local changes are stashed)
       ├── git stash pop (re-apply local changes)
       ├── Pop succeeds → proceed to write
       └── Pop fails (true conflict between local and remote) →
           ├── git stash drop (prevent orphan stashes)
           └── Return error: "Vault conflict on <files>. Resolve manually."

2. Write: MCP tool executes (create/update/promote/discard)

3. Post-write: vault-push
   ├── git add -A
   ├── git commit -m "vault: auto-sync from <author>"
   ├── git push
   ├── Success → done
   └── Push fails →
       └── Return warning: "Changes committed locally but push failed. Run vault-push to retry."
```

### Design Rationale

- **`git add -A`:** Vault is a dedicated repo with only markdown and config. No risk of staging secrets.
- **Rebase over merge:** Keeps history linear. Merge commits add noise.
- **Simple commit messages:** `vault: auto-sync from <author>`. The audit trail is in frontmatter, not commit messages.
- **No push retry loop:** If push fails (e.g., another developer pushed between pull and push), the note is committed locally. The next `vault-pull` will rebase the local commit onto the remote, resolving the race automatically.

### Editor Compatibility

| Behavior | Claude Code | Cursor |
|----------|-------------|--------|
| Auto-pull before write | PreToolUse hook calls `vault-pull` | User calls `vault-pull` manually or via prompt rule |
| Auto-push after write | PostToolUse hook calls `vault-push` | User calls `vault-push` manually or via prompt rule |
| Session-start check | Notification hook | Not available — user runs `/promote-to-vault` manually |
| Observation suggestions | PostToolUse hook on Write/Edit | Not available |

---

## Error Handling & Edge Cases

### MCP Server Errors

| Scenario | Behavior |
|----------|----------|
| `vault-init` never run | All tools return: "Vault not configured. Run vault-init with your vault path and username." |
| Vault path doesn't exist | `vault-init` returns: "Path not found. Clone your vault repo first." |
| Vault path isn't a git repo | `vault-init` returns: "Not a git repo. Clone your vault repo to this path." |
| Note already exists (same title) | `vault-create-note` returns error with existing note path |
| Promote a non-exploratory note | `vault-promote` returns: "Note is already `<status>`. Only exploratory notes can be promoted." |
| Frontmatter validation fails | Returns specific field error |
| Vault path is on detached HEAD | Git tools warn but don't block. Sync tools skip push. |

### Hook Failures (Claude Code)

| Scenario | Behavior |
|----------|----------|
| Pre-write pull fails | Hook blocks the write. User sees error. |
| Post-write push fails | Hook warns, does not roll back. |
| Session-start check fails | Silent — don't block session start. |
| MCP server not running | Hook fails, Claude Code shows error. |

### Multi-developer Scenarios

| Scenario | Behavior |
|----------|----------|
| Simultaneous note creation | Pre-write pull + post-write push serializes via git. |
| Duplicate promotion | Second dev sees "Already promoted by <author>." |
| Promote during active writing | No conflict — different files. |
| Branch deleted during note writing | Notes become orphaned, caught by `vault-cleanup`. |

---

## Testing Strategy

### MCP Server (`vault-mcp`)

**Unit tests:**
- Frontmatter parsing and validation
- Filename generation from titles
- File placement logic (tag → folder mapping)
- Git command construction

**Integration tests** (real git repos in temp directories):
- Full CRUD cycle: create → read → update → delete
- Promote lifecycle: create exploratory → promote → verify frontmatter
- Query by status, branch, project, tags
- Search by content
- Git sync: pull, push, status
- Conflict resolution: simulate concurrent edits, verify stash/pop/abort

No mocks for git — tests run against real repos.

### Claude Code Plugin (`vault-sync`)

- Manual testing script — checklist of scenarios for live Claude Code sessions
- Hook prompts tested via manual verification in live Claude Code sessions (verify correct MCP tool invocation)
- Promoter agent tested against a prepared vault with known exploratory notes

### Vault Template (`vault-template`)

- Validation script: checks all seed notes have valid frontmatter, folder structure matches spec, .gitignore covers the right files

### Out of Scope for Testing

- Obsidian rendering
- smart-connections integration (optional add-on)
- Network failures beyond basic error handling

---

## Open Questions Resolved

| # | Question | Resolution |
|---|----------|------------|
| 1 | MCP tool name scoping for hooks | Custom MCP server — we define the tool names |
| 2 | smart-connections installation | Optional add-on, not a dependency |
| 3 | Auto-capture threshold | AI-suggested, human-approved |
| 4 | Vault per-project vs cross-project | One vault per team, `project` field filters |
| 5 | Conflict resolution | Stash/pull/pop, abort if pop fails |
| 6 | Obsidian plugin dependencies | smart-connections is optional, not required |
| 7 | brain-ingest (Layer 3) | Deferred — voice notes not in v1 |

## Deferred to Later Versions

- `archived` status and `vault-archive` tool (v2 lifecycle addition)
- Voice notes / `voice-notes/` folder
- brain-ingest audio ingestion
- Automatic observation capture (without human approval)
- smart-connections as a bundled dependency
- Cross-vault federation (multiple teams sharing knowledge)
- Vault-mcp version tracking and migration between schema versions

---

## Build Order

1. **Create the template repo** (`vault-template`) — folder structure, .gitignore, README with conventions, seed notes
2. **Scaffold the MCP server** (`vault-mcp`) — package.json, tsconfig, MCP SDK setup, stdio transport
3. **Implement vault-init + config** — config file creation, path validation
4. **Implement note CRUD tools** — create, read, update, delete with frontmatter validation
5. **Implement lifecycle tools** — promote, discard
6. **Implement query and search tools** — frontmatter queries, full-text search
7. **Implement git sync tools** — pull (with conflict resolution), push, status
8. **Build the plugin skeleton** (`vault-sync`) — plugin.json with hooks and skill/agent stubs
9. **Implement `/vault-setup` skill** — onboarding flow
10. **Implement `/vault-note` skill** — manual note creation
11. **Implement prompt-based hooks** — pre-write-pull, post-write-push, session-start-check, observation-suggestion
12. **Implement `/promote-to-vault` skill + promoter agent** — lifecycle management
13. **Implement `/vault-cleanup` skill** — abandoned branch pruning
14. **Integration testing** — MCP server against real git repos
15. **End-to-end testing** — two developers, verify sync, deduplication, promotion flow
