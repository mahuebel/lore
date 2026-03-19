import { CLAUDE_MEM_PORT } from './types.js';

const CLAUDE_MEM_URL = `http://localhost:${CLAUDE_MEM_PORT}`;

export async function detectClaudeMem(): Promise<boolean> {
  try {
    const resp = await fetch(`${CLAUDE_MEM_URL}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function getRecentObservations(): Promise<any[]> {
  try {
    const resp = await fetch(`${CLAUDE_MEM_URL}/api/search?type=observations&limit=30`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    // claude-mem returns observations in various formats — normalize
    return Array.isArray(data) ? data : (data.results || data.observations || []);
  } catch {
    return [];
  }
}
