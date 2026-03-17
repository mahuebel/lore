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
