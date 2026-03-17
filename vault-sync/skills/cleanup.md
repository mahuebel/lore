# /vault-cleanup — Remove Notes from Abandoned Branches

You are helping the developer prune exploratory notes that belong to branches that have been deleted or abandoned. Follow these steps carefully.

## Step 1: Query All Exploratory Notes

Call `vault-query` with:
- `status`: `"exploratory"`

If the query returns zero notes, print:
```
No exploratory notes found. The vault is clean.
```
Stop here.

## Step 2: Determine the Current Project

Run:
```bash
git remote get-url origin
```

Derive the project name from the remote URL (the repository name portion). If this fails, ask the user: "Which project are you cleaning up? Enter the project name as it appears in vault notes."

Filter the notes from Step 1 to only those where `project` matches the current project name.

If no notes match the current project, print:
```
No exploratory notes found for project <project>. Nothing to clean up.
```
Stop here.

## Step 3: Check Branch Status for Each Unique Branch

Collect the unique set of branch names from the filtered notes. For each branch, run both checks:

```bash
git branch --list <branch>
```

```bash
git ls-remote --heads origin <branch>
```

Also check the age of the branch's most recent note (using the `created` frontmatter date).

Classify each branch into one of three groups:

- **Orphaned** — branch does not exist locally or on the remote
- **Stale** — branch still exists, but all its notes are 30+ days old with no recent activity
- **Active** — branch exists and notes are recent (less than 30 days old)

## Step 4: Display Grouped Results

Print a summary grouped by status:

```
Orphaned branches (branch deleted — notes are likely obsolete):
  • <branch-name>: N notes  [created: <date>]
  ...

Stale branches (branch exists but notes are 30+ days old):
  • <branch-name>: N notes  [last activity: <date>]
  ...

Active branches (skip — notes are recent):
  • <branch-name>: N notes  [last activity: <date>]
  ...
```

## Step 5: Bulk Discard Prompt for Orphaned Notes

If there are orphaned branches, ask:

> "Found N notes from deleted branches. Discard all of them? (y/n/review)"

- **y** — discard all orphaned notes immediately (go to Step 6 with bulk discard)
- **n** — skip orphaned notes, continue to stale review
- **review** — show each note title and ask individually: Discard (d) or Skip (s)?

## Step 6: Stale Branch Review

For each stale branch, display its notes and ask:

```
Branch: <branch-name> (last activity: <date>)
Notes:
  1. <title>
  2. <title>
  ...

Options:
  [D] Discard all notes for this branch
  [P] Promote all (redirects to /promote-to-vault for this branch)
  [S] Skip this branch
```

## Step 7: Execute Discards

For each note marked for discard, call `vault-discard` with:
- `note_id`: the note's identifier
- `reason`: `"branch abandoned"` (for orphaned) or `"branch deleted"` (for branches that no longer exist remotely)

## Step 8: Print Summary

```
Cleanup complete:
  Discarded: N notes across N branches
  Skipped:   N notes across N branches

Run /promote-to-vault to promote any remaining stale notes you want to keep.
```
