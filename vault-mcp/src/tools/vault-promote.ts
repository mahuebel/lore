import { parseFrontmatter, validateFrontmatter, serializeNote } from '../vault/frontmatter.js';
import { readNoteFile, updateNoteFile } from '../vault/files.js';

export interface PromoteNoteParams {
  path: string;
  content?: string;
}

export function promoteNote(vaultPath: string, params: PromoteNoteParams): void {
  const { path, content } = params;

  const raw = readNoteFile(vaultPath, path);
  const { frontmatter, content: existingContent } = parseFrontmatter(raw);

  if (frontmatter.status !== 'exploratory') {
    throw new Error(
      `Note is already '${frontmatter.status}'. Only exploratory notes can be promoted.`
    );
  }

  frontmatter.status = 'established';
  frontmatter.established = new Date().toISOString().split('T')[0];
  delete frontmatter.branch;

  validateFrontmatter(frontmatter);

  const finalContent = content !== undefined ? content : existingContent;
  const serialized = serializeNote(frontmatter, finalContent);
  updateNoteFile(vaultPath, path, serialized);
}
