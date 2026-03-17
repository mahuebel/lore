import { parseFrontmatter } from '../vault/frontmatter.js';
import { readNoteFile, deleteNoteFile } from '../vault/files.js';

export interface DeleteNoteParams {
  path: string;
}

export function deleteNote(vaultPath: string, params: DeleteNoteParams): string {
  const { path } = params;

  const raw = readNoteFile(vaultPath, path);
  const parsed = parseFrontmatter(raw);

  if (parsed.frontmatter.status === 'established') {
    throw new Error('Cannot delete established notes. They represent validated team knowledge.');
  }

  deleteNoteFile(vaultPath, path);
  return `Deleted: ${path}`;
}
