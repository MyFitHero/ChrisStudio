import axios from 'axios';
import logger from '../utils/logger.js';

export interface KieImageOptions {
  apiKey?: string;
  /** kie.ai Market model id: z-image (default, cheapest), flux-2/pro-text-to-image, google/imagen4, grok-imagine/text-to-image. */
  model?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  /** HTTP implementation (injectable for tests). */
  http?: { post: typeof axios.post; get: typeof axios.get };
  sleep?: (ms: number) => Promise<void>;
}

interface KieEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface KieTaskRecord {
  state?: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail';
  resultJson?: string | null;
  failCode?: string;
  failMsg?: string;
}

const BASE_URL = 'https://api.kie.ai/api/v1/jobs';

/** Prompt length limits per model (docs.kie.ai). */
const MAX_PROMPT_CHARS: Record<string, number> = {
  'z-image': 1000
};

/** kie.ai codes worth retrying: rate limit, timeout, generation failure, maintenance. */
const RETRYABLE_CODES = new Set([429, 408, 455, 500, 501, 502, 503]);

class KieError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

/**
 * Text-to-image through kie.ai's Market jobs API: createTask, then poll recordInfo until success.
 * kie.ai returns errors with HTTP 200 and a `code` in the body, so the body code is always checked.
 */
export class KieImageGenerator {
  private apiKey: string;
  readonly model: string;
  private pollIntervalMs: number;
  private timeoutMs: number;
  private maxRetries: number;
  private http: { post: typeof axios.post; get: typeof axios.get };
  private sleep: (ms: number) => Promise<void>;

  constructor(options: KieImageOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.KIE_API_KEY ?? '';
    this.model = options.model ?? process.env.KIE_IMAGE_MODEL ?? 'z-image';
    this.pollIntervalMs = options.pollIntervalMs ?? 3000;
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.http = options.http ?? { post: axios.post.bind(axios), get: axios.get.bind(axios) };
    this.sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  buildInput(prompt: string): Record<string, unknown> {
    const max = MAX_PROMPT_CHARS[this.model] ?? 5000;
    const input: Record<string, unknown> = {
      prompt: prompt.slice(0, max),
      aspect_ratio: '16:9'
    };
    if (this.model.startsWith('flux-2/')) input.resolution = '1K';
    if (this.model !== 'google/imagen4') input.nsfw_checker = true;
    return input;
  }

  async generate(prompt: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('KIE_API_KEY is not set');
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const taskId = await this.createTask(prompt);
        return await this.waitForResult(taskId);
      } catch (error) {
        lastError = error;
        const code = (error as KieError).code;
        const retryable = code === undefined || RETRYABLE_CODES.has(code);
        if (!retryable || attempt === this.maxRetries) break;
        const delayMs = 3000 * 2 ** attempt;
        logger.warn({ code, attempt: attempt + 1, delayMs }, 'kie.ai generation failed, retrying');
        await this.sleep(delayMs);
      }
    }
    throw new Error(`kie.ai image generation failed: ${(lastError as Error)?.message ?? lastError}`);
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  private async createTask(prompt: string): Promise<string> {
    const response = await this.http.post<KieEnvelope<{ taskId?: string }>>(
      `${BASE_URL}/createTask`,
      { model: this.model, input: this.buildInput(prompt) },
      { headers: this.headers(), timeout: 60_000 }
    );
    const body = response.data;
    if (body?.code !== 200 || !body.data?.taskId) {
      throw new KieError(`createTask code ${body?.code}: ${body?.msg ?? 'no taskId'}`, body?.code);
    }
    return body.data.taskId;
  }

  private async waitForResult(taskId: string): Promise<string> {
    const deadline = Date.now() + this.timeoutMs;
    let interval = this.pollIntervalMs;

    while (Date.now() < deadline) {
      await this.sleep(interval);
      const response = await this.http.get<KieEnvelope<KieTaskRecord>>(`${BASE_URL}/recordInfo`, {
        params: { taskId },
        headers: this.headers(),
        timeout: 30_000
      });
      const body = response.data;
      if (body?.code !== 200) {
        throw new KieError(`recordInfo code ${body?.code}: ${body?.msg ?? ''}`, body?.code);
      }

      const record = body.data ?? {};
      if (record.state === 'success') {
        const parsed = record.resultJson ? (JSON.parse(record.resultJson) as { resultUrls?: string[] }) : {};
        const url = parsed.resultUrls?.[0];
        if (!url) throw new KieError('task succeeded without resultUrls', 501);
        return url;
      }
      if (record.state === 'fail') {
        throw new KieError(`task failed (${record.failCode || '?'}): ${record.failMsg || 'unknown'}`, 501);
      }
      interval = Math.min(interval * 1.5, 10_000);
    }
    throw new KieError(`task ${taskId} timed out`, 408);
  }
}
