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
