---
name: setup
description: Set up the shared knowledge vault - clone repo, configure MCP server, verify connection
---

# /setup — Set Up the Shared Knowledge Vault

You are guiding the developer through a one-time setup of their shared knowledge vault. Follow these steps in order.

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
