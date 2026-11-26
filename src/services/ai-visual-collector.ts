import { Asset, Channel, VisualRequest } from '../types/index.js';
import { AssetCollector } from './asset-collector.js';
import { FalImageGenerator } from './fal-image-generator.js';
import { ImagePromptWriter } from './image-prompt-writer.js';
import logger from '../utils/logger.js';

export type VisualSource = 'ai' | 'pexels';

/** VISUAL_SOURCE=ai|pexels. Defaults to ai when FAL_KEY is set, pexels otherwise. */
export function resolveVisualSource(env: NodeJS.ProcessEnv = process.env): VisualSource {
  const explicit = env.VISUAL_SOURCE?.trim().toLowerCase();
  if (explicit === 'ai' || explicit === 'pexels') return explicit;
  return env.FAL_KEY ? 'ai' : 'pexels';
}

/**
 * Generates one AI image per timeline beat. Any beat whose generation fails falls back to Pexels,
 * so a video is always produced.
 */
export class AiVisualCollector {
  private concurrency: number;

  constructor(
    private generator: FalImageGenerator = new FalImageGenerator(),
    private promptWriter: ImagePromptWriter = new ImagePromptWriter(),
    private fallbackCollector: Pick<AssetCollector, 'collectAssetsForTimeline'> = new AssetCollector(),
    concurrency: number = Number(process.env.FAL_CONCURRENCY) || 4
  ) {
    this.concurrency = Math.max(1, concurrency);
  }

  async collect(channel: Channel, topic: string, requests: VisualRequest[]): Promise<Asset[]> {
    console.log(`\n🖼️  Writing ${requests.length} image prompts...`);
    const prompts = await this.promptWriter.writePrompts(channel, topic, requests);

    console.log(`🎨 Generating ${requests.length} images with ${this.generator.model} (x${this.concurrency} parallel)...\n`);
    const results: Array<Asset | null> = new Array(requests.length).fill(null);
    let next = 0;
    let done = 0;

    const worker = async () => {
      while (next < requests.length) {
        const i = next++;
        const req = requests[i];
        try {
          const url = await this.generator.generate(prompts[i]);
          results[i] = {
            type: 'image',
            url,
            duration: req.durationSeconds,
            source: 'ai',
            category: 'episode_specific',
            channelId: req.channelId,
            searchQuery: req.searchQuery,
            prompt: prompts[i],
            attribution: `AI generated (${this.generator.model})`
          };
        } catch (error) {
          logger.warn({ beat: req.label, error: (error as Error).message }, 'AI image failed, will fall back to Pexels');
        }
        done++;
        if (done % 10 === 0 || done === requests.length) {
          console.log(`   ${done}/${requests.length} images`);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.concurrency, requests.length) }, worker));

    const failed = results.map((r, i) => (r ? -1 : i)).filter(i => i >= 0);
    if (failed.length > 0) {
      console.log(`⚠️  ${failed.length} beats failed with AI, falling back to Pexels`);
      const fallback = await this.fallbackCollector.collectAssetsForTimeline(failed.map(i => requests[i]));
      failed.forEach((beatIndex, k) => {
        results[beatIndex] = fallback[k] ?? null;
      });
    }

    return results.filter((a): a is Asset => a !== null);
  }
}
