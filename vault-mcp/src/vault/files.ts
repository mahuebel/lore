import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export function titleToFilename(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim() + '.md';
}

export function getPlacementDir(tags: string[]): string {
  for (const tag of tags) {
    if (tag === 'architecture') return 'knowledge/architecture';
    if (tag === 'convention' || tag === 'pattern') return 'knowledge/conventions';
    if (tag === 'research') return 'knowledge/research';
    if (tag === 'debugging' || tag === 'bug') return 'knowledge/debugging';
  }
  return 'inbox';
}

export function noteExists(vaultPath: string, relativePath: string): boolean {
  return existsSync(join(vaultPath, relativePath));
}

export function createNoteFile(
  vaultPath: string,
  dir: string,
  filename: string,
  content: string
): string {
  const relativePath = join(dir, filename);
  const fullPath = join(vaultPath, relativePath);
  if (existsSync(fullPath)) {
    throw new Error(`Note already exists at ${relativePath}`);
  }
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  return relativePath;
}

export function readNoteFile(vaultPath: string, relativePath: string): string {
  const fullPath = join(vaultPath, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Note not found: ${relativePath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

export function updateNoteFile(
  vaultPath: string,
  relativePath: string,
  content: string
): void {
  const fullPath = join(vaultPath, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Note not found: ${relativePath}`);
  }
  writeFileSync(fullPath, content);
}

export function deleteNoteFile(vaultPath: string, relativePath: string): void {
  const fullPath = join(vaultPath, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Note not found: ${relativePath}`);
  }
  unlinkSync(fullPath);
}
