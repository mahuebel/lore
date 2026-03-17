# Lore

A persistent, git-synced knowledge base for dev teams — readable by humans in Obsidian and by AI assistants via MCP.

Lore gives your team a shared vault where architecture decisions, coding conventions, debugging insights, and research findings accumulate over time instead of getting lost between sessions. Notes are written as claims, reviewed like code, and promoted through a lifecycle that mirrors your git workflow.

## Why

Per-developer memory tools (claude-mem, auto-memory, `.claude/` files) work well for individual context, but they're invisible to the rest of the team. When a new developer joins a session — or the same developer starts a fresh one — the context rebuilding starts over. Lore solves this by making team knowledge a shared, versioned artifact that any editor can read and write through MCP.

Notes follow a git-like lifecycle: `exploratory` on feature branches, promoted to `established` on merge, or discarded on branch abandonment. Only validated knowledge reaches main.

## Packages

```
lore/
├── vault-template/    GitHub template repo — fork this to create your vault
├── vault-mcp/         TypeScript MCP server — portable vault operations
├── vault-sync/        Claude Code plugin — intelligent orchestration layer
└── vault-animation/   Remotion animations for demos
```

### vault-template

A GitHub template repo that teams fork to create their shared vault. Includes folder structure, seed content, frontmatter schema, and conventions.

### vault-mcp

A TypeScript MCP server that provides 12 tools for vault operations. Works with any MCP-compatible editor — Claude Code, Cursor, Windsurf, VS Code Copilot, etc.

**Tools:**

| Category | Tools |
|----------|-------|
| Config | `vault-init` |
| CRUD | `vault-create-note`, `vault-read-note`, `vault-update-note`, `vault-delete-note` |
| Lifecycle | `vault-promote`, `vault-discard` |
| Query | `vault-query`, `vault-search` |
| Git Sync | `vault-pull`, `vault-push`, `vault-status` |

### vault-sync

A Claude Code plugin that adds intelligent orchestration on top of vault-mcp:

- **Skills:** `/vault-note`, `/promote-to-vault`, `/vault-cleanup`, and a setup wizard
- **Hooks:** Auto-pull before writes, auto-push after writes, session-start promotion reminders, observation suggestions
- **Agent:** Promoter agent that reviews exploratory notes and recommends promote/edit/discard

### vault-animation

Remotion-based animations for project demos and documentation.

---

## Quick Start

### 1. Create your team vault

Go to [mahuebel/vault-template](https://github.com/mahuebel/vault-template) and click **"Use this template"** to create your team's vault repo. Then clone it locally:

```bash
git clone git@github.com:your-org/your-vault.git ~/obsidian/team-vault
```

### 2. Set up the MCP server

```bash
cd lore/vault-mcp
npm install
npm run build
```

### 3. Configure your editor

**Claude Code** — use the CLI:

```bash
claude mcp add --scope user \
  --env VAULT_PATH=/path/to/your/team-vault \
  --env VAULT_AUTHOR=your-github-username \
  -- vault-mcp node /path/to/lore/vault-mcp/dist/index.js
```

This registers the MCP server in `~/.claude.json` (user scope — available across all projects). Restart Claude Code after adding.

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vault-mcp": {
      "command": "node",
      "args": ["/path/to/lore/vault-mcp/dist/index.js"],
      "env": {
        "VAULT_PATH": "/path/to/your/team-vault",
        "VAULT_AUTHOR": "your-github-username"
      }
    }
  }
}
```

### 4. Initialize the vault connection

Call the `vault-init` MCP tool (or use `/vault-setup` in Claude Code):

```
vault-init --vault_path ~/obsidian/team-vault --author your-github-username
```

### 5. Install the Claude Code plugin (optional)

```bash
claude plugin marketplace add mahuebel/lore
claude plugin install vault-sync@lore
```

This adds the slash commands (`/vault-note`, `/promote-to-vault`, `/vault-cleanup`) and automatic hooks for git sync and observation suggestions. Restart Claude Code after installing.

### 6. Open in Obsidian (optional but recommended)

Open your vault folder as an Obsidian vault for visual browsing, graph view, and manual editing.

---

## How It Works

### Creating knowledge

During branch work, capture insights as vault notes:

```
/vault-note JWT refresh tokens prevent session fixation attacks
```

This creates a note in the vault with `status: exploratory` and the current branch name. The note is titled as a **claim** — a declarative statement, not a category.

### Promoting on merge

After merging a branch, review its exploratory notes:

```
/promote-to-vault
```

The promoter agent reads each note, checks accuracy against the merged code, and recommends: promote as-is, edit then promote, or discard.

### Cleaning up

Periodically prune notes from abandoned branches:

```
/vault-cleanup
```

Groups orphaned notes (branch deleted), stale notes (30+ days inactive), and active notes. Bulk discard what's no longer relevant.

### AI-suggested capture

With the vault-sync plugin, Claude Code automatically suggests saving vault-worthy observations after writing code. You confirm or dismiss — no noise, no missed insights.

---

## Frontmatter Schema

Every vault note has YAML frontmatter:

```yaml
---
title: "Claim-style title describing what this note asserts"
status: exploratory | established
branch: feature/xyz          # required when exploratory, removed on promote
author: github-username
created: 2026-03-17
established: 2026-03-20      # added on promote
tags: [architecture, api]
project: my-project
---
```

Notes are named as claims, not categories:
- `integration tests must hit real database not mocks.md`
- `JWT refresh tokens prevent session fixation attacks.md`
- `memory graphs beat giant context dumps.md`

---

## Vault Folder Structure

```
team-vault/
├── 00-home/           Navigation hub and daily notes
├── atlas/             Project and research overviews
├── inbox/             New, unprocessed notes land here
├── knowledge/
│   ├── architecture/  System design decisions
│   ├── conventions/   Coding standards and patterns
│   ├── research/      Evaluated libraries and approaches
│   └── debugging/     Solved problems and gotchas
└── sessions/          Raw session transcripts (optional)
```

Notes are placed automatically based on tags. `architecture` tag goes to `knowledge/architecture/`, `debugging` or `bug` goes to `knowledge/debugging/`, etc. Unrecognized tags land in `inbox/`.

---

## Development

### Running tests

```bash
cd vault-mcp
npm test           # run once
npm run test:watch # watch mode
```

### Building

```bash
cd vault-mcp
npm run build
```

### Project structure

```
vault-mcp/src/
├── index.ts           MCP server entry point (stdio transport, 12 tools)
├── vault/
│   ├── config.ts      .vault-mcp.json loading/saving
│   ├── frontmatter.ts Frontmatter parsing, validation, serialization
│   ├── files.ts       File placement, naming, CRUD
│   ├── query.ts       Frontmatter query engine
│   └── search.ts      Full-text grep search
├── git/
│   └── sync.ts        Pull (with conflict resolution), push, status
└── tools/             One file per MCP tool (12 total)
```

---

## Editor Compatibility

| Feature | Claude Code | Cursor / Others |
|---------|-------------|-----------------|
| All 12 MCP tools | Yes | Yes |
| Slash commands | Yes (via vault-sync plugin) | No |
| Auto git sync | Yes (via hooks) | Manual (`vault-pull` / `vault-push`) |
| Session-start reminders | Yes (via hooks) | No |
| Observation suggestions | Yes (via hooks) | No |

The MCP server is the universal layer. The Claude Code plugin adds convenience automation on top.

---

## Design Documents

- [Design Spec](docs/superpowers/specs/2026-03-16-shared-knowledge-vault-design.md)
- [Implementation Plan](docs/superpowers/plans/2026-03-16-shared-knowledge-vault.md)
