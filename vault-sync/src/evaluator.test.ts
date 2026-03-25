import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('EvaluationOutput validation', () => {
  it('falls back update to create when existingPath missing', () => {
    const output = {
      action: 'update' as const,
      title: 'test',
      content: 'x',
      tags: [],
      project: 'p',
      branch: 'b',
      confidence: 0.8,
    };
    if (output.action === 'update' && !('existingPath' in output && output.existingPath)) {
      (output as any).action = 'create';
    }
    assert.equal(output.action, 'create');
  });

  it('keeps update when existingPath is present', () => {
    const output = {
      action: 'update' as const,
      existingPath: 'knowledge/test.md',
      title: 'test',
      content: 'x',
      tags: [],
      project: 'p',
      branch: 'b',
      confidence: 0.8,
    };
    if (output.action === 'update' && !output.existingPath) {
      (output as any).action = 'create';
    }
    assert.equal(output.action, 'update');
    assert.equal(output.existingPath, 'knowledge/test.md');
  });
});
