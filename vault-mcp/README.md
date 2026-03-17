# lore-vault-mcp

An MCP server that gives AI coding assistants persistent, shared access to your team's knowledge vault — an Obsidian-compatible, git-synced collection of markdown notes with frontmatter-based lifecycle management.

Works with Claude Code, Cursor, Windsurf, VS Code Copilot, and any MCP-compatible editor.

## Quick Setup

### Claude Code

```bash
claude mcp add --scope user \
  --env VAULT_PATH=/path/to/your/team-vault \
  --env VAULT_AUTHOR=your-github-username \
  -- vault-mcp npx lore-vault-mcp
```

### Cursor

Add to `.cursor/mcp.json`:

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

### Other MCP Clients

Any client that supports stdio MCP servers can connect:

```json
{
  "command": "npx",
  "args": ["lore-vault-mcp"],
  "env": {
    "VAULT_PATH": "/path/to/your/team-vault",
    "VAULT_AUTHOR": "your-github-username"
  }
}
```

## Creating a Vault

Use the [vault-template](https://github.com/mahuebel/vault-template) to create your team's vault:

1. Click **"Use this template"** on GitHub to create your team's repo
2. Clone it locally: `git clone git@github.com:your-org/your-vault.git ~/obsidian/team-vault`
3. Configure the MCP server (see above)
4. Call the `vault-init` tool to initialize

## Tools (12)

### Config

| Tool | Description |
|------|-------------|
| `vault-init` | Initialize server config — validates vault path, creates `.vault-mcp.json` |

### Note CRUD

| Tool | Description |
|------|-------------|
| `vault-create-note` | Create a note with validated frontmatter. Auto-places in `knowledge/` subfolder based on tags. |
| `vault-read-note` | Read a note by path or title (case-insensitive substring match) |
| `vault-update-note` | Update content and/or frontmatter fields (cannot change status directly) |
| `vault-delete-note` | Delete an exploratory note (established notes are protected) |

### Lifecycle

| Tool | Description |
|------|-------------|
| `vault-promote` | Transition a note from `exploratory` to `established` — sets date, removes branch |
| `vault-discard` | Delete an exploratory note with a reason logged in the commit message |

### Query & Search

| Tool | Description |
|------|-------------|
| `vault-query` | Filter notes by status, branch, project, tags, author, or date range |
| `vault-search` | Full-text search across all notes (case-insensitive, with context) |

### Git Sync

| Tool | Description |
|------|-------------|
| `vault-pull` | Pull latest from remote with automatic conflict resolution (rebase + stash/pop) |
| `vault-push` | Stage, commit, and push changes. Accepts optional custom commit message. |
| `vault-status` | Show uncommitted changes, ahead/behind counts, current branch |

## Frontmatter Schema

Every note has YAML frontmatter:

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

Notes are titled as claims, not categories:
- `integration tests must hit real database not mocks.md`
- `JWT refresh tokens prevent session fixation attacks.md`

## Note Lifecycle

```
exploratory (on feature branch)
    ├── promote → established (on merge)
    └── discard → deleted (on branch abandonment)
```

Notes are placed automatically based on tags:
- `architecture` → `knowledge/architecture/`
- `convention` or `pattern` → `knowledge/conventions/`
- `research` → `knowledge/research/`
- `debugging` or `bug` → `knowledge/debugging/`
- No matching tag → `inbox/`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAULT_PATH` | Yes | Absolute path to the vault git repo |
| `VAULT_AUTHOR` | Yes | GitHub username (used in frontmatter and commit messages) |

## Companion Plugin

For automated git sync hooks, observation suggestions, and guided workflows, install the **vault-sync** plugin:

- **Claude Code**: `claude plugin marketplace add mahuebel/lore && claude plugin install vault-sync@lore`
- **Cursor**: Import from GitHub repo `mahuebel/lore` in Settings > Plugins

The plugin adds skills (`/vault-note`, `/promote-to-vault`, `/vault-cleanup`), automatic pre/post-write git sync, and a promoter agent that reviews notes for promotion.

## Links

- [Lore monorepo](https://github.com/mahuebel/lore) — full source, design docs, plugin
- [vault-template](https://github.com/mahuebel/vault-template) — fork this to create your vault
- [Design spec](https://github.com/mahuebel/lore/blob/main/docs/superpowers/specs/2026-03-16-shared-knowledge-vault-design.md)

## License

MIT
