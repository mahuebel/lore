import matter from 'gray-matter';

export interface NoteFrontmatter {
  title: string;
  status: 'exploratory' | 'established';
  branch?: string;
  author: string;
  created: string;
  established?: string;
  tags: string[];
  project: string;
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter;
  content: string;
}

export function parseFrontmatter(markdown: string): ParsedNote {
  const { data, content } = matter(markdown);
  if (!data || Object.keys(data).length === 0) {
    throw new Error('Note has no frontmatter.');
  }
  return {
    frontmatter: data as NoteFrontmatter,
    content: content.trim(),
  };
}

export function validateFrontmatter(fm: NoteFrontmatter): void {
  if (!fm.title || fm.title.trim() === '') {
    throw new Error('Missing required field: title');
  }
  if (!['exploratory', 'established'].includes(fm.status)) {
    throw new Error(
      `Invalid status: "${fm.status}". Must be "exploratory" or "established".`
    );
  }
  if (fm.status === 'exploratory' && !fm.branch) {
    throw new Error(
      'Missing required field: branch (required when status is exploratory)'
    );
  }
  if (fm.status === 'established' && fm.branch) {
    throw new Error(
      'Field "branch" must not be present when status is established'
    );
  }
  if (fm.status === 'established' && !fm.established) {
    throw new Error(
      'Missing required field: established (required when status is established)'
    );
  }
  if (!fm.author || fm.author.trim() === '') {
    throw new Error('Missing required field: author');
  }
  if (!fm.created) {
    throw new Error('Missing required field: created');
  }
  if (!Array.isArray(fm.tags)) {
    throw new Error('Field "tags" must be an array');
  }
  if (!fm.project || fm.project.trim() === '') {
    throw new Error('Missing required field: project');
  }
}

function yamlValue(v: unknown): string {
  if (Array.isArray(v)) {
    return '[' + v.map((i) => (typeof i === 'string' ? i : String(i))).join(', ') + ']';
  }
  if (typeof v === 'string' && (v.includes(' ') || v.includes(':'))) {
    return JSON.stringify(v);
  }
  return String(v);
}

export function serializeNote(fm: NoteFrontmatter, content: string): string {
  const lines = Object.entries(fm)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `---\n${lines.join('\n')}\n---\n${content}\n`;
}
