# Shared Knowledge Vault — Full Build Spec

**Date:** 2026-03-16
**Status:** Ready to build
**Goal:** A Claude Code plugin + GitHub template repo that gives any dev team a shared, git-synced Obsidian knowledge vault with automatic lifecycle management.

---

## Problem

Per-developer memory tools (claude-mem, auto-memory, `.claude/` files) work well for individual context, but they're invisible to the rest of the team. When a different developer — or the same developer in a fresh session — picks up work, the context rebuilding starts from scratch. Team knowledge about architecture, conventions, and past decisions exists only in people's heads or scattered across Slack threads and PR comments.

## Solution

A shared, persistent knowledge layer alongside existing per-developer memory:

| Tier | System | Purpose | Scope |
|------|--------|---------|-------|
| Ephemeral | Claude-mem (existing) | Session-level debugging context, throwaway observations | Local, per-developer |
| Persistent | Obsidian vault (git repo) | Validated team knowledge, architecture decisions, research | Shared, cross-project |

Notes in the vault follow a **git-like lifecycle** via frontmatter tags:

```
exploratory → established (on merge to main)
exploratory → discarded (on branch abandonment)
```

---

## Deliverables

### 1. GitHub Template Repo: `vault-template`

A template repository that teams fork/clone to create their shared vault.

#### Folder Structure

```
vault-template/
├── .gitignore                 # Obsidian workspace files, .DS_Store
├── .obsidian/
│   └── app.json               # Minimal Obsidian config (no plugins required)
├── README.md                  # Conventions, onboarding, frontmatter schema
├── 00-home/
│   ├── index.md               # Map of content — top-level navigation
│   ├── daily/                 # Daily notes (optional)
│   └── top-of-mind.md         # Current priorities and focus areas
├── atlas/
│   ├── projects.md            # Active projects overview
│   └── research.md            # Research areas overview
├── inbox/                     # Unprocessed captures, new notes land here
├── knowledge/
│   ├── architecture/          # Architecture decisions
│   ├── conventions/           # Code conventions, naming, patterns
│   ├── research/              # Curated research notes
│   └── debugging/             # Recurring problems and solutions
├── sessions/                  # Raw session transcripts (optional)
└── voice-notes/               # Transcribed voice captures (optional, Layer 3)
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
```

#### Frontmatter Schema

All notes in the vault MUST have frontmatter. This is the schema:

```markdown
---
title: "Claim-style title describing what this note asserts"
status: exploratory | established | archived
branch: feature/xyz          # only when status is exploratory
author: github-username
created: 2026-03-16
established: 2026-03-18      # date when promoted, only on established notes
tags: [architecture, api, drizzle]
project: key-and-arrow        # which project repo this relates to
---
```

#### Note Naming Convention

Notes are named as **claims**, not categories:

- NOT `memory-systems.md` → instead `memory graphs beat giant context dumps.md`
- NOT `auth-architecture.md` → instead `JWT refresh tokens prevent session fixation attacks.md`
- NOT `testing-strategy.md` → instead `integration tests must hit real database not mocks.md`

This allows Claude to assess relevance from search result titles alone, before reading content.

#### Wikilink Convention

Links read as prose (wiki-link-as-prose):

```markdown
We learned that [[memory graphs beat giant context dumps]]
when we [[benchmarked retrieval across vault sizes]].
```

---

### 2. Claude Code Plugin: `vault-sync`

A Claude Code plugin that handles vault sync, note lifecycle, and onboarding.

#### Plugin Structure

```
vault-sync/
├── plugin.json
├── README.md
├── skills/
│   ├── setup.md               # Onboarding: install deps, configure MCP, clone vault
│   ├── promote.md             # /promote-to-vault — review & promote exploratory notes
│   ├── cleanup.md             # /vault-cleanup — prune abandoned branch notes
│   └── vault-note.md          # /vault-note — manually create a note with proper frontmatter
├── hooks/
│   ├── pre-write-pull.sh      # PreToolUse: git pull vault before MCP writes
│   ├── post-write-push.sh     # PostToolUse: git commit + push vault after MCP writes
│   └── session-start-check.sh # Notification: check for unprocessed merges on main
├── agents/
│   └── promoter.md            # Agent that reviews exploratory notes and proposes promotions
└── templates/
    └── note-template.md       # Default frontmatter template for new notes
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
      "description": "Set up the shared knowledge vault: install MCP servers, clone vault repo, configure hooks",
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
  "hooks": [],
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

### 3. Component Specifications

#### 3A. Setup Skill (`/vault-setup`)

**What it does:**
1. Asks the developer for:
   - Vault repo URL (e.g., `github.com/team/knowledge-vault`)
   - Local path for the vault (default: `~/obsidian/team-vault`)
   - Their GitHub username (for `author` field in frontmatter)
2. Clones the vault repo to the local path
3. Installs MCP dependencies:
   ```bash
   pip install smart-connections-mcp
   npm install -g @tobilu/qmd
   ```
4. Writes MCP config to Claude Code settings:
   ```json
   {
     "mcpServers": {
       "smart-connections": {
         "command": "python",
         "args": ["-m", "smart_connections_mcp"],
         "env": {
           "OBSIDIAN_VAULT_PATH": "<local-vault-path>"
         }
       },
       "qmd": {
         "command": "qmd",
         "args": ["mcp"],
         "env": {
           "HOME": "~"
         }
       }
     }
   }
   ```
5. Installs the git sync hooks (see 3D below)
6. Confirms setup by running a test query against the vault

**Output:** "Vault connected. You can now search with smart-connections and create notes with qmd."

#### 3B. Promote Skill (`/promote-to-vault`)

**What it does:**
1. Determines current git branch of the **project repo** (not the vault)
2. If on `main`: asks which recently-merged branch to promote (lists branches merged since last promotion)
3. Queries the vault via qmd for all notes where `status: exploratory` AND `branch: <branch-name>`
4. If no exploratory notes found: "No exploratory notes for this branch. Nothing to promote."
5. If notes found but already `established`: "These notes were already promoted by <author>. Want to add supplementary notes?"
6. If exploratory notes found: displays them and prompts the developer to:
   - **Promote** → update `status` to `established`, add `established: <today>`, remove `branch` field
   - **Edit & promote** → open for revision before promoting
   - **Discard** → delete the note from the vault
   - **Skip** → leave as exploratory for now
7. Commits and pushes changes to the vault repo

**Deduplication:** Because promotion updates existing notes (not creating new ones), and the hook pulls before writing, two developers can't accidentally duplicate. If dev B runs promote and finds notes already `established`, they know dev A handled it.

#### 3C. Cleanup Skill (`/vault-cleanup`)

**What it does:**
1. Queries the vault for all notes where `status: exploratory`
2. For each unique `branch` value, checks if that branch still exists in the project repo (local or remote)
3. Groups results:
   - **Orphaned** — branch no longer exists (deleted/merged without promotion)
   - **Stale** — branch exists but hasn't been updated in 30+ days
   - **Active** — branch still in active development
4. Prompts developer to bulk delete orphaned notes, review stale ones

#### 3D. Git Sync Hooks

**PreToolUse hook (pre-write-pull.sh):**
- Triggers on: MCP tool calls that write to the vault (qmd create, qmd update, etc.)
- Action: `cd <vault-path> && git pull --rebase --quiet`
- If pull fails (conflict): abort the tool call, notify user

**PostToolUse hook (post-write-push.sh):**
- Triggers on: same MCP write tools
- Action:
  ```bash
  cd <vault-path>
  git add -A
  git commit -m "vault: auto-sync from <username>" --quiet
  git push --quiet
  ```
- If push fails: notify user, don't retry (they can manually resolve)

**Session-start hook (session-start-check.sh):**
- Triggers on: `Notification` event (session start)
- Action: checks if current project branch is `main` and if there are recent merge commits that have corresponding `status: exploratory` notes in the vault
- Output: "Found X exploratory notes from recently merged branches. Run /promote-to-vault to review."

#### 3E. Note Creation (automatic via hooks or manual via `/vault-note`)

**When Claude writes a meaningful observation during work**, the system should create a vault note. This can happen:
- Automatically via a PostToolUse hook that detects significant observations
- Manually when the developer runs `/vault-note`

**Note template:**
```markdown
---
title: "<claim-style title>"
status: exploratory
branch: <current-branch>
author: <github-username>
created: <today>
tags: []
project: <project-name>
---

<content>

## Context
- Branch: `<branch>`
- Related files: `<file paths>`

## See Also
- [[related note if any]]
```

#### 3F. Promoter Agent

**Purpose:** When `/promote-to-vault` is run, this agent handles the heavy lifting.

**Behavior:**
1. Receives the branch name and list of exploratory notes
2. For each note:
   - Reads the content
   - Assesses whether it's still accurate given the merged code
   - Suggests edits if the content is outdated
   - Recommends promote/edit/discard
3. For claude-mem observations from the same branch's sessions:
   - Scans for observations not already captured in vault notes
   - Proposes new vault notes for valuable uncaptured knowledge
4. Presents all recommendations to the developer for approval

---

### 4. MCP Server Details

#### smart-connections

- **Install:** `pip install smart-connections-mcp`
- **Purpose:** Semantic/vector search over the vault. Claude can find relevant notes even when it doesn't know the exact title.
- **When Claude uses it:** Searching for related knowledge during work ("have we solved something like this before?")

#### qmd (@tobilu/qmd)

- **Install:** `npx -y @tobilu/qmd mcp` or `npm install -g @tobilu/qmd`
- **Purpose:** Structured CRUD operations on vault notes — create, read, update, delete by path, tag, or metadata query.
- **When Claude uses it:** Creating new notes, updating frontmatter status, querying by branch/status/tag.
- **Repo:** https://github.com/tobilu/qmd

---

## Developer Onboarding Flow

A new developer joining the team does this:

1. **Install the plugin:**
   ```
   claude plugins install vault-sync
   ```

2. **Run setup:**
   ```
   /vault-setup
   ```
   - Prompted for: vault repo URL, local path, GitHub username
   - Plugin clones repo, installs MCP servers, configures hooks

3. **Install Obsidian** (optional but recommended):
   - Open the vault folder as an Obsidian vault
   - Browse, search, and edit notes visually

4. **Start working:**
   - During branch work, meaningful notes auto-capture to vault as `exploratory`
   - On merge, run `/promote-to-vault` (or get prompted by session-start hook)
   - Periodically run `/vault-cleanup` to prune dead branches

Total setup time target: **under 5 minutes.**

---

## Open Questions to Resolve During Build

1. **MCP tool name scoping:** What are the exact qmd tool names to scope hooks to? Need to install qmd and inspect available tools.

2. **smart-connections installation:** Verify `pip install smart-connections-mcp` is the correct package. The tweet references a `server.py` path — may need to clone a repo instead.

3. **Auto-capture threshold:** What makes an observation "worth vaulting" during branch work? Options:
   - Only vault when explicitly asked (`/vault-note`)
   - Vault architecture decisions, bug solutions, and convention discoveries automatically
   - Let the developer configure the threshold

4. **Vault per-project vs cross-project:** Should each project have its own vault, or one vault per team? The `project` frontmatter field supports cross-project, but folder structure might need adjustment.

5. **Conflict resolution:** If `git pull --rebase` fails in the pre-write hook, what's the graceful fallback? Stash + pull + pop? Notify and skip?

6. **Obsidian plugin dependencies:** Does smart-connections require the Obsidian plugin to be installed too, or does the MCP server work standalone against raw markdown files?

7. **brain-ingest (Layer 3):** The tweet mentions this tool for ingesting YouTube/audio into vault notes. Evaluate whether to include this in v1 or defer. Repo: https://github.com/0xNyk/lacp

---

## Build Order

1. **Create the template repo** — folder structure, .gitignore, README with conventions
2. **Install and test MCP servers locally** — verify smart-connections and qmd work against the template vault
3. **Build the plugin skeleton** — plugin.json, empty skill/hook files
4. **Implement `/vault-setup` skill** — the onboarding flow
5. **Implement git sync hooks** — pre-write pull, post-write push
6. **Implement `/vault-note` skill** — manual note creation with frontmatter
7. **Implement `/promote-to-vault` skill + promoter agent** — the lifecycle management
8. **Implement `/vault-cleanup` skill** — abandoned branch pruning
9. **Implement session-start hook** — merge detection and promotion prompts
10. **Test with two developers** — verify sync, deduplication, and promotion flow
11. **Write onboarding docs** — README for the plugin, README for the template repo
