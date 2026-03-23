---
name: vault-setup
description: Set up a shared knowledge vault (global or per-project) - clone repo, create config, configure MCP server, verify connection
---

# /vault-setup — Set Up the Shared Knowledge Vault

You are guiding the developer through a one-time setup of their shared knowledge vault. Follow these steps in order.

## Mode Detection

Check the arguments passed to this skill:
- If `--project` is present → follow the **Per-Project Setup** flow below
- Otherwise → follow the existing **Global Setup** flow (Steps 1-6 below)

## Per-Project Setup

### Step P1: Gather Project Vault Configuration

Ask the developer for the following, one at a time:

1. **Remote URL** — git remote for the project vault, or "local" for a local-only vault. Default: local.
2. **Vault path** — where to store the vault on disk. Default: `~/.lore/vaults/<current-repo-name>/`.
3. **Author** — GitHub username. Default: use git config user.name if available.

Confirm all values before proceeding.

### Step P2: Initialize the Vault

If a remote URL was provided:
```bash
git clone <remote-url> <vault-path>
```

If local-only:
```bash
mkdir -p <vault-path> && cd <vault-path> && git init
```

### Step P3: Create `.lore/config.json`

Write `.lore/config.json` in the current project root:

```json
{
  "vault_path": "<vault-path>",
  "vault_remote": "<remote-url-or-omit>",
  "author": "<author>"
}
```

### Step P4: Ask About MCP Configuration

Ask: "Configure project-scoped MCP for Claude Code, Cursor, both, or neither? (If you have a global vault-mcp registration, 'neither' is fine — dynamic resolution will handle it.)"

If Claude Code: create/update `.mcp.json` with vault-mcp pointing to the project vault.
If Cursor: create/update `.cursor/mcp.json` similarly.
If both: create both files.

### Step P5: Ask About .gitignore

Ask: "Should `.lore/` be gitignored? (Yes for solo projects, No for team repos where everyone shares the vault pointer.)"

If yes, add `.lore/` to `.gitignore`.

### Step P6: Verify

Run `vault-query` to confirm the vault is accessible, then print:

```
Per-project vault configured:
  Vault: <vault-path>
  Config: .lore/config.json

Available commands:
  /vault-note         Create a new note
  /promote-to-vault   Promote notes after branch merge
  /vault-cleanup      Discard notes from abandoned branches
```

---

## Global Setup

## Step 1: Gather Configuration

Ask the developer for the following, one at a time. Accept defaults where provided:

1. **Vault repo URL** — the git remote URL for the shared Obsidian vault repository (e.g., `git@github.com:org/team-vault.git`). Required, no default.
2. **Local path** — where to clone the vault on disk. Default: `~/obsidian/team-vault`. Accept the default if the user presses Enter or says "default".
3. **GitHub username** — used as the `author` field in note frontmatter. Required.

Confirm all three values with the user before proceeding.

## Step 2: Clone the Vault Repository

Run the following bash command to clone the vault repo to the specified local path:

```bash
git clone <vault-repo-url> <local-path>
```

If the directory already exists, run `git -C <local-path> pull` instead and inform the user the vault was already cloned.

If the clone fails, report the error output verbatim and stop — do not continue to later steps.

## Step 3: Initialize the MCP Server

Call the `vault-init` MCP tool with:
- `vault_path`: the resolved absolute path to the cloned vault (expand `~` if needed)
- `author`: the GitHub username provided in Step 1

If `vault-init` returns an error, show the error and stop.

## Step 4: Optionally Install Smart Connections

Ask: "Would you like to install the smart-connections MCP server for semantic search across the vault? (y/n)"

If yes, run:
```bash
pip install smart-connections-mcp
```

Inform the user they may need to restart Claude Code for the MCP server to be picked up.

## Step 5: Verify the Setup

Call `vault-query` with no filters to confirm the MCP connection is working. If it returns successfully (even with zero notes), print:

```
Setup complete. Vault is connected and ready.
```

If it returns an error, print the error and suggest checking the vault_path and that the MCP server process is running.

## Step 6: Display Available Commands

Print a summary of available commands now that setup is complete:

```
Available vault commands:
  /vault-note         Create a new note capturing a discovery or decision
  /promote-to-vault   Review and promote exploratory notes after a branch merges
  /vault-cleanup      Find and discard notes from abandoned branches
```

Remind the user: notes created during feature branch work are marked `status: exploratory` and are promoted to `established` after the branch merges and is reviewed with `/promote-to-vault`.
