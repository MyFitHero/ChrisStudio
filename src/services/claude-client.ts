import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';

/** Model used for every text task (topics, scripts, metadata, image prompts). Override with ANTHROPIC_MODEL. */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeTextRequest {
  system?: string | Anthropic.TextBlockParam[];
  prompt: string;
  maxTokens?: number;
  effort?: ClaudeEffort;
}

let sharedClient: Anthropic | null = null;

/**
 * Lazily create the client so that importing a service (tests, server boot) never
 * requires credentials. The SDK resolves ANTHROPIC_API_KEY (or an `ant auth login` profile).
 */
function getClient(): Anthropic {
  if (!sharedClient) {
    sharedClient = new Anthropic();
  }
  return sharedClient;
}

/** Join every text block of a response (thinking blocks are skipped). */
export function extractText(message: Pick<Anthropic.Message, 'content'>): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();
}

/** Strip optional ```json fences and trailing commas, then parse. */
export function parseJsonResponse<T = unknown>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  let json = (fenced ? fenced[1] : text).trim();
  if (!fenced) {
    const start = json.search(/[[{]/);
    const end = Math.max(json.lastIndexOf('}'), json.lastIndexOf(']'));
    if (start >= 0 && end > start) json = json.slice(start, end + 1);
  }
  json = json.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(json) as T;
}

/**
 * Single-turn text generation. Streams under the hood so long scripts never hit HTTP timeouts.
 */
export async function generateText(request: ClaudeTextRequest): Promise<string> {
  const message = await getClient()
    .messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: request.maxTokens ?? 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: request.effort ?? 'medium' },
      ...(request.system ? { system: request.system } : {}),
      messages: [{ role: 'user', content: request.prompt }]
    })
    .finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined this request (refusal). Rephrase the topic and retry.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Claude response truncated at max_tokens=${request.maxTokens ?? 16000}`);
  }

  const text = extractText(message);
  if (!text) {
    throw new Error('Empty response from Claude');
  }

  logger.debug(
    { model: CLAUDE_MODEL, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
    'Claude call completed'
  );
  return text;
}
