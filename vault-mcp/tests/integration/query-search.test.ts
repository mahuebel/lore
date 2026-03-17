import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createNote } from '../../src/tools/vault-create-note.js';
import { queryNotes } from '../../src/vault/query.js';
import { searchNotes } from '../../src/vault/search.js';

describe('Query and Search integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'vault-qs-'));
    mkdirSync(join(tempDir, 'inbox'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'architecture'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'conventions'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'research'), { recursive: true });
    mkdirSync(join(tempDir, 'knowledge', 'debugging'), { recursive: true });

    createNote(tempDir, 'testuser', {
      title: 'Auth Token Refresh',
      content: 'JWT tokens should be refreshed before expiry.\nUse refresh tokens stored securely.',
      tags: ['architecture'],
      project: 'auth-service',
      branch: 'feat/auth',
    });

    createNote(tempDir, 'testuser', {
      title: 'Database Migration Strategy',
      content: 'Always run migrations in a transaction.\nRollback on failure is critical.',
      tags: ['convention'],
      project: 'data-platform',
      branch: 'feat/migrations',
    });

    createNote(tempDir, 'testuser', {
      title: 'API Rate Limiting',
      content: 'Use token bucket algorithm for rate limiting.\nJWT validation should happen before rate check.',
      tags: ['architecture'],
      project: 'auth-service',
      branch: 'feat/rate-limit',
    });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('queries by status returns all exploratory notes', () => {
    const results = queryNotes(tempDir, { status: 'exploratory' });
    expect(results).toHaveLength(3);
  });

  it('queries by project returns correct notes', () => {
    const results = queryNotes(tempDir, { project: 'auth-service' });
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(['API Rate Limiting', 'Auth Token Refresh']);
  });

  it('queries by branch returns correct note', () => {
    const results = queryNotes(tempDir, { branch: 'feat/migrations' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Database Migration Strategy');
  });

  it('searches by content string and finds matching lines', () => {
    const results = searchNotes(tempDir, 'JWT');
    expect(results).toHaveLength(2);
    const titles = results.map((r) => r.title).sort();
    expect(titles).toEqual(['API Rate Limiting', 'Auth Token Refresh']);
    // Verify matches contain the actual lines
    for (const result of results) {
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.some((m) => m.line.toLowerCase().includes('jwt'))).toBe(true);
    }
  });

  it('combined query and search narrows results', () => {
    // First query to find auth-service notes
    const queried = queryNotes(tempDir, { project: 'auth-service' });
    expect(queried).toHaveLength(2);

    // Then search within those for "rate"
    const searched = searchNotes(tempDir, 'rate');
    const intersection = searched.filter((s) =>
      queried.some((q) => q.path === s.path)
    );
    expect(intersection).toHaveLength(1);
    expect(intersection[0].title).toBe('API Rate Limiting');
  });
});
