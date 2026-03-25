import { readStdin, daemonRequest, output } from './utils.js';
import { writeHookStatus } from '../hook-heartbeat.js';
import { MAX_INPUT_LENGTH } from '../types.js';

const SKIP_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'LS', 'Agent',
  'TodoWrite', 'AskUserQuestion', 'TaskCreate', 'TaskUpdate', 'TaskGet',
  'TaskList', 'SendMessage', 'Skill', 'ToolSearch',
]);

function extractFiles(toolName: string, toolInput: any): string[] {
  const files: string[] = [];
  if (!toolInput) return files;

  // Edit, Write, Read, MultiEdit, NotebookEdit all have file_path
  if (typeof toolInput === 'object' && toolInput.file_path) {
    files.push(toolInput.file_path);
  }
  // Bash: best-effort extraction of file paths from command
  if (toolName === 'Bash' && typeof toolInput === 'object' && toolInput.command) {
    const pathMatches = toolInput.command.match(/(?:^|\s)(\/[\w./-]+\.\w+)/g);
    if (pathMatches) {
      files.push(...pathMatches.map((m: string) => m.trim()));
    }
  }

  return [...new Set(files)]; // dedupe
}

function truncate(value: any, maxLen: number): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

async function main() {
  try {
    writeHookStatus('PostToolUse', { lastFiredAt: Date.now(), success: true });
    const input = await readStdin();
    const { tool_name, tool_input, tool_response, cwd } = input;

    if (!tool_name || SKIP_TOOLS.has(tool_name)) {
      return output({});
    }

    const files = extractFiles(tool_name, tool_input);

    await daemonRequest('POST', '/observations', {
      tool_name,
      tool_input: truncate(tool_input, MAX_INPUT_LENGTH),
      tool_response: truncate(tool_response, MAX_INPUT_LENGTH),
      timestamp: Date.now(),
      cwd,
      files,
    });

    output({});
  } catch (err) {
    writeHookStatus('PostToolUse', { lastFiredAt: Date.now(), success: false, error: String(err) });
    output({});
  }
}

main();
