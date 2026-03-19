import { type QueuedObservation, type VaultSuggestion } from './types.js';

export async function evaluateObservations(
  observations: QueuedObservation[]
): Promise<VaultSuggestion[]> {
  if (observations.length === 0) return [];

  const observationsXml = observations
    .map(
      (obs, i) =>
        `  <observation index="${i}">
    <tool_name>${obs.tool_name}</tool_name>
    <tool_input>${obs.tool_input}</tool_input>
    <tool_response>${obs.tool_response}</tool_response>
  </observation>`
    )
    .join('\n');

  const prompt = `You are a knowledge vault curator. Review these tool use observations from a coding session and identify discoveries worth preserving as permanent team knowledge.

A vault note captures a reusable insight — something that saves time or prevents mistakes for any developer working on this codebase in the future. It is a claim-style assertion, NOT a session log.

<observations>
${observationsXml}
</observations>

For each vault-worthy discovery, assess:
- Reusability: Would another developer benefit from this in 3+ months?
- Non-obviousness: Did this require discovery, not just reading docs?
- Specificity: Can it be stated as a concrete, falsifiable claim?

Skip: routine file edits, simple configs, trivial bug fixes, tool noise.

Return a JSON array (no other text):
[
  {
    "title": "Claim-style title stating the insight",
    "content": "2-3 sentence explanation",
    "tags": ["architecture"],
    "confidence": 0.85
  }
]

If nothing is vault-worthy, return: []`;

  let queryFn: any = null;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query;
  } catch {
    process.stderr.write('[vault-sync] Agent SDK not available, evaluation disabled\n');
  }

  if (!queryFn) return [];

  try {
    const options = {
      disallowedTools: [
        'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebFetch', 'WebSearch', 'Agent', 'TodoWrite',
        'NotebookEdit', 'AskUserQuestion',
      ],
    };

    let resultText = '';
    for await (const message of queryFn({ prompt, options })) {
      if (message.type === 'result') {
        resultText = message.result;
      }
    }

    // Strip markdown code fences if present
    const cleaned = resultText
      .replace(/^```(?:json)?\s*\n?/m, '')
      .replace(/\n?```\s*$/m, '')
      .trim();

    const parsed: Array<{
      title: string;
      content: string;
      tags: string[];
      confidence: number;
    }> = JSON.parse(cleaned);

    return parsed.map((item) => ({
      title: item.title,
      content: item.content,
      tags: item.tags,
      confidence: item.confidence,
      evaluatedAt: Date.now(),
    }));
  } catch {
    return [];
  }
}
