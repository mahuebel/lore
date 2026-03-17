import { validateFrontmatter, serializeNote, type NoteFrontmatter } from '../vault/frontmatter.js';
import { titleToFilename, getPlacementDir, createNoteFile } from '../vault/files.js';

export interface CreateNoteParams {
  title: string;
  content: string;
  tags: string[];
  project: string;
  branch?: string;
}

export function createNote(
  vaultPath: string,
  author: string,
  params: CreateNoteParams
): { path: string; title: string; frontmatter: NoteFrontmatter } {
  const { title, content, tags, project, branch } = params;

  const frontmatter: NoteFrontmatter = {
    title,
    status: 'exploratory',
    branch,
    author,
    created: new Date().toISOString().split('T')[0],
    tags,
    project,
  };

  validateFrontmatter(frontmatter);

  const filename = titleToFilename(title);
  const dir = getPlacementDir(tags);
  const serialized = serializeNote(frontmatter, content);
  const path = createNoteFile(vaultPath, dir, filename, serialized);

  return { path, title, frontmatter };
}
