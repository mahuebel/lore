import { parseFrontmatter, validateFrontmatter, serializeNote, type NoteFrontmatter } from '../vault/frontmatter.js';
import { readNoteFile, updateNoteFile } from '../vault/files.js';

export interface UpdateNoteParams {
  path: string;
  content?: string;
  frontmatter?: Partial<NoteFrontmatter>;
}

export function updateNote(vaultPath: string, params: UpdateNoteParams): void {
  const { path, content: newContent, frontmatter: fmUpdates } = params;

  const raw = readNoteFile(vaultPath, path);
  const parsed = parseFrontmatter(raw);

  if (fmUpdates && 'status' in fmUpdates) {
    throw new Error('Cannot change status directly. Use vault-promote or vault-discard.');
  }

  const mergedFrontmatter: NoteFrontmatter = {
    ...parsed.frontmatter,
    ...fmUpdates,
  };

  const finalContent = newContent !== undefined ? newContent : parsed.content;

  validateFrontmatter(mergedFrontmatter);

  const serialized = serializeNote(mergedFrontmatter, finalContent);
  updateNoteFile(vaultPath, path, serialized);
}
