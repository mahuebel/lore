// src/git/sync.ts
import { simpleGit, type StatusResult } from 'simple-git';

export async function gitPull(
  vaultPath: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const git = simpleGit(vaultPath);

  try {
    await git.pull(['--rebase']);
    return { success: true, message: 'Pulled latest changes.' };
  } catch (pullError) {
    // Rebase conflict — attempt recovery
    // First, abort the failed rebase to get back to a clean state
    try {
      await git.rebase(['--abort']);
    } catch {
      // abort may fail if no rebase in progress, ignore
    }

    // Check if there are uncommitted changes we need to stash
    let hadStash = false;
    try {
      const status = await git.status();
      if (!status.isClean()) {
        await git.stash();
        hadStash = true;
      }
    } catch {
      // If status fails, try stashing anyway
      try {
        await git.stash();
        hadStash = true;
      } catch { /* nothing to stash */ }
    }

    // Try pulling again
    try {
      await git.pull(['--rebase']);
    } catch (secondPullError) {
      // Second pull also failed — this is a true committed conflict
      // Abort the rebase again
      try { await git.rebase(['--abort']); } catch { /* ignore */ }
      // Drop stash if we made one
      if (hadStash) {
        try { await git.stash(['drop']); } catch { /* ignore */ }
      }

      // Get conflicted file info
      let conflictFiles = '';
      try {
        const status = await git.status();
        conflictFiles = status.conflicted.join(', ');
      } catch { /* ignore */ }

      return {
        success: false,
        error: `Vault conflict on ${conflictFiles || 'unknown files'}. Resolve manually.`,
      };
    }

    // Pull succeeded. If we stashed, pop it back
    if (hadStash) {
      try {
        await git.stash(['pop']);
        return { success: true, message: 'Pulled latest changes.' };
      } catch {
        // Stash pop failed — conflict between stashed changes and pulled changes
        let conflictFiles = '';
        try {
          const status = await git.status();
          conflictFiles = status.conflicted.join(', ');
          // Clean up the failed merge state
          await git.checkout(['.']);
          await git.stash(['drop']);
        } catch {
          try { await git.stash(['drop']); } catch { /* ignore */ }
        }
        return {
          success: false,
          error: `Vault conflict on ${conflictFiles || 'unknown files'}. Resolve manually.`,
        };
      }
    }

    return { success: true, message: 'Pulled latest changes.' };
  }
}

export async function gitPush(
  vaultPath: string,
  author: string,
  commitMessage?: string
): Promise<{ success: boolean; message?: string; warning?: string }> {
  const git = simpleGit(vaultPath);
  const status = await git.status();

  if (status.isClean()) {
    return { success: true, message: 'Nothing to commit' };
  }

  await git.raw(['add', '-A']);
  await git.commit(commitMessage ?? `vault: auto-sync from ${author}`);

  try {
    await git.push();
  } catch {
    return {
      success: true,
      warning: 'Changes committed locally but push failed. Run vault-push to retry.',
    };
  }

  return { success: true, message: 'Changes pushed.' };
}

export async function gitStatus(
  vaultPath: string
): Promise<{
  uncommitted_changes: string[];
  ahead: number;
  behind: number;
  branch: string;
}> {
  const git = simpleGit(vaultPath);
  const status = await git.status();

  const uncommitted_changes = [
    ...status.not_added,
    ...status.created,
    ...status.deleted,
    ...status.modified,
    ...status.renamed.map((r: { from: string; to: string }) => r.to),
  ];

  return {
    uncommitted_changes,
    ahead: status.ahead,
    behind: status.behind,
    branch: status.current ?? 'unknown',
  };
}
