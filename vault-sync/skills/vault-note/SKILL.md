---
name: vault-note
description: Create a new note in the vault with proper frontmatter and wikilinks
command: vault-note
---

# /vault-note — Create a New Note in the Vault

You are helping the developer capture a discovery, decision, or insight into the shared knowledge vault. Follow these steps.

## Step 1: Gather the Insight

If the user provided text after the `/vault-note` command, use that as the starting insight. Otherwise ask:

> "What did you discover or decide? Describe it in one or two sentences."

## Step 2: Propose a Claim-Style Title

Draft a title that states the insight as a concrete, falsifiable claim. The title should be a complete sentence or noun phrase that conveys the finding — not a category label.

**Good titles:**
- "JWT refresh tokens prevent session fixation attacks when rotated on each use"
- "Prisma's `findMany` does not paginate by default — always pass `take` in list queries"
- "React Query's staleTime should be set per-query, not globally, to avoid over-fetching"

**Bad titles (reject these patterns):**
- "auth-architecture" — too vague, just a topic
- "database notes" — a folder label, not a claim
- "React Query tips" — not specific enough

Present the proposed title to the user and ask: "Does this title work, or would you like to adjust it?"

Accept their edit or confirm the proposed title.

## Step 3: Auto-Detect Branch and Project

Run these commands silently to gather context:

```bash
git branch --show-current
```

```bash
git remote get-url origin
```

Derive the **project name** from the remote URL: take the repository name portion (e.g., `my-app` from `git@github.com:org/my-app.git` or `https://github.com/org/my-app`). If git is not available or the directory is not a repo, ask the user for the project name.

If the branch detection fails, use `unknown` as the branch.

## Step 4: Ask for Tags

Present the standard tag options and ask the user to pick one or more (or provide custom tags):

- `architecture` — structural decisions about how the system is organized
- `convention` — team or language conventions that are easy to forget
- `pattern` — recurring implementation patterns or idioms
- `research` — findings from investigation or spike work
- `debugging` — how a specific bug was diagnosed or fixed
- `bug` — a known bug, workaround, or gotcha
- Custom tag — any other lowercase hyphenated label

Accept a comma-separated list. Example: `architecture, convention`

## Step 5: Create the Note

Call the `vault-create-note` MCP tool with:
- `title`: the confirmed claim-style title
- `status`: `"exploratory"`
- `branch`: the detected branch name
- `project`: the derived project name
- `author`: (use the author configured during vault setup, or ask if unknown)
- `tags`: array of selected tags
- `content`: the user's insight text, expanded if needed into a clear paragraph

## Step 6: Report the Result

When `vault-create-note` succeeds, print:

```
Note created: <returned note path>
Title: <title>
Branch: <branch> | Project: <project> | Tags: <tags>

This note is marked exploratory. Run /promote-to-vault after your branch merges to review it.
```

If `vault-create-note` returns an error, show the error and suggest the user check that vault-init was run and the MCP server is connected.
