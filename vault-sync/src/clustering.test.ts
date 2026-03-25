import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clusterObservations, type ObservationCluster } from './clustering.js';
import { type QueuedObservation } from './types.js';

function obs(overrides: Partial<QueuedObservation> & { timestamp: number }): QueuedObservation {
  return {
    tool_name: 'Edit',
    tool_input: 'test input',
    tool_response: 'ok',
    files: [],
    ...overrides,
  };
}

describe('clusterObservations', () => {
  it('groups observations touching the same files within 2 minutes', () => {
    const observations = [
      obs({ timestamp: 1000, files: ['/src/foo.ts'] }),
      obs({ timestamp: 60000, files: ['/src/foo.ts'] }),
      obs({ timestamp: 200000, files: ['/src/bar.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].observations.length, 2);
    assert.deepEqual(clusters[0].primaryFiles, ['/src/foo.ts']);
  });

  it('splits on time gaps > 5 minutes', () => {
    const observations = [
      obs({ timestamp: 1000, files: ['/src/a.ts'] }),
      obs({ timestamp: 400000, files: ['/src/a.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 2);
  });

  it('merges clusters sharing 2+ files', () => {
    const observations = [
      obs({ timestamp: 1000, files: ['/src/a.ts', '/src/b.ts'] }),
      obs({ timestamp: 60000, files: ['/src/c.ts'] }),
      obs({ timestamp: 90000, files: ['/src/a.ts', '/src/b.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    const merged = clusters.find(c => c.observations.length >= 2);
    assert.ok(merged);
  });

  it('filters single-observation config-only clusters', () => {
    const observations = [
      obs({ timestamp: 1000, tool_name: 'Write', files: ['/package-lock.json'] }),
      obs({ timestamp: 400000, tool_name: 'Edit', files: ['/src/real.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].primaryFiles, ['/src/real.ts']);
  });

  it('caps at 8 clusters ranked by score', () => {
    const observations: QueuedObservation[] = [];
    for (let i = 0; i < 20; i++) {
      observations.push(obs({ timestamp: i * 600000, files: [`/src/file${i}.ts`] }));
    }
    const clusters = clusterObservations(observations);
    assert.ok(clusters.length <= 8);
  });

  it('handles observations with no files via time proximity', () => {
    const observations = [
      obs({ timestamp: 1000, files: [] }),
      obs({ timestamp: 30000, files: [] }),
      obs({ timestamp: 400000, files: [] }),
    ];
    const clusters = clusterObservations(observations);
    assert.equal(clusters.length, 2);
    assert.equal(clusters[0].observations.length, 2);
  });

  it('builds correct toolBreakdown', () => {
    const observations = [
      obs({ timestamp: 1000, tool_name: 'Edit', files: ['/src/a.ts'] }),
      obs({ timestamp: 2000, tool_name: 'Edit', files: ['/src/a.ts'] }),
      obs({ timestamp: 3000, tool_name: 'Bash', files: ['/src/a.ts'] }),
    ];
    const clusters = clusterObservations(observations);
    assert.deepEqual(clusters[0].toolBreakdown, { Edit: 2, Bash: 1 });
  });
});
