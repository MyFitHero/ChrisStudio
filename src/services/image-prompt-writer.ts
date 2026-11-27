import { Channel, VisualRequest } from '../types/index.js';
import { generateText, parseJsonResponse } from './claude-client.js';
import logger from '../utils/logger.js';

const BATCH_SIZE = 40;

const DEFAULT_STYLE = 'cinematic documentary still, photorealistic, dramatic lighting, highly detailed';

/**
 * Turns timeline beats (narration excerpt + stock keywords) into text-to-image prompts.
 * One Claude call per batch of beats keeps the visual story coherent and the cost low.
 */
export class ImagePromptWriter {
  async writePrompts(channel: Channel, topic: string, requests: VisualRequest[]): Promise<string[]> {
    const prompts: string[] = [];
    for (let start = 0; start < requests.length; start += BATCH_SIZE) {
      const batch = requests.slice(start, start + BATCH_SIZE);
      prompts.push(...(await this.writeBatch(channel, topic, batch, start)));
    }
    return prompts;
  }

  private async writeBatch(channel: Channel, topic: string, batch: VisualRequest[], offset: number): Promise<string[]> {
    const beats = batch.map((req, i) => ({
      index: i,
      narration: (req.narration || '').slice(0, 400),
      keywords: req.searchQuery
    }));

    const prompt = `You are the art director of the YouTube documentary channel "${channel.name}" (${channel.description}).
Video topic: "${topic}"

Below are consecutive shots of the video (${offset + 1} to ${offset + batch.length}). For each shot you get the narration heard while it is on screen and stock-footage keywords.
Write one text-to-image prompt per shot that illustrates exactly what the narration is talking about at that moment.

Rules:
- Describe a single concrete scene: subject, action, setting, era, camera framing (wide, close-up, aerial...), lighting.
- 25 to 60 words, in English.
- Historically and scientifically plausible; period-accurate clothing, architecture and technology.
- Vary framing between consecutive shots so the edit does not feel repetitive; keep recurring characters and places consistent.
- No text, captions, letters, logos or watermarks in the image. No gore.
- Do not include style words; a channel style is appended automatically.

Shots:
${JSON.stringify(beats, null, 2)}

Respond with JSON only: {"prompts": ["prompt for shot 0", "prompt for shot 1", ...]} with exactly ${batch.length} entries in order.`;

    try {
      const text = await generateText({ prompt, maxTokens: 32000, effort: 'low' });
      const parsed = parseJsonResponse<{ prompts?: unknown }>(text);
      const list = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      return batch.map((req, i) => {
        const candidate = typeof list[i] === 'string' ? (list[i] as string).trim() : '';
        return candidate ? this.withStyle(channel, candidate) : this.fallbackPrompt(channel, req);
      });
    } catch (error) {
      logger.warn({ error: (error as Error).message, offset }, 'Image prompt writing failed, using template prompts');
      return batch.map(req => this.fallbackPrompt(channel, req));
    }
  }

  withStyle(channel: Channel, scene: string): string {
    return `${scene.replace(/\.?\s*$/, '')}. ${channel.aiImageStyle || DEFAULT_STYLE}, no text, no watermark`;
  }

  /** Used when Claude is unavailable: keywords + the start of the narration. */
  fallbackPrompt(channel: Channel, req: VisualRequest): string {
    const narration = (req.narration || '').split(/\s+/).slice(0, 30).join(' ');
    const scene = narration ? `${req.searchQuery}, depicting: ${narration}` : req.searchQuery;
    return this.withStyle(channel, scene);
  }
}
