# Shared Knowledge Vault Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server, Claude Code plugin, and GitHub template repo for shared, git-synced Obsidian knowledge vaults with lifecycle management.

**Architecture:** Three deliverables in a monorepo (`lore/`). The MCP server (`vault-mcp`) handles all vault operations over stdio — portable across Claude Code, Cursor, and other MCP clients. The Claude Code plugin (`vault-sync`) adds orchestration via prompt-based hooks, skills, and a promoter agent. The template repo (`vault-template`) is what teams fork to create their vault.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `gray-matter`, `simple-git`, `vitest` for testing.

**Spec:** `docs/superpowers/specs/2026-03-16-shared-knowledge-vault-design.md`

---

## File Map

### `vault-template/` — GitHub Template Repo

```
vault-template/
├── .gitignore
├── .obsidian/app.json
├── README.md
├── 00-home/
│   ├── index.md
│   ├── daily/.gitkeep
│   └── top-of-mind.md
├── atlas/
│   ├── projects.md
│   └── research.md
├── inbox/.gitkeep
├── knowledge/
│   ├── architecture/.gitkeep
│   ├── conventions/.gitkeep
│   ├── research/.gitkeep
│   └── debugging/.gitkeep
└── sessions/.gitkeep
```

### `vault-mcp/` — TypeScript MCP Server

```
vault-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # MCP server entry point (stdio transport)
│   ├── vault/
│   │   ├── config.ts               # Load/save .vault-mcp.json, env var fallback
│   │   ├── frontmatter.ts          # Parse, validate, serialize frontmatter
│   │   ├── files.ts                # File placement, naming, read/write/delete
│   │   ├── query.ts                # Frontmatter query engine
│   │   └── search.ts              # Full-text grep search
│   ├── git/
│   │   └── sync.ts                 # Pull (with conflict resolution), push, status
│   └── tools/
│       ├── vault-init.ts
│       ├── vault-create-note.ts
│       ├── vault-read-note.ts
│       ├── vault-update-note.ts
│       ├── vault-delete-note.ts
│       ├── vault-promote.ts
│       ├── vault-discard.ts
│       ├── vault-query.ts
│       ├── vault-search.ts
│       ├── vault-pull.ts
│       ├── vault-push.ts
│       └── vault-status.ts
└── tests/
    ├── vault/
    │   ├── config.test.ts
    │   ├── frontmatter.test.ts
    │   ├── files.test.ts
    │   ├── query.test.ts
    │   └── search.test.ts
    ├── git/
    │   └── sync.test.ts
    └── integration/
        ├── crud.test.ts            # Create/read/update/delete lifecycle
        ├── lifecycle.test.ts       # Promote/discard flows
        ├── query-search.test.ts    # Query + search
        └── git-sync.test.ts        # Pull/push/status with real repos
```

### `vault-sync/` — Claude Code Plugin

```
vault-sync/
├── plugin.json
├── skills/
│   ├── setup.md
│   ├── promote.md
│   ├── cleanup.md
│   └── vault-note.md
├── agents/
│   └── promoter.md
└── templates/
    └── note-template.md
```

---

## Task 1: Create Vault Template

**Files:**
- Create: `vault-template/.gitignore`
- Create: `vault-template/.obsidian/app.json`
- Create: `vault-template/README.md`
- Create: `vault-template/00-home/index.md`
- Create: `vault-template/00-home/top-of-mind.md`
- Create: `vault-template/00-home/daily/.gitkeep`
- Create: `vault-template/atlas/projects.md`
- Create: `vault-template/atlas/research.md`
- Create: `vault-template/inbox/.gitkeep`
- Create: `vault-template/knowledge/architecture/.gitkeep`
- Create: `vault-template/knowledge/conventions/.gitkeep`
- Create: `vault-template/knowledge/research/.gitkeep`
- Create: `vault-template/knowledge/debugging/.gitkeep`
- Create: `vault-template/sessions/.gitkeep`

- [ ] **Step 1: Create .gitignore**

```gitignore
# Obsidian workspace (per-user, don't share)
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/appearance.json

# OS
.DS_Store
Thumbs.db

# Smart Connections cache
.smart-connections/

# Vault MCP config (per-developer)
.vault-mcp.json
```

- [ ] **Step 2: Create .obsidian/app.json**

Minimal Obsidian config — just enables wikilinks:

```json
{
  "useMarkdownLinks": false
}
```

- [ ] **Step 3: Create README.md**

Write the vault README covering:
- What this vault is (shared team knowledge, git-synced)
- Folder structure explanation (00-home, atlas, inbox, knowledge, sessions)
- Frontmatter schema (title, status, branch, author, created, established, tags, project)
- Note naming convention (claim-style titles, not categories)
- Wikilink convention (links read as prose)
- Lifecycle: exploratory -> established or discarded
- How to use with Claude Code (`/vault-note`, `/promote-to-vault`, `/vault-cleanup`)
- How to use with Cursor (MCP tools directly)

- [ ] **Step 4: Create seed content files**

`00-home/index.md`:
```markdown
---
title: "Vault Home"
---

# Team Knowledge Vault

Welcome to the shared knowledge vault. This is where validated team knowledge lives.

## Navigation

- [[top-of-mind]] — Current priorities and focus areas
- [[projects]] — Active projects overview
- [[research]] — Research areas overview

## Folders

- `inbox/` — Unprocessed captures, new notes land here
- `knowledge/` — Curated knowledge by category
- `sessions/` — Raw session transcripts (optional)
```

`00-home/top-of-mind.md`:
```markdown
---
title: "Current priorities and focus areas"
---

# Top of Mind

Add your team's current priorities here.
```

`atlas/projects.md`:
```markdown
---
title: "Active projects overview"
---

# Projects

List your active projects here. Notes use the `project` frontmatter field to link to projects.
```

`atlas/research.md`:
```markdown
---
title: "Research areas overview"
---

# Research

Track ongoing research areas here.
```

- [ ] **Step 5: Create .gitkeep files for empty directories**

Create empty `.gitkeep` files in:
- `00-home/daily/.gitkeep`
- `inbox/.gitkeep`
- `knowledge/architecture/.gitkeep`
- `knowledge/conventions/.gitkeep`
- `knowledge/research/.gitkeep`
- `knowledge/debugging/.gitkeep`
- `sessions/.gitkeep`

- [ ] **Step 6: Validate template structure**

Run a quick validation to confirm:
- All seed notes (index.md, top-of-mind.md, projects.md, research.md) have valid YAML frontmatter with at least a `title` field
- All expected directories exist (00-home, atlas, inbox, knowledge/architecture, knowledge/conventions, knowledge/research, knowledge/debugging, sessions)
- `.gitignore` contains entries for `.obsidian/workspace.json`, `.DS_Store`, `.vault-mcp.json`
- `.obsidian/app.json` is valid JSON

This can be a manual check or a simple bash script — no need for a permanent test file since this is a static template.

- [ ] **Step 7: Commit**

```bash
git add vault-template/
git commit -m "feat: create vault-template with folder structure and seed content"
```

---

## Task 2: Scaffold vault-mcp

**Files:**
- Create: `vault-mcp/package.json`
- Create: `vault-mcp/tsconfig.json`
- Create: `vault-mcp/vitest.config.ts`
- Create: `vault-mcp/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "vault-mcp",
  "version": "1.0.0",
  "description": "MCP server for shared Obsidian knowledge vaults with git sync and lifecycle management",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "gray-matter": "^4.0.3",
    "simple-git": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create src/index.ts stub**

This is the MCP server entry point. Start with a minimal server that connects over stdio and has no tools registered yet. Tools will be added in subsequent tasks.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'vault-mcp',
  version: '1.0.0',
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

export { server };
```

- [ ] **Step 5: Install dependencies**

```bash
cd vault-mcp && npm install
```

- [ ] **Step 6: Verify build**

```bash
cd vault-mcp && npm run build
```

Expected: Compiles to `dist/index.js` with no errors.

- [ ] **Step 7: Commit**

```bash
git add vault-mcp/
git commit -m "feat: scaffold vault-mcp with MCP SDK, TypeScript, vitest"
```

---

## Task 3: Config Module

**Files:**
- Create: `vault-mcp/src/vault/config.ts`
- Create: `vault-mcp/tests/vault/config.test.ts`

- [ ] **Step 1: Write failing tests for config**

```typescript
// tests/vault/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, getConfig, type VaultConfig } from '../../src/vault/config.js';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-config-'));
    mkdirSync(join(tempDir, 'knowledge'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('saveConfig', () => {
    it('writes .vault-mcp.json to vault path', () => {
      const config: VaultConfig = {
        vault_path: tempDir,
        author: 'testuser',
        projects: {},
      };
      saveConfig(tempDir, config);
      expect(existsSync(join(tempDir, '.vault-mcp.json'))).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('loads config from .vault-mcp.json', () => {
      const config: VaultConfig = {
        vault_path: tempDir,
        author: 'testuser',
        projects: { myproject: '/path/to/project' },
      };
      saveConfig(tempDir, config);
      const loaded = loadConfig(tempDir);
      expect(loaded.author).toBe('testuser');
      expect(loaded.projects.myproject).toBe('/path/to/project');
    });

    it('throws when config file does not exist', () => {
      expect(() => loadConfig(tempDir)).toThrow('Vault not configured');
    });
  });

  describe('getConfig', () => {
    it('loads from env vars when set', () => {
      process.env.VAULT_PATH = tempDir;
      process.env.VAULT_AUTHOR = 'envuser';
      saveConfig(tempDir, { vault_path: tempDir, author: 'envuser', projects: {} });
      const config = getConfig();
      expect(config.vault_path).toBe(tempDir);
      expect(config.author).toBe('envuser');
      delete process.env.VAULT_PATH;
      delete process.env.VAULT_AUTHOR;
    });

    it('throws when no env vars and no config', () => {
      delete process.env.VAULT_PATH;
      delete process.env.VAULT_AUTHOR;
      expect(() => getConfig()).toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/vault/config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement config module**

```typescript
// src/vault/config.ts
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface VaultConfig {
  vault_path: string;
  author: string;
  projects: Record<string, string>;
}

const CONFIG_FILENAME = '.vault-mcp.json';

export function saveConfig(vaultPath: string, config: VaultConfig): void {
  const configPath = join(vaultPath, CONFIG_FILENAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function loadConfig(vaultPath: string): VaultConfig {
  const configPath = join(vaultPath, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    throw new Error(
      'Vault not configured. Run vault-init with your vault path and username.'
    );
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'));
}

export function getConfig(): VaultConfig {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) {
    throw new Error(
      'VAULT_PATH environment variable not set. Configure vault-mcp with VAULT_PATH and VAULT_AUTHOR.'
    );
  }
  return loadConfig(vaultPath);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/vault/config.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vault-mcp/src/vault/config.ts vault-mcp/tests/vault/config.test.ts
git commit -m "feat: add config module for .vault-mcp.json loading/saving"
```

---

## Task 4: Frontmatter Module

**Files:**
- Create: `vault-mcp/src/vault/frontmatter.ts`
- Create: `vault-mcp/tests/vault/frontmatter.test.ts`

- [ ] **Step 1: Write failing tests for frontmatter**

```typescript
// tests/vault/frontmatter.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  validateFrontmatter,
  serializeNote,
  type NoteFrontmatter,
} from '../../src/vault/frontmatter.js';

describe('frontmatter', () => {
  describe('parseFrontmatter', () => {
    it('parses valid frontmatter from markdown', () => {
      const md = `---
title: "Test note"
status: exploratory
branch: feature/test
author: testuser
created: 2026-03-16
tags: [architecture]
project: myproject
---

Some content here.`;
      const result = parseFrontmatter(md);
      expect(result.frontmatter.title).toBe('Test note');
      expect(result.frontmatter.status).toBe('exploratory');
      expect(result.frontmatter.tags).toEqual(['architecture']);
      expect(result.content).toBe('Some content here.');
    });

    it('throws on missing frontmatter', () => {
      expect(() => parseFrontmatter('No frontmatter here')).toThrow();
    });
  });

  describe('validateFrontmatter', () => {
    const validExploratory: NoteFrontmatter = {
      title: 'Test claim title',
      status: 'exploratory',
      branch: 'feature/test',
      author: 'testuser',
      created: '2026-03-16',
      tags: ['architecture'],
      project: 'myproject',
    };

    it('accepts valid exploratory frontmatter', () => {
      expect(() => validateFrontmatter(validExploratory)).not.toThrow();
    });

    it('rejects missing title', () => {
      expect(() => validateFrontmatter({ ...validExploratory, title: '' })).toThrow('title');
    });

    it('rejects invalid status', () => {
      expect(() =>
        validateFrontmatter({ ...validExploratory, status: 'draft' as any })
      ).toThrow('status');
    });

    it('requires branch when status is exploratory', () => {
      const { branch, ...noBranch } = validExploratory;
      expect(() => validateFrontmatter(noBranch as any)).toThrow('branch');
    });

    it('rejects branch when status is established', () => {
      const established: NoteFrontmatter = {
        ...validExploratory,
        status: 'established',
        established: '2026-03-18',
        branch: 'feature/test',
      };
      expect(() => validateFrontmatter(established)).toThrow('branch');
    });

    it('requires established date when status is established', () => {
      const { branch, ...rest } = validExploratory;
      const established = { ...rest, status: 'established' as const };
      expect(() => validateFrontmatter(established as any)).toThrow('established');
    });

    it('rejects non-array tags', () => {
      expect(() =>
        validateFrontmatter({ ...validExploratory, tags: 'not-array' as any })
      ).toThrow('tags');
    });

    it('rejects missing project', () => {
      expect(() =>
        validateFrontmatter({ ...validExploratory, project: '' })
      ).toThrow('project');
    });
  });

  describe('serializeNote', () => {
    it('serializes frontmatter + content to markdown', () => {
      const fm: NoteFrontmatter = {
        title: 'Test note',
        status: 'exploratory',
        branch: 'feature/test',
        author: 'testuser',
        created: '2026-03-16',
        tags: ['architecture'],
        project: 'myproject',
      };
      const result = serializeNote(fm, 'Content here.');
      expect(result).toContain('---');
      expect(result).toContain('title: "Test note"');
      expect(result).toContain('Content here.');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/vault/frontmatter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement frontmatter module**

```typescript
// src/vault/frontmatter.ts
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

export function serializeNote(fm: NoteFrontmatter, content: string): string {
  return matter.stringify(content, fm);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/vault/frontmatter.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vault-mcp/src/vault/frontmatter.ts vault-mcp/tests/vault/frontmatter.test.ts
git commit -m "feat: add frontmatter parsing, validation, and serialization"
```

---

## Task 5: File Operations Module

**Files:**
- Create: `vault-mcp/src/vault/files.ts`
- Create: `vault-mcp/tests/vault/files.test.ts`

- [ ] **Step 1: Write failing tests for file operations**

```typescript
// tests/vault/files.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  titleToFilename,
  getPlacementDir,
  createNoteFile,
  readNoteFile,
  updateNoteFile,
  deleteNoteFile,
  noteExists,
} from '../../src/vault/files.js';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('files', () => {
  let vaultPath: string;

  beforeEach(() => {
    vaultPath = mkdtempSync(join(tmpdir(), 'vault-files-'));
    mkdirSync(join(vaultPath, 'knowledge', 'architecture'), { recursive: true });
    mkdirSync(join(vaultPath, 'knowledge', 'conventions'), { recursive: true });
    mkdirSync(join(vaultPath, 'knowledge', 'research'), { recursive: true });
    mkdirSync(join(vaultPath, 'knowledge', 'debugging'), { recursive: true });
    mkdirSync(join(vaultPath, 'inbox'), { recursive: true });
  });

  afterEach(() => {
    rmSync(vaultPath, { recursive: true, force: true });
  });

  describe('titleToFilename', () => {
    it('converts to lowercase and strips special chars', () => {
      expect(titleToFilename('JWT refresh tokens prevent attacks'))
        .toBe('jwt refresh tokens prevent attacks.md');
    });

    it('strips apostrophes and plus signs', () => {
      expect(titleToFilename("C++ templates don't work with SFINAE"))
        .toBe('c templates dont work with sfinae.md');
    });

    it('preserves hyphens', () => {
      expect(titleToFilename('Use kebab-case for URLs'))
        .toBe('use kebab-case for urls.md');
    });
  });

  describe('getPlacementDir', () => {
    it('places architecture-tagged notes', () => {
      expect(getPlacementDir(['architecture', 'api'])).toBe('knowledge/architecture');
    });

    it('places convention-tagged notes', () => {
      expect(getPlacementDir(['convention'])).toBe('knowledge/conventions');
    });

    it('places pattern-tagged notes', () => {
      expect(getPlacementDir(['pattern'])).toBe('knowledge/conventions');
    });

    it('places research-tagged notes', () => {
      expect(getPlacementDir(['research'])).toBe('knowledge/research');
    });

    it('places debugging-tagged notes', () => {
      expect(getPlacementDir(['debugging'])).toBe('knowledge/debugging');
    });

    it('places bug-tagged notes', () => {
      expect(getPlacementDir(['bug'])).toBe('knowledge/debugging');
    });

    it('defaults to inbox for unrecognized tags', () => {
      expect(getPlacementDir(['random'])).toBe('inbox');
    });

    it('defaults to inbox for empty tags', () => {
      expect(getPlacementDir([])).toBe('inbox');
    });
  });

  describe('createNoteFile', () => {
    it('creates a note file at the correct path', () => {
      const path = createNoteFile(vaultPath, 'knowledge/architecture', 'test note.md', 'content');
      expect(path).toBe('knowledge/architecture/test note.md');
      expect(noteExists(vaultPath, path)).toBe(true);
    });

    it('throws when note already exists', () => {
      createNoteFile(vaultPath, 'inbox', 'existing.md', 'content');
      expect(() => createNoteFile(vaultPath, 'inbox', 'existing.md', 'content'))
        .toThrow('already exists');
    });
  });

  describe('readNoteFile', () => {
    it('reads note content', () => {
      createNoteFile(vaultPath, 'inbox', 'test.md', 'hello world');
      expect(readNoteFile(vaultPath, 'inbox/test.md')).toBe('hello world');
    });

    it('throws when note does not exist', () => {
      expect(() => readNoteFile(vaultPath, 'inbox/nonexistent.md')).toThrow();
    });
  });

  describe('updateNoteFile', () => {
    it('overwrites note content', () => {
      createNoteFile(vaultPath, 'inbox', 'test.md', 'old content');
      updateNoteFile(vaultPath, 'inbox/test.md', 'new content');
      expect(readNoteFile(vaultPath, 'inbox/test.md')).toBe('new content');
    });
  });

  describe('deleteNoteFile', () => {
    it('removes the file', () => {
      createNoteFile(vaultPath, 'inbox', 'test.md', 'content');
      deleteNoteFile(vaultPath, 'inbox/test.md');
      expect(noteExists(vaultPath, 'inbox/test.md')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/vault/files.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement files module**

```typescript
// src/vault/files.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/vault/files.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add vault-mcp/src/vault/files.ts vault-mcp/tests/vault/files.test.ts
git commit -m "feat: add file operations module (placement, naming, CRUD)"
```

---

## Task 6: vault-init Tool

**Files:**
- Create: `vault-mcp/src/tools/vault-init.ts`
- Create: `vault-mcp/tests/tools/vault-init.test.ts`
- Modify: `vault-mcp/src/index.ts` — register tool

- [ ] **Step 1: Write failing test for vault-init**

```typescript
// tests/tools/vault-init.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vaultInit } from '../../src/tools/vault-init.js';
import { loadConfig } from '../../src/vault/config.js';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

describe('vault-init', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-init-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates config for valid vault path', () => {
    execSync('git init', { cwd: tempDir });
    mkdirSync(join(tempDir, 'knowledge'));
    const result = vaultInit({ vault_path: tempDir, author: 'testuser' });
    expect(result).toContain('configured');
    const config = loadConfig(tempDir);
    expect(config.author).toBe('testuser');
  });

  it('throws when path does not exist', () => {
    expect(() => vaultInit({ vault_path: '/nonexistent/path', author: 'testuser' }))
      .toThrow('Path not found');
  });

  it('throws when path is not a git repo', () => {
    mkdirSync(join(tempDir, 'knowledge'));
    expect(() => vaultInit({ vault_path: tempDir, author: 'testuser' }))
      .toThrow('Not a git repo');
  });

  it('throws when vault structure is missing', () => {
    execSync('git init', { cwd: tempDir });
    expect(() => vaultInit({ vault_path: tempDir, author: 'testuser' }))
      .toThrow('knowledge');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd vault-mcp && npx vitest run tests/tools/vault-init.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement vault-init tool**

```typescript
// src/tools/vault-init.ts
import { existsSync } from 'fs';
import { join } from 'path';
import { saveConfig, type VaultConfig } from '../vault/config.js';

export interface VaultInitParams {
  vault_path: string;
  author: string;
}

export function vaultInit(params: VaultInitParams): string {
  const { vault_path, author } = params;

  if (!existsSync(vault_path)) {
    throw new Error(`Path not found: ${vault_path}. Clone your vault repo first.`);
  }

  if (!existsSync(join(vault_path, '.git'))) {
    throw new Error(`Not a git repo: ${vault_path}. Clone your vault repo to this path.`);
  }

  if (!existsSync(join(vault_path, 'knowledge'))) {
    throw new Error(
      `Missing expected vault structure at ${vault_path}. Expected a "knowledge/" directory. Is this a vault-template repo?`
    );
  }

  const config: VaultConfig = {
    vault_path,
    author,
    projects: {},
  };

  saveConfig(vault_path, config);

  return `Vault configured at ${vault_path} for user ${author}.`;
}
```

- [ ] **Step 2: Register vault-init in the MCP server**

Update `src/index.ts` to import and register the vault-init tool with the MCP server. Add the tool definition with `vault_path` (string, required) and `author` (string, required) parameters. The handler calls `vaultInit()` and returns the result as text content.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/tools/vault-init.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Build and verify no errors**

```bash
cd vault-mcp && npm run build
```

Expected: No compilation errors.

- [ ] **Step 7: Commit**

```bash
git add vault-mcp/src/tools/vault-init.ts vault-mcp/tests/tools/vault-init.test.ts vault-mcp/src/index.ts
git commit -m "feat: add vault-init tool for MCP server configuration"
```

---

## Task 7: Note CRUD Tools

**Files:**
- Create: `vault-mcp/src/tools/vault-create-note.ts`
- Create: `vault-mcp/src/tools/vault-read-note.ts`
- Create: `vault-mcp/src/tools/vault-update-note.ts`
- Create: `vault-mcp/src/tools/vault-delete-note.ts`
- Create: `vault-mcp/tests/integration/crud.test.ts`
- Modify: `vault-mcp/src/index.ts` — register tools

- [ ] **Step 1: Write failing integration test for CRUD**

Test the following scenarios in `tests/integration/crud.test.ts`:
- Creates a note with valid frontmatter and correct file placement (architecture tag -> knowledge/architecture/)
- Reads a note by path and returns correct frontmatter + content
- Reads a note by title substring (case-insensitive)
- Updates note content while preserving frontmatter
- Updates note frontmatter (e.g., adding a tag) while preserving content
- Rejects status change via update (must use promote/discard instead)
- Deletes an exploratory note successfully
- Rejects deleting an established note
- Rejects duplicate note creation (same title)

Each test uses a temp directory with `git init` and vault folder structure seeded in `beforeEach`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/integration/crud.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement vault-create-note**

The `createNote` function takes `vaultPath`, `author`, and params (`title`, `content`, `tags`, `project`, `branch`). It:
1. Builds frontmatter with `status: exploratory`, `author`, `created: today`, `branch`
2. Validates frontmatter via `validateFrontmatter()`
3. Generates filename via `titleToFilename(title)`
4. Determines directory via `getPlacementDir(tags)`
5. Serializes frontmatter + content via `serializeNote()`
6. Creates the file via `createNoteFile()`
7. Returns `{ path, title, frontmatter }`

- [ ] **Step 4: Implement vault-read-note**

The `readNote` function takes `vaultPath` and params (`path` or `title`). If `path` is given, reads directly via `readNoteFile()` and parses frontmatter. If `title` is given, recursively scans all `.md` files in the vault, parses each file's frontmatter, and returns the first note where the `title` frontmatter field contains the search string (case-insensitive). Returns `{ path, frontmatter, content }`.

- [ ] **Step 5: Implement vault-update-note**

The `updateNote` function takes `vaultPath` and params (`path`, optional `content`, optional `frontmatter`). It:
1. Reads the existing note via `readNoteFile()` and parses frontmatter
2. If `frontmatter` param includes `status`, throws: "Cannot change status directly. Use vault-promote or vault-discard."
3. Merges provided frontmatter fields with existing (shallow merge)
4. Validates the merged frontmatter
5. Serializes and writes via `updateNoteFile()`

- [ ] **Step 6: Implement vault-delete-note**

The `deleteNote` function takes `vaultPath` and params (`path`). It:
1. Reads the note to check status via `parseFrontmatter()`
2. If `status` is `established`, throws: "Cannot delete established notes. They represent validated team knowledge."
3. Deletes the file via `deleteNoteFile()`
4. Returns confirmation message: `"Deleted: <path>"`

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/integration/crud.test.ts
```

Expected: All tests PASS.

- [ ] **Step 8: Register all CRUD tools in src/index.ts**

Add tool definitions for `vault-create-note`, `vault-read-note`, `vault-update-note`, `vault-delete-note` to the MCP server with proper parameter schemas matching the spec.

- [ ] **Step 9: Build and verify**

```bash
cd vault-mcp && npm run build
```

Expected: No compilation errors.

- [ ] **Step 10: Commit**

```bash
git add vault-mcp/src/tools/vault-create-note.ts vault-mcp/src/tools/vault-read-note.ts \
  vault-mcp/src/tools/vault-update-note.ts vault-mcp/src/tools/vault-delete-note.ts \
  vault-mcp/tests/integration/crud.test.ts vault-mcp/src/index.ts
git commit -m "feat: add note CRUD tools (create, read, update, delete)"
```

---

## Task 8: Lifecycle Tools (Promote + Discard)

**Files:**
- Create: `vault-mcp/src/tools/vault-promote.ts`
- Create: `vault-mcp/src/tools/vault-discard.ts`
- Create: `vault-mcp/tests/integration/lifecycle.test.ts`
- Modify: `vault-mcp/src/index.ts` — register tools

- [ ] **Step 1: Write failing integration test for lifecycle**

Test the following scenarios in `tests/integration/lifecycle.test.ts`:
- Promotes an exploratory note: status becomes `established`, `established` date added, `branch` removed
- Promotes with updated content: content is replaced, status still transitions
- Rejects promoting an already established note
- Discards an exploratory note: file is deleted, commit message returned with title and reason
- Rejects discarding an established note

Each test seeds notes via `createNote()` in `beforeEach`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/integration/lifecycle.test.ts
```

- [ ] **Step 3: Implement vault-promote**

The `promoteNote` function:
1. Reads the note via `readNoteFile()`, parses frontmatter
2. If `status` is not `exploratory`, throws: `"Note is already '<status>'. Only exploratory notes can be promoted."`
3. Sets `status: 'established'`, `established: <today's date as YYYY-MM-DD>`
4. Deletes the `branch` field from frontmatter
5. If `content` param provided, uses that; otherwise keeps existing content
6. Validates the new frontmatter, serializes, and writes

- [ ] **Step 4: Implement vault-discard**

The `discardNote` function:
1. Reads the note, parses frontmatter
2. If `status` is not `exploratory`, throws: `"Only exploratory notes can be discarded. Established notes represent validated team knowledge and cannot be removed."`
3. Captures the title from frontmatter
4. Deletes the file via `deleteNoteFile()`
5. Constructs commit message: `"vault: discarded '<title>' — <reason> (by <author>)"` — reason defaults to `"no reason given"` if not provided
6. Returns `{ commitMessage }` — the MCP tool handler should pass this commit message to `gitPush()` when the post-write-push hook triggers. The `vault-push` tool accepts an optional `commit_message` parameter for this purpose.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/integration/lifecycle.test.ts
```

- [ ] **Step 6: Register tools in src/index.ts and build**

```bash
cd vault-mcp && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add vault-mcp/src/tools/vault-promote.ts vault-mcp/src/tools/vault-discard.ts \
  vault-mcp/tests/integration/lifecycle.test.ts vault-mcp/src/index.ts
git commit -m "feat: add lifecycle tools (promote, discard)"
```

---

## Task 9: Query and Search Tools

**Files:**
- Create: `vault-mcp/src/vault/query.ts`
- Create: `vault-mcp/src/vault/search.ts`
- Create: `vault-mcp/src/tools/vault-query.ts`
- Create: `vault-mcp/src/tools/vault-search.ts`
- Create: `vault-mcp/tests/vault/query.test.ts`
- Create: `vault-mcp/tests/vault/search.test.ts`
- Create: `vault-mcp/tests/integration/query-search.test.ts`
- Modify: `vault-mcp/src/index.ts` — register tools

- [ ] **Step 1: Write failing tests for query engine**

In `tests/vault/query.test.ts`, seed a temp vault with 5-6 notes with varying frontmatter (different statuses, branches, projects, tags, authors, dates). Test:
- Filter by single status returns only matching notes
- Filter by branch returns only matching notes
- Filter by project returns only matching notes
- Filter by tags with AND logic (all specified tags must be present)
- Filter by author returns only matching notes
- Filter by created_after/created_before date range
- Combined filters (status + branch) return intersection
- No filters returns all notes
- Empty result when nothing matches

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/vault/query.test.ts
```

- [ ] **Step 3: Implement query engine**

The `queryNotes` function in `src/vault/query.ts`:
1. Recursively finds all `.md` files in the vault (using `readdirSync` with recursive option)
2. Excludes files in `.obsidian/`, `README.md`, and files without frontmatter
3. Parses frontmatter from each file via `parseFrontmatter()`
4. Applies each provided filter (AND logic across all filters):
   - `status`: exact match on `frontmatter.status`
   - `branch`: exact match on `frontmatter.branch`
   - `project`: exact match on `frontmatter.project`
   - `tags`: every tag in the filter array must exist in `frontmatter.tags` (AND)
   - `author`: exact match on `frontmatter.author`
   - `created_after`: `frontmatter.created >= filter` (ISO string comparison)
   - `created_before`: `frontmatter.created <= filter` (ISO string comparison)
5. Returns `{ path: string, title: string, frontmatter: NoteFrontmatter }[]`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/vault/query.test.ts
```

- [ ] **Step 5: Write failing tests for search**

In `tests/vault/search.test.ts`, seed a temp vault with notes containing known content. Test:
- Case-insensitive matching finds results
- Returns matching line with 2 lines of surrounding context
- Respects limit parameter
- Returns empty array when no matches
- Excludes `.obsidian/` files from results

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/vault/search.test.ts
```

- [ ] **Step 7: Implement search**

The `searchNotes` function in `src/vault/search.ts`:
1. Recursively finds all `.md` files in the vault (same traversal as query)
2. Reads each file, splits into lines
3. For each line, checks if it contains the query string (case-insensitive)
4. For each match, captures: the matching line, line number, and 2 lines before + 2 lines after as context
5. Parses frontmatter to get the title
6. Collects results as `{ path, title, matches: { line, lineNumber, context }[] }[]`
7. Stops collecting after reaching `limit` results (default 20)

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/vault/search.test.ts
```

- [ ] **Step 9: Create tool wrappers and register in index.ts**

Create `src/tools/vault-query.ts`: wraps `queryNotes()`, loads vault path from `getConfig()`, passes through filter parameters.

Create `src/tools/vault-search.ts`: wraps `searchNotes()`, loads vault path from `getConfig()`, passes through query and limit parameters.

Register both tools in `src/index.ts` with parameter schemas matching the spec.

- [ ] **Step 10: Write integration test**

In `tests/integration/query-search.test.ts`: create several notes via `createNote()`, then:
- Query by status and verify correct results
- Query by branch and verify
- Search by content string and verify matching lines returned
- Combine query + search in sequence

- [ ] **Step 11: Run all tests**

```bash
cd vault-mcp && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 12: Commit**

```bash
git add vault-mcp/src/vault/query.ts vault-mcp/src/vault/search.ts \
  vault-mcp/src/tools/vault-query.ts vault-mcp/src/tools/vault-search.ts \
  vault-mcp/tests/vault/query.test.ts vault-mcp/tests/vault/search.test.ts \
  vault-mcp/tests/integration/query-search.test.ts vault-mcp/src/index.ts
git commit -m "feat: add query and search tools"
```

---

## Task 10: Git Sync Module and Tools

**Files:**
- Create: `vault-mcp/src/git/sync.ts`
- Create: `vault-mcp/src/tools/vault-pull.ts`
- Create: `vault-mcp/src/tools/vault-push.ts`
- Create: `vault-mcp/src/tools/vault-status.ts`
- Create: `vault-mcp/tests/git/sync.test.ts`
- Create: `vault-mcp/tests/integration/git-sync.test.ts`
- Modify: `vault-mcp/src/index.ts` — register tools

- [ ] **Step 1: Write failing tests for git sync**

In `tests/git/sync.test.ts`, set up a bare remote repo and a local clone in `beforeEach`. Test:

`gitStatus`:
- Returns clean status when no changes
- Detects uncommitted changes (new file)
- Detects ahead count after local commit

`gitPush`:
- Commits and pushes changes successfully
- Handles "nothing to commit" gracefully (returns success with message)

`gitPull`:
- Pulls remote changes successfully (create second clone, push from it, then pull from first)
- Handles "already up to date" gracefully
- **Conflict resolution**: simulate a conflict by editing the same file in two clones, push from clone B, then pull from clone A. Verify:
  - The stash/pop flow resolves cleanly when changes are in different parts of the file
  - When changes conflict on the same line, `gitPull` returns `{ success: false }` with error details mentioning the conflicting file
  - After a failed conflict resolution, the repo is left in a clean state (no dangling stashes, no in-progress rebase)

Use `execSync` in tests for setting up the remote/clone infrastructure (to avoid coupling test setup to the implementation).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd vault-mcp && npx vitest run tests/git/sync.test.ts
```

- [ ] **Step 3: Implement git sync module**

Using `simple-git` in `src/git/sync.ts`:

`gitPull(vaultPath: string)`:
1. Create `simpleGit(vaultPath)` instance
2. Try `git.pull(['--rebase'])`
3. On error, check if it's a rebase conflict
4. If conflict: `git.rebase(['--abort'])` then `git.stash()` then `git.pull(['--rebase'])` then `git.stash(['pop'])`
5. If stash pop fails: `git.stash(['drop'])` then return error with conflicting file details
6. Return `{ success: true, message: '...' }` or `{ success: false, error: '...' }`

`gitPush(vaultPath: string, author: string, commitMessage?: string)`:
1. Create `simpleGit(vaultPath)` instance
2. Check `git.status()` for changes — if clean, return `{ success: true, message: 'Nothing to commit' }`
3. `git.raw(['add', '-A'])` (note: `simple-git`'s `git.add()` treats args as file paths, not flags — use `git.raw()` for `-A`)
4. `git.commit(commitMessage ?? 'vault: auto-sync from ' + author)`
5. Try `git.push()` — if fails, return warning with changes committed locally
6. Return `{ success: true, message: '...' }` or `{ success: true, warning: '...' }`

`gitStatus(vaultPath: string)`:
1. Create `simpleGit(vaultPath)` instance
2. Get `git.status()`
3. Return `{ uncommitted_changes: string[], ahead: number, behind: number, branch: string }`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd vault-mcp && npx vitest run tests/git/sync.test.ts
```

- [ ] **Step 5: Create tool wrappers**

`src/tools/vault-pull.ts`: loads config via `getConfig()`, calls `gitPull(config.vault_path)`, returns result.

`src/tools/vault-push.ts`: loads config via `getConfig()`, accepts optional `commit_message` parameter, calls `gitPush(config.vault_path, config.author, commit_message)`, returns result.

`src/tools/vault-status.ts`: loads config via `getConfig()`, calls `gitStatus(config.vault_path)`, returns result as JSON.

- [ ] **Step 6: Register tools in src/index.ts**

Add `vault-pull` (no params), `vault-push` (optional `commit_message` string param), and `vault-status` (no params) tool definitions.

- [ ] **Step 7: Write integration test**

In `tests/integration/git-sync.test.ts`:
1. Set up bare remote + two local clones (simulating two developers)
2. Clone A: create a note file, push via `gitPush()`
3. Clone B: pull via `gitPull()`, verify the note file exists
4. Check `gitStatus()` shows clean state after sync

- [ ] **Step 8: Run all tests**

```bash
cd vault-mcp && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 9: Build**

```bash
cd vault-mcp && npm run build
```

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add vault-mcp/src/git/sync.ts vault-mcp/src/tools/vault-pull.ts \
  vault-mcp/src/tools/vault-push.ts vault-mcp/src/tools/vault-status.ts \
  vault-mcp/tests/git/sync.test.ts vault-mcp/tests/integration/git-sync.test.ts \
  vault-mcp/src/index.ts
git commit -m "feat: add git sync module and tools (pull, push, status)"
```

---

## Task 11: vault-sync Plugin

**Files:**
- Create: `vault-sync/plugin.json`
- Create: `vault-sync/skills/setup.md`
- Create: `vault-sync/skills/vault-note.md`
- Create: `vault-sync/skills/promote.md`
- Create: `vault-sync/skills/cleanup.md`
- Create: `vault-sync/agents/promoter.md`
- Create: `vault-sync/templates/note-template.md`

- [ ] **Step 1: Create plugin.json**

Copy the plugin.json from the spec exactly (lines 195-262 of the design spec). This includes all skill definitions, prompt-based hooks (pre-write-pull, post-write-push, session-start-check, observation-suggestion), and the promoter agent definition.

- [ ] **Step 2: Create /vault-setup skill**

`skills/setup.md` — guides the developer through:
1. Asking for vault repo URL, local path (default `~/obsidian/team-vault`), GitHub username
2. Cloning the vault repo
3. Calling `vault-init` MCP tool
4. Optionally installing smart-connections
5. Verifying setup with a test `vault-query`
6. Displaying available commands

- [ ] **Step 3: Create /vault-note skill**

`skills/vault-note.md` — guides note creation:
1. Takes insight as argument or asks for it
2. Suggests claim-style title, asks for confirmation
3. Auto-detects branch and project from git
4. Asks for tags
5. Calls `vault-create-note` MCP tool

- [ ] **Step 4: Create /promote-to-vault skill**

`skills/promote.md` — guides promotion workflow:
1. Detects current branch or asks which merged branch
2. Queries for exploratory notes on that branch
3. Handles no-notes and already-promoted cases
4. Dispatches promoter agent for review
5. Presents recommendations, lets user decide per-note
6. Calls vault-promote or vault-discard per decision

- [ ] **Step 5: Create /vault-cleanup skill**

`skills/cleanup.md` — guides cleanup:
1. Queries all exploratory notes
2. Filters by current project
3. Checks branch existence for each (local + remote)
4. Groups into orphaned/stale/active
5. Prompts for bulk discard of orphaned, review of stale

- [ ] **Step 6: Create promoter agent**

`agents/promoter.md` — system prompt for the promoter agent:
1. Reads each exploratory note
2. Assesses accuracy against merged code
3. Checks for duplicates via vault-search
4. Recommends: promote / edit / discard with reasons
5. Optionally proposes new notes from session transcripts

- [ ] **Step 7: Create note template**

`templates/note-template.md` — default frontmatter template with placeholders for title, status, branch, author, created, tags, project, content, context section, and see-also section.

- [ ] **Step 8: Commit**

```bash
git add vault-sync/
git commit -m "feat: create vault-sync Claude Code plugin with skills, hooks, agent"
```

---

## Task 12: Final Integration & Smoke Test

**Files:**
- Modify: `vault-mcp/src/index.ts` — verify all 12 tools registered

- [ ] **Step 1: Verify all tools are registered**

Check that `src/index.ts` registers exactly these 12 tools:
1. `vault-init`
2. `vault-create-note`
3. `vault-read-note`
4. `vault-update-note`
5. `vault-delete-note`
6. `vault-promote`
7. `vault-discard`
8. `vault-query`
9. `vault-search`
10. `vault-pull`
11. `vault-push`
12. `vault-status`

- [ ] **Step 2: Run full test suite**

```bash
cd vault-mcp && npx vitest run
```

Expected: All tests PASS across all test files.

- [ ] **Step 3: Build final**

```bash
cd vault-mcp && npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 4: Smoke test the MCP server**

Start the server and verify it responds to the MCP initialize handshake:

```bash
cd vault-mcp && echo '{"jsonrpc":"2.0","method":"initialize","params":{"capabilities":{}},"id":1}' | node dist/index.js
```

Expected: JSON response with server capabilities and tool list.

- [ ] **Step 5: Verify plugin.json is valid**

```bash
cat vault-sync/plugin.json | python3 -m json.tool
```

Expected: Valid JSON, no parse errors.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final integration verification"
```

- [ ] **Step 7: Run all tests one final time**

```bash
cd vault-mcp && npx vitest run
```

Expected: All tests PASS. The project is ready.
