import { parseFrontmatter } from '../vault/frontmatter.js';
import { readNoteFile, deleteNoteFile } from '../vault/files.js';

export interface DiscardNoteParams {
  path: string;
  reason?: string;
}

export function discardNote(
  vaultPath: string,
  author: string,
  params: DiscardNoteParams
): { commitMessage: string } {
  const { path, reason } = params;

  const raw = readNoteFile(vaultPath, path);
  const { frontmatter } = parseFrontmatter(raw);

  if (frontmatter.status !== 'exploratory') {
    throw new Error(
      'Only exploratory notes can be discarded. Established notes represent validated team knowledge and cannot be removed.'
    );
  }

  const title = frontmatter.title;
  deleteNoteFile(vaultPath, path);

  const resolvedReason = reason ?? 'no reason given';
  const commitMessage = `vault: discarded '${title}' — ${resolvedReason} (by ${author})`;

  return { commitMessage };
}
