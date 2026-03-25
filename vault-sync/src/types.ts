export interface QueuedObservation {
  tool_name: string;
  tool_input: string;
  tool_response: string;
  timestamp: number;
  cwd?: string;
  files?: string[];
}

export interface VaultSuggestion {
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  evaluatedAt: number;
}

/** Suggestions keyed by normalized vault path */
export type VaultKeyedSuggestions = Record<string, VaultSuggestion[]>;

export interface DaemonState {
  mode: 'standalone' | 'supercharged';
  observations: QueuedObservation[];
  pendingSuggestions: VaultSuggestion[];
  startedAt: number;
}

export const DAEMON_PORT = 37778;
export const CLAUDE_MEM_PORT = 37777;
export const LORE_DIR = process.env.HOME
  ? `${process.env.HOME}/.lore`
  : '/tmp/.lore';
export const PID_FILE = `${LORE_DIR}/daemon.pid`;
export const SUGGESTIONS_FILE = `${LORE_DIR}/pending-suggestions.json`;

export const SKIP_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
  'LS', 'Agent', 'TodoWrite', 'AskUserQuestion',
  'TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList',
]);

export const MAX_INPUT_LENGTH = 8000;

export interface EvaluationOutput {
  action: 'create' | 'update' | 'skip';
  existingPath?: string;
  title: string;
  content: string;
  tags: string[];
  project: string;
  branch: string;
  confidence: number;
  skipReason?: string;
}

export interface ClusterResult {
  action: 'create' | 'update' | 'skip' | 'error';
  title?: string;
  path?: string;
  error?: string;
  confidence?: number;
}

export interface SessionRecord {
  startedAt: number;
  endedAt: number;
  observationCount: number;
  suggestionCount: number;
  suggestions: Array<{ title: string; confidence: number }>;
  error?: string;
  clusters?: ClusterResult[];
}

export interface HookHeartbeat {
  lastFiredAt: number;
  success: boolean;
  error?: string;
}

export const HOOK_STATUS_FILE = `${LORE_DIR}/hook-status.json`;
export const SESSION_HISTORY_FILE = `${LORE_DIR}/session-history.json`;
