import axios, { AxiosError } from 'axios';
import logger from '../utils/logger.js';

export interface FalImageOptions {
  apiKey?: string;
  /** fal.ai model id, e.g. fal-ai/flux/dev (default), fal-ai/flux/schnell (cheaper), fal-ai/flux-pro/v1.1 (better). */
  model?: string;
  width?: number;
  height?: number;
  maxRetries?: number;
  timeoutMs?: number;
  /** HTTP POST implementation (injectable for tests). */
  httpPost?: typeof axios.post;
}

interface FalImageResponse {
  images?: Array<{ url: string; width?: number; height?: number; content_type?: string }>;
}

/**
 * Text-to-image through fal.ai's synchronous endpoint (https://fal.run/<model>).
 * Returns the URL of the generated image; AssetDownloader fetches it like any other asset.
 */
export class FalImageGenerator {
  private apiKey: string;
  readonly model: string;
  private width: number;
  private height: number;
  private maxRetries: number;
  private timeoutMs: number;
  private httpPost: typeof axios.post;

  constructor(options: FalImageOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.FAL_KEY ?? '';
    this.model = options.model ?? process.env.FAL_IMAGE_MODEL ?? 'fal-ai/flux/dev';
    // ~1 megapixel 16:9 (multiples of 16): sharp enough for 1080p Ken Burns, ~half the price of full 1080p.
    this.width = options.width ?? 1344;
    this.height = options.height ?? 768;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.httpPost = options.httpPost ?? axios.post.bind(axios);
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async generate(prompt: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('FAL_KEY is not set');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.httpPost<FalImageResponse>(
          `https://fal.run/${this.model}`,
          {
            prompt,
            image_size: { width: this.width, height: this.height },
            num_images: 1,
            output_format: 'jpeg',
            enable_safety_checker: true
          },
          {
            headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
            timeout: this.timeoutMs
          }
        );

        const url = response.data?.images?.[0]?.url;
        if (!url) {
          throw new Error('fal.ai returned no image');
        }
        return url;
      } catch (error) {
        lastError = error;
        const status = (error as AxiosError).response?.status;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (!retryable || attempt === this.maxRetries) break;
        const delayMs = 2000 * 2 ** attempt;
        logger.warn({ status, attempt: attempt + 1, delayMs }, 'fal.ai request failed, retrying');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    const status = (lastError as AxiosError)?.response?.status;
    const detail = (lastError as AxiosError)?.response?.data ?? (lastError as Error)?.message;
    throw new Error(`fal.ai image generation failed${status ? ` (HTTP ${status})` : ''}: ${JSON.stringify(detail)}`);
  }
}
