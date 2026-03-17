import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { vaultInit } from './tools/vault-init.js';
import { vaultPull } from './tools/vault-pull.js';
import { vaultPush } from './tools/vault-push.js';
import { vaultStatus } from './tools/vault-status.js';
import { getConfig } from './vault/config.js';
import { createNote } from './tools/vault-create-note.js';
import { readNote } from './tools/vault-read-note.js';
import { updateNote } from './tools/vault-update-note.js';
import { deleteNote } from './tools/vault-delete-note.js';
import { promoteNote } from './tools/vault-promote.js';
import { discardNote } from './tools/vault-discard.js';
import { queryNotes } from './vault/query.js';
import { searchNotes } from './vault/search.js';

const server = new McpServer({
  name: 'vault-mcp',
  version: '1.0.0',
});

server.tool('vault-init', 'Initialize vault MCP server configuration', {
  vault_path: z.string().describe('Absolute path to the vault repo'),
  author: z.string().describe('GitHub username'),
}, async ({ vault_path, author }) => {
  try {
    const result = vaultInit({ vault_path, author });
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

server.tool('vault-pull', 'Pull latest changes from the vault remote', {}, async () => {
  try {
    const result = await vaultPull();
    const text = result.error ?? result.message ?? 'Done';
    return { content: [{ type: 'text', text }], isError: !result.success };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

server.tool('vault-push', 'Commit and push vault changes to remote', {
  commit_message: z.string().optional().describe('Custom commit message (optional)'),
}, async ({ commit_message }) => {
  try {
    const result = await vaultPush(commit_message);
    const text = result.warning ?? result.message ?? 'Done';
    return { content: [{ type: 'text', text }], isError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

server.tool('vault-status', 'Show git status of the vault', {}, async () => {
  try {
    const result = await vaultStatus();
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: message }], isError: true };
  }
});

server.tool(
  'vault-create-note',
  'Create a new note in the vault',
  {
    title: z.string().describe('Note title'),
    content: z.string().describe('Note body content'),
    tags: z.array(z.string()).describe('Tags for categorization'),
    project: z.string().describe('Project name'),
    branch: z.string().optional().describe('Git branch (required for exploratory notes)'),
  },
  async (params) => {
    try {
      const config = getConfig();
      const result = createNote(config.vault_path, config.author, params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-read-note',
  'Read a note from the vault by path or title',
  {
    path: z.string().optional().describe('Relative path to the note'),
    title: z.string().optional().describe('Title substring to search for (case-insensitive)'),
  },
  async (params) => {
    try {
      const config = getConfig();
      const result = readNote(config.vault_path, params);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-update-note',
  'Update an existing note in the vault',
  {
    path: z.string().describe('Relative path to the note'),
    content: z.string().optional().describe('New body content'),
    frontmatter: z.object({}).passthrough().optional().describe('Frontmatter fields to update'),
  },
  async (params) => {
    try {
      const config = getConfig();
      updateNote(config.vault_path, params as any);
      return { content: [{ type: 'text', text: 'Note updated successfully.' }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-delete-note',
  'Delete a note from the vault',
  {
    path: z.string().describe('Relative path to the note'),
  },
  async (params) => {
    try {
      const config = getConfig();
      const result = deleteNote(config.vault_path, params);
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-promote',
  'Promote an exploratory note to established status',
  {
    path: z.string().describe('Relative path to the note'),
    content: z.string().optional().describe('Optional updated content for the note'),
  },
  async (params) => {
    try {
      const config = getConfig();
      promoteNote(config.vault_path, params);
      return { content: [{ type: 'text', text: 'Note promoted to established.' }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-discard',
  'Discard an exploratory note (deletes it and returns a commit message)',
  {
    path: z.string().describe('Relative path to the note'),
    reason: z.string().optional().describe('Reason for discarding the note'),
  },
  async (params) => {
    try {
      const config = getConfig();
      const result = discardNote(config.vault_path, config.author, params);
      return { content: [{ type: 'text', text: result.commitMessage }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-query',
  'Query notes by frontmatter fields (status, branch, project, tags, author, date range)',
  {
    status: z.string().optional().describe('Filter by status (exploratory or established)'),
    branch: z.string().optional().describe('Filter by branch name'),
    project: z.string().optional().describe('Filter by project name'),
    tags: z.array(z.string()).optional().describe('Filter by tags (AND logic)'),
    author: z.string().optional().describe('Filter by author'),
    created_after: z.string().optional().describe('Filter notes created on or after this date (YYYY-MM-DD)'),
    created_before: z.string().optional().describe('Filter notes created on or before this date (YYYY-MM-DD)'),
  },
  async (params) => {
    try {
      const config = getConfig();
      const results = queryNotes(config.vault_path, params);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

server.tool(
  'vault-search',
  'Full-text search across all notes in the vault',
  {
    query: z.string().describe('Search string (case-insensitive)'),
    limit: z.number().optional().describe('Maximum number of results (default 20)'),
  },
  async (params) => {
    try {
      const config = getConfig();
      const results = searchNotes(config.vault_path, params.query, params.limit);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: message }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

export { server };
