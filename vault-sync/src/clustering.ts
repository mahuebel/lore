import { type QueuedObservation } from './types.js';

export interface ObservationCluster {
  observations: QueuedObservation[];
  primaryFiles: string[];
  timeRange: { start: number; end: number };
  toolBreakdown: Record<string, number>;
}

const TIME_GAP_MS = 5 * 60 * 1000;
const FILE_PROXIMITY_MS = 2 * 60 * 1000;
const MAX_CLUSTERS = 8;

const CONFIG_FILES = new Set([
  'package-lock.json', 'package.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.gitignore', '.eslintrc', '.prettierrc', 'tsconfig.json', '.env',
  'biome.json', '.editorconfig',
]);

function isConfigFile(filepath: string): boolean {
  const basename = filepath.split('/').pop() || '';
  return CONFIG_FILES.has(basename);
}

function filesOverlap(a: string[], b: string[], minOverlap: number): boolean {
  let count = 0;
  const setB = new Set(b);
  for (const f of a) {
    if (setB.has(f)) count++;
    if (count >= minOverlap) return true;
  }
  return false;
}

function clusterScore(cluster: ObservationCluster): number {
  return cluster.primaryFiles.length * 2 + cluster.observations.length;
}

function buildCluster(observations: QueuedObservation[]): ObservationCluster {
  const fileCount = new Map<string, number>();
  const toolCount: Record<string, number> = {};

  for (const obs of observations) {
    for (const f of obs.files || []) {
      fileCount.set(f, (fileCount.get(f) || 0) + 1);
    }
    toolCount[obs.tool_name] = (toolCount[obs.tool_name] || 0) + 1;
  }

  const primaryFiles = [...fileCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([f]) => f);

  return {
    observations,
    primaryFiles,
    timeRange: {
      start: observations[0].timestamp,
      end: observations[observations.length - 1].timestamp,
    },
    toolBreakdown: toolCount,
  };
}

export function clusterObservations(observations: QueuedObservation[]): ObservationCluster[] {
  if (observations.length === 0) return [];

  const sorted = [...observations].sort((a, b) => a.timestamp - b.timestamp);

  const rawClusters: QueuedObservation[][] = [[]];

  for (const obs of sorted) {
    const current = rawClusters[rawClusters.length - 1];

    if (current.length === 0) {
      current.push(obs);
      continue;
    }

    const lastObs = current[current.length - 1];
    const timeDelta = obs.timestamp - lastObs.timestamp;

    if (timeDelta > TIME_GAP_MS) {
      rawClusters.push([obs]);
      continue;
    }

    const obsFiles = obs.files || [];
    const lastFiles = lastObs.files || [];
    const hasFileOverlap = obsFiles.length > 0 && lastFiles.length > 0 &&
      filesOverlap(obsFiles, lastFiles, 1);
    const withinProximity = timeDelta <= FILE_PROXIMITY_MS;

    if (hasFileOverlap || withinProximity || obsFiles.length === 0) {
      current.push(obs);
    } else {
      rawClusters.push([obs]);
    }
  }

  let clusters = rawClusters.map(buildCluster);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        if (filesOverlap(clusters[i].primaryFiles, clusters[j].primaryFiles, 2)) {
          const combined = [...clusters[i].observations, ...clusters[j].observations]
            .sort((a, b) => a.timestamp - b.timestamp);
          clusters[i] = buildCluster(combined);
          clusters.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  clusters = clusters.filter(c => {
    if (c.observations.length > 1) return true;
    const obs = c.observations[0];
    const files = obs.files || [];
    if (files.length === 0) return true;
    return !files.every(f => isConfigFile(f));
  });

  if (clusters.length > MAX_CLUSTERS) {
    clusters.sort((a, b) => clusterScore(b) - clusterScore(a));
    clusters = clusters.slice(0, MAX_CLUSTERS);
  }

  clusters.sort((a, b) => a.timeRange.start - b.timeRange.start);
  return clusters;
}
