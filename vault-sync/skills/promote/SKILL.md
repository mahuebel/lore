---
name: promote
description: Review and promote exploratory notes to established status after branch merge
command: promote-to-vault
---

# /promote-to-vault — Review and Promote Exploratory Notes

You are guiding the developer through reviewing exploratory notes captured during a feature branch and deciding which to promote to `established` status, edit before promoting, or discard.

## Step 1: Determine the Target Branch

**If the current git branch is `main` or `master`:**

Run:
```bash
git log --merges --oneline -10
```

Show the output to the user and ask: "Which recently merged branch would you like to promote notes from? Enter the branch name."

Accept the branch name as input.

**If the current git branch is a feature branch:**

Use that branch name automatically. Inform the user: "Reviewing exploratory notes from branch: `<branch>`."

## Step 2: Query Exploratory Notes for the Branch

Call `vault-query` with:
- `status`: `"exploratory"`
- `branch`: `<branch-name>`

**If no notes are returned:**

Print:
```
No exploratory notes found for branch <branch>.

If notes exist in the vault under a different branch name, run /vault-cleanup to find them.
```

Stop here.

**If notes are returned but all are already `established`:**

Print:
```
All notes from branch <branch> have already been promoted. Nothing to do.
```

Stop here.

## Step 3: Dispatch the Promoter Agent

Dispatch the **promoter** agent, passing:
- The branch name
- The full list of exploratory note objects returned by vault-query

Wait for the agent to return structured recommendations before continuing.

## Step 4: Present Recommendations to the User

For each note, display the agent's recommendation in this format:

```
Note: <title>
Recommendation: <Promote as-is | Edit then promote | Discard>
Reason: <agent's reasoning>

What would you like to do?
  [P] Promote as-is
  [E] Edit & promote
  [D] Discard
  [S] Skip (decide later)
```

Accept a single letter response for each note. Process notes one at a time.

**If the user chooses [E] Edit & promote:**
- Show the current note content
- Ask: "What changes should be made?"
- Apply the edits via `vault-update-note`
- Then proceed to promote

## Step 5: Execute Decisions

For each note where the user chose Promote or Edit & promote:

Call `vault-promote` with:
- `note_id`: the note's identifier
- `promoted_by`: the current GitHub username (from vault config)
- `promoted_at`: today's date in ISO format (YYYY-MM-DD)

For each note where the user chose Discard:

Call `vault-discard` with:
- `note_id`: the note's identifier
- `reason`: `"reviewed after merge — not worth keeping"`

## Step 6: Print Summary

After all decisions are processed, print:

```
Promotion complete for branch <branch>:
  Promoted:  N notes
  Discarded: N notes
  Skipped:   N notes

Promoted notes are now available to the whole team in the vault.
Skipped notes remain exploratory — run /promote-to-vault again to revisit them.
```
