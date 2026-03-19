import { readStdin, daemonRequest, output } from './utils.js';

const SKIP_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'LS', 'Agent',
  'TodoWrite', 'AskUserQuestion', 'TaskCreate', 'TaskUpdate', 'TaskGet',
  'TaskList', 'SendMessage', 'Skill', 'ToolSearch',
]);

function truncate(value: any, maxLen: number): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

async function main() {
  try {
    const input = await readStdin();
    const { tool_name, tool_input, tool_response, cwd } = input;

    if (!tool_name || SKIP_TOOLS.has(tool_name)) {
      output({});
    }

    await daemonRequest('POST', '/observations', {
      tool_name,
      tool_input: truncate(tool_input, 2000),
      tool_response: truncate(tool_response, 2000),
      timestamp: Date.now(),
      cwd,
    });

    output({});
  } catch {
    output({});
  }
}

main();
