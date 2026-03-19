export interface QueuedObservation {
  tool_name: string;
  tool_input: string;
  tool_response: string;
  timestamp: number;
  cwd?: string;
}

export interface VaultSuggestion {
  title: string;
  content: string;
  tags: string[];
  confidence: number;
  evaluatedAt: number;
}

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

export const MAX_INPUT_LENGTH = 2000;
