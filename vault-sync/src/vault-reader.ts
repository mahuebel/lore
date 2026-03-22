import { readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';

export interface VaultNote {
  path: string;
  title: string;
  status: string;
  tags: string[];
  project: string;
  branch: string;
  created: string;
  excerpt: string;
  body: string;
}

const SKIP_PATTERNS = ['.obsidian', '.git', 'README.md', '.vault-mcp.json', '.gitkeep', 'sessions'];

function shouldSkip(name: string): boolean {
  return SKIP_PATTERNS.includes(name);
}

export function parseFrontmatter(content: string): {
  title: string;
  status: string;
  tags: string[];
  project: string;
  branch: string;
  created: string;
  body: string;
} {
  const result = { title: '', status: '', tags: [] as string[], project: '', branch: '', created: '', body: content };

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) return result;

  const fm = fmMatch[1];
  result.body = fmMatch[2];

  const titleMatch = fm.match(/^title:\s*(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');

  const statusMatch = fm.match(/^status:\s*(.+)$/m);
  if (statusMatch) result.status = statusMatch[1].trim();

  const projectMatch = fm.match(/^project:\s*(.+)$/m);
  if (projectMatch) result.project = projectMatch[1].trim();

  const branchMatch = fm.match(/^branch:\s*(.+)$/m);
  if (branchMatch) result.branch = branchMatch[1].trim();

  const createdMatch = fm.match(/^created:\s*(.+)$/m);
  if (createdMatch) result.created = createdMatch[1].trim();

  const tagsInline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (tagsInline) {
    result.tags = tagsInline[1].split(',').map(t => t.trim()).filter(Boolean);
  } else {
    const tagsBlock = fm.match(/^tags:\s*\n((?:\s+-\s+.+\n?)*)/m);
    if (tagsBlock) {
      result.tags = tagsBlock[1].match(/-\s+(.+)/g)?.map(m => m.replace(/^-\s+/, '').trim()) || [];
    }
  }

  return result;
}

function collectMdFiles(dir: string, relBase: string = '', depth: number = 0): Array<{ fullPath: string; relPath: string }> {
  if (depth > 5) return [];
  const results: Array<{ fullPath: string; relPath: string }> = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (shouldSkip(entry.name)) continue;
      const fullPath = join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        results.push(...collectMdFiles(fullPath, relPath, depth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push({ fullPath, relPath });
      }
    }
  } catch {
    // permission error or missing, skip
  }

  return results;
}

export function listVaultNotes(vaultPath: string, filters?: {
  status?: string;
  tag?: string;
  project?: string;
  branch?: string;
  q?: string;
}): Omit<VaultNote, 'body'>[] {
  const files = collectMdFiles(vaultPath);
  const notes: Omit<VaultNote, 'body'>[] = [];

  for (const { fullPath, relPath } of files) {
    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseFrontmatter(content);
    const title = parsed.title || basename(relPath, '.md');

    if (filters?.status && parsed.status !== filters.status) continue;
    if (filters?.tag && !parsed.tags.includes(filters.tag)) continue;
    if (filters?.project && parsed.project !== filters.project) continue;
    if (filters?.branch && parsed.branch !== filters.branch) continue;
    if (filters?.q) {
      const q = filters.q.toLowerCase();
      const searchable = `${title} ${parsed.body}`.toLowerCase();
      if (!searchable.includes(q)) continue;
    }

    notes.push({
      path: relPath,
      title,
      status: parsed.status,
      tags: parsed.tags,
      project: parsed.project,
      branch: parsed.branch,
      created: parsed.created,
      excerpt: parsed.body.trim().slice(0, 200),
    });
  }

  return notes;
}

export function readVaultNote(vaultPath: string, notePath: string): VaultNote | null {
  try {
    const fullPath = join(vaultPath, notePath);
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parseFrontmatter(content);

    return {
      path: notePath,
      title: parsed.title || basename(notePath, '.md'),
      status: parsed.status,
      tags: parsed.tags,
      project: parsed.project,
      branch: parsed.branch,
      created: parsed.created,
      excerpt: parsed.body.trim().slice(0, 200),
      body: parsed.body,
    };
  } catch {
    return null;
  }
}

export function resolveVaultPath(): string | null {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;

  const homeDir = process.env.HOME || '/tmp';
  const candidates = [
    join(homeDir, '.lore', 'vault'),
    join(homeDir, 'vault'),
    join(homeDir, 'obsidian', 'team-vault'),
  ];

  for (const candidate of candidates) {
    try {
      const configPath = join(candidate, '.vault-mcp.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.vault_path) return config.vault_path;
    } catch {
      // try next
    }
  }

  const fallback = join(homeDir, '.lore', 'vault');
  try {
    statSync(fallback);
    return fallback;
  } catch {
    return null;
  }
}
