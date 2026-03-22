# Lore

A persistent, git-synced knowledge base for dev teams — readable by humans in Obsidian and by AI assistants via MCP.

Lore gives your team a shared vault where architecture decisions, coding conventions, debugging insights, and research findings accumulate over time instead of getting lost between sessions. Notes are written as claims, reviewed like code, and promoted through a lifecycle that mirrors your git workflow.

## Why

Per-developer memory tools (claude-mem, auto-memory, `.claude/` files) work well for individual context, but they're invisible to the rest of the team. When a new developer joins a session — or the same developer starts a fresh one — the context rebuilding starts over. Lore solves this by making team knowledge a shared, versioned artifact that any editor can read and write through MCP.

Notes follow a git-like lifecycle: `exploratory` on feature branches, promoted to `established` on merge, or discarded on branch abandonment. Only validated knowledge reaches main.

## Packages

```
lore/
├── vault-mcp/         TypeScript MCP server — portable vault operations
├── vault-sync/        Claude Code plugin — intelligent orchestration layer
└── vault-animation/   Remotion animations for demos
```

The vault template lives in its own repo: [mahuebel/vault-template](https://github.com/mahuebel/vault-template)

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

A Claude Code and Cursor plugin that adds intelligent orchestration on top of vault-mcp:

- **Skills:** `/vault-note`, `/promote-to-vault`, `/vault-cleanup`, and a setup wizard
- **Observation daemon:** Background service that silently captures tool use data and evaluates it for vault-worthiness using a separate AI session
- **Vault context injection:** Automatically searches the vault for relevant established notes and injects them into your session when you ask a question
- **Agent:** Promoter agent that reviews exploratory notes and recommends promote/edit/discard
- **claude-mem integration:** When claude-mem is installed, uses its pre-processed observations for richer evaluation (supercharged mode)

### vault-animation

Remotion-based animations for project demos and documentation.

---

## Quick Start

### 1. Create your team vault (global default)

Go to [mahuebel/vault-template](https://github.com/mahuebel/vault-template) and click **"Use this template"** to create your team's vault repo. Then clone it locally:

```bash
git clone git@github.com:your-org/your-vault.git ~/obsidian/team-vault
```

### 2. Configure the MCP server

No build step required — the server runs via `npx`:

**Claude Code:**

```bash
claude mcp add --scope user \
  --env VAULT_PATH=/path/to/your/team-vault \
  --env VAULT_AUTHOR=your-github-username \
  -- vault-mcp npx lore-vault-mcp
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vault-mcp": {
      "command": "npx",
      "args": ["lore-vault-mcp"],
      "env": {
        "VAULT_PATH": "/path/to/your/team-vault",
        "VAULT_AUTHOR": "your-github-username"
      }
    }
  }
}
```

Restart your editor after adding.

### 3. Initialize the vault connection

Call the `vault-init` MCP tool (or use `/vault-setup` if you installed the plugin):

```
vault-init --vault_path ~/obsidian/team-vault --author your-github-username
```

### 4. Install the vault-sync plugin (recommended)

This adds skills, hooks, and the promoter agent. See [Editor Compatibility](#editor-compatibility) for install instructions per editor.

### 5. Open in Obsidian (optional)

Open your vault folder as an Obsidian vault for visual browsing, graph view, and manual editing.

---

## Per-Repo Vaults

By default, Lore uses a single global vault at `~/.lore/vault/`. This works well for teams working on related products that share conventions and architecture knowledge. But if you work across unrelated projects — or as a freelancer switching between clients — you may want a separate vault per repository.

### When to use per-repo vaults

- **Global vault (default):** Best for teams on related products who benefit from shared context across repos
- **Per-repo vault:** Best for unrelated projects, freelancers with multiple clients, or repos with sensitive knowledge that shouldn't leak across projects

### Quick start

Run the setup wizard in any project:

```
/vault-setup --project
```

This creates a `.lore/config.json` in your project root with your vault configuration.

### Configuration format

The `.lore/config.json` file:

```json
{
  "vault_path": "~/.lore/vaults/my-project",
  "vault_remote": "git@github.com:user/my-project-vault.git",
  "author": "your-username"
}
```

### Resolution chain

When vault-mcp starts, it resolves the vault path using this priority order:

1. **`.lore/config.json`** in the project's working directory (highest priority)
2. **`VAULT_PATH`** environment variable
3. **`~/.lore/vault/`** global default (lowest priority)

This means per-repo configs override the global setup without requiring any environment variable changes.

### Default path convention

Per-repo vaults are stored at `~/.lore/vaults/<repo-name>/` by convention. This keeps them outside the project directory (so they don't clutter your repo) while keeping each project's knowledge separate.

### Cross-tool support

Per-repo vault resolution works with any MCP client:

- **Claude Code** — user-scoped registration via `claude mcp add --scope user`, project resolved from `process.cwd()`
- **Cursor** — project-scoped `.cursor/mcp.json`, project resolved from workspace root
- **Any MCP client** — as long as the server starts in the project directory, `.lore/config.json` will be found

Because the resolution happens inside the MCP server, you can register vault-mcp once globally and it will automatically use the right vault for each project.

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

### Automatic context injection

When you ask a question or describe a task, vault-sync searches the vault for relevant established notes and injects them into the session. You don't need to search manually — the vault feeds you relevant team knowledge automatically.

### Observation capture

The vault-sync daemon silently captures tool use observations during your session. At the end of each turn, it evaluates whether anything vault-worthy happened. If so, suggestions appear at the start of your next session — no interruptions during work.

If [claude-mem](https://github.com/thedotmack/claude-mem) is installed, vault-sync uses its pre-processed observations instead of capturing its own (supercharged mode). This avoids duplication and provides richer evaluation data.

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

The vault-sync plugin ships with both `.claude-plugin/` and `.cursor-plugin/` adapters, so hooks and skills work in both editors.

| Feature | Claude Code | Cursor |
|---------|-------------|--------|
| All 12 MCP tools | Yes | Yes |
| Skills (`/vault-note`, `/promote-to-vault`, `/vault-cleanup`) | Yes | Yes |
| Auto git sync (built into MCP tools) | Yes | Yes |
| Vault context injection (UserPromptSubmit hook) | Yes | Yes |
| Observation capture (PostToolUse hook + daemon) | Yes | Yes |
| Vault suggestions at session start | Yes | Yes |
| claude-mem supercharged mode | Yes | Yes |
| Promoter agent | Yes | Yes |

### Installing in Claude Code

```bash
claude plugin marketplace add mahuebel/lore
claude plugin install vault-sync@lore
```

### Installing in Cursor

**From the Marketplace** (once published): Search for "vault-sync" in Cursor Settings > Marketplace.

**Before publishing**, use one of these options:

- **Agent chat**: Type `/add-plugin` and point it to the local path where you cloned this repo (e.g., `/path/to/lore/vault-sync`)
- **Team import** (Teams/Enterprise plans): Go to Dashboard > Settings > Plugins > Import, paste `mahuebel/lore`
- **Direct GitHub import**: In Cursor Settings > Plugins, import from the GitHub repo URL `mahuebel/lore`

Both platforms share the same skills, agents, and hooks — just with platform-specific adapter directories.

---

## Design Documents

- [Design Spec](docs/superpowers/specs/2026-03-16-shared-knowledge-vault-design.md)
- [Implementation Plan](docs/superpowers/plans/2026-03-16-shared-knowledge-vault.md)
