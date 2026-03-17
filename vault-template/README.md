# Lore — Shared Team Knowledge Vault

This is a **git-synced Obsidian vault** for shared team knowledge. Fork or clone this template to create your team's living knowledge base — decisions, patterns, research, and hard-won debugging insights that survive beyond any single chat session.

---

## What This Is

Most team knowledge evaporates. It lives in Slack threads, forgotten PR comments, or the head of whoever was oncall last quarter. This vault is the antidote: a structured, version-controlled store of **validated team knowledge** that every developer (and every AI assistant) can read and write.

The vault is:

- **Git-backed** — all notes are markdown files, branched and merged like code
- **Obsidian-native** — browse, search, and link notes in Obsidian
- **AI-accessible** — Claude Code and Cursor can read and write notes via MCP tools
- **Claim-oriented** — notes are titled as assertions, not categories

---

## Folder Structure

```
vault/
├── 00-home/
│   ├── index.md          # Vault home / navigation hub
│   ├── top-of-mind.md    # Team's current priorities and focus
│   └── daily/            # Optional daily notes (per-developer, gitignored or branched)
├── atlas/
│   ├── projects.md       # Active projects overview
│   └── research.md       # Ongoing research areas
├── inbox/                # Unprocessed captures; new notes land here
├── knowledge/
│   ├── architecture/     # System design decisions and patterns
│   ├── conventions/      # Coding standards, naming, style decisions
│   ├── research/         # Evaluated libraries, approaches, tradeoffs
│   └── debugging/        # Solved problems, postmortems, gotchas
└── sessions/             # Raw AI session transcripts (optional, for archiving)
```

**Inbox-first flow:** New notes (from Claude, from Cursor, or written by hand) land in `inbox/`. They stay there while exploratory. When knowledge is validated and merged to main, notes move to the appropriate `knowledge/` subfolder.

---

## Frontmatter Schema

Every note should include YAML frontmatter. The full schema:

```yaml
---
title: "JWT refresh tokens prevent session fixation attacks"
status: exploratory          # exploratory | established
branch: feature/auth-rework  # git branch where this was captured (optional)
author: mahuebel             # who wrote or validated this
created: 2026-03-17
established: 2026-03-20      # date promoted to established (set on merge)
tags: [auth, security, jwt]
project: payments-v2         # links note to a project in atlas/projects.md
---
```

Field notes:

- `status` is the lifecycle stage. New notes start as `exploratory`. They become `established` when merged to main.
- `branch` records where the knowledge was generated — useful for tracing context.
- `established` is set at merge time (manually or by the vault-sync plugin).
- `project` is a freeform string matching a project entry in `atlas/projects.md`.

---

## Note Naming Convention

Titles and filenames should be **claim-style** — a declarative sentence that captures the insight, not a category label.

**Good** (claim-style):
- `JWT refresh tokens prevent session fixation attacks`
- `memory graphs beat giant context dumps`
- `postgres advisory locks prevent double-processing`
- `next.js app router requires async server components for data fetching`

**Avoid** (category-style):
- `auth architecture`
- `database patterns`
- `next.js notes`

Why: claim-style titles make notes scannable, surfaceable, and useful as wikilinks that read like prose.

---

## Wikilink Convention

Wikilinks should read naturally as prose in context. When linking from one note to another, the link text is the note's title — which works because titles are claims.

Example in a note body:

```markdown
We moved to refresh token rotation because [[JWT refresh tokens prevent session fixation attacks]].
The tradeoff: [[stateless JWTs make distributed revocation hard]].
```

Obsidian renders `[[note title]]` as a clickable link. Claude Code and MCP tools understand wikilinks when reading notes.

---

## Note Lifecycle

```
capture → exploratory (inbox/) → PR review → established (knowledge/) → referenced forever
                                                    ↓
                                           discarded on branch abandonment
```

1. **Capture**: A note is created in `inbox/` on a feature branch. Status is `exploratory`.
2. **Review**: The branch is PRed. Notes are reviewed alongside code.
3. **Promote**: On merge, notes move to the appropriate `knowledge/` subfolder and status becomes `established`.
4. **Discard**: If the branch is abandoned, its notes are abandoned too (never merged).

This means `knowledge/` only ever contains things the team has stood behind.

---

## Using with Claude Code

Claude Code integrates with this vault via three slash commands (defined in the `lore` monorepo):

### `/vault-note`

Capture a new exploratory note from the current session.

```
/vault-note JWT refresh tokens prevent session fixation attacks
```

Creates a note in `inbox/` on the current branch with `status: exploratory` and full frontmatter.

### `/promote-to-vault`

Promote an `inbox/` note to `knowledge/` and mark it `established`.

```
/promote-to-vault "JWT refresh tokens prevent session fixation attacks"
```

Moves the file to the appropriate subfolder, sets `status: established` and `established: <today>`.

### `/vault-cleanup`

Review all `exploratory` notes on the current branch and decide what to promote, discard, or defer.

```
/vault-cleanup
```

Lists exploratory notes with a summary, prompting for a decision on each.

---

## Using with Cursor / Other Editors

If you're not using Claude Code, access vault knowledge directly via **MCP tools** (requires the `vault-mcp` server from the `lore` monorepo to be running):

| Tool | What it does |
|---|---|
| `vault-create-note` | Create a new note with frontmatter |
| `vault-query` | Search notes by status, tags, project, or full-text |
| `vault-promote` | Move a note from inbox to knowledge and set status |
| `vault-list` | List notes in a folder |
| `vault-read` | Read a specific note |
| `vault-update` | Update frontmatter fields on an existing note |

See the `vault-mcp` package in the `lore` monorepo for setup instructions.

---

## Git Workflow

1. **Fork or clone** this template to create your team's vault repo.
2. **Each developer clones** the vault repo locally and opens it in Obsidian.
3. **AI sessions create notes on feature branches** — same branch as the code being worked on.
4. **PRs include note reviews** — vault changes are part of the review, not an afterthought.
5. **Main branch = validated knowledge** — only `established` knowledge lives here.

The `.gitignore` excludes per-user Obsidian workspace files so each developer's UI layout stays local.

---

## Setup

1. Fork or clone this repo
2. Open the folder as a vault in Obsidian (File → Open Vault → select this folder)
3. Customize `00-home/index.md` and `atlas/projects.md` with your team's context
4. Configure the `vault-mcp` server (see `lore` monorepo) to enable AI tool access
5. Add the vault path to your Claude Code / Cursor MCP config

---

## Contributing to Vault Notes

Notes in `knowledge/` are team property. Anyone can:

- Open a PR to update or correct an established note
- Add a new note on a feature branch and promote it at merge time
- Link new notes to existing ones — wikilinks are the connective tissue

Treat vault notes like code: review them, question them, and update them when you learn something new.
