import { describe, it, expect, vi } from 'vitest';
import { channels } from '../config/channels.js';
import { extractText, parseJsonResponse } from '../services/claude-client.js';
import { FalImageGenerator } from '../services/fal-image-generator.js';
import { ImagePromptWriter } from '../services/image-prompt-writer.js';
import { AiVisualCollector, resolveVisualSource } from '../services/ai-visual-collector.js';
import { Asset, VisualRequest } from '../types/index.js';

const channel = channels['human-odyssey'];

const beats: VisualRequest[] = [
  { label: 'hook-beat-1', searchQuery: 'roman aqueduct', preferredType: 'image', durationSeconds: 7, channelId: channel.id, narration: 'Two thousand years ago, Rome carried water across valleys.' },
  { label: 'section-1-beat-1', searchQuery: 'roman engineers', preferredType: 'image', durationSeconds: 6, channelId: channel.id, narration: 'Engineers measured every slope by hand.' },
  { label: 'section-1-beat-2', searchQuery: 'ancient rome city', preferredType: 'image', durationSeconds: 8, channelId: channel.id, narration: 'The city of a million people never ran dry.' }
];

describe('claude-client helpers', () => {
  it('extractText skips thinking blocks', () => {
    const text = extractText({
      content: [
        { type: 'thinking', thinking: '', signature: 'x' },
        { type: 'text', text: '{"a":1}', citations: null }
      ]
    } as any);
    expect(text).toBe('{"a":1}');
  });

  it('parseJsonResponse handles fences, prose and trailing commas', () => {
    expect(parseJsonResponse('```json\n{"a": [1, 2,],}\n```')).toEqual({ a: [1, 2] });
    expect(parseJsonResponse('Here you go: {"b": 2}')).toEqual({ b: 2 });
  });
});

describe('resolveVisualSource', () => {
  it('defaults to ai only when FAL_KEY is set', () => {
    expect(resolveVisualSource({ FAL_KEY: 'k' })).toBe('ai');
    expect(resolveVisualSource({})).toBe('pexels');
  });

  it('respects an explicit VISUAL_SOURCE', () => {
    expect(resolveVisualSource({ FAL_KEY: 'k', VISUAL_SOURCE: 'pexels' })).toBe('pexels');
    expect(resolveVisualSource({ VISUAL_SOURCE: 'AI' })).toBe('ai');
  });
});

describe('FalImageGenerator', () => {
  it('posts the prompt to fal.run and returns the image url', async () => {
    const httpPost = vi.fn(async () => ({ data: { images: [{ url: 'https://fal.media/x.jpg' }] } }));
    const gen = new FalImageGenerator({ apiKey: 'test-key', model: 'fal-ai/flux/dev', httpPost: httpPost as any });

    await expect(gen.generate('a roman aqueduct')).resolves.toBe('https://fal.media/x.jpg');

    const [url, body, config] = httpPost.mock.calls[0] as unknown as [string, any, any];
    expect(url).toBe('https://fal.run/fal-ai/flux/dev');
    expect(body).toMatchObject({ prompt: 'a roman aqueduct', num_images: 1, image_size: { width: 1344, height: 768 } });
    expect(config.headers.Authorization).toBe('Key test-key');
  });

  it('does not retry client errors', async () => {
    let calls = 0;
    const httpPost = async () => {
      calls++;
      throw Object.assign(new Error('Request failed with status code 422'), {
        response: { status: 422, data: { detail: 'bad prompt' } }
      });
    };
    const gen = new FalImageGenerator({ apiKey: 'k', maxRetries: 3, httpPost: httpPost as any });

    await expect(gen.generate('x')).rejects.toThrow('HTTP 422');
    expect(calls).toBe(1);
  });

  it('refuses to run without a key', async () => {
    await expect(new FalImageGenerator({ apiKey: '' }).generate('x')).rejects.toThrow('FAL_KEY');
  });
});

describe('ImagePromptWriter templates', () => {
  it('appends the channel style and bans text', () => {
    const prompt = new ImagePromptWriter().fallbackPrompt(channel, beats[0]);
    expect(prompt).toContain('roman aqueduct');
    expect(prompt).toContain('Rome carried water');
    expect(prompt).toContain(channel.aiImageStyle!);
    expect(prompt).toContain('no text');
  });

  it('every channel defines an AI image style', () => {
    for (const c of Object.values(channels)) {
      expect(c.aiImageStyle?.length).toBeGreaterThan(20);
    }
  });
});

describe('AiVisualCollector', () => {
  it('keeps beat order and falls back to Pexels only for failed beats', async () => {
    const generator = {
      model: 'fake-model',
      generate: vi.fn(async (prompt: string) => {
        if (prompt.startsWith('P1')) throw new Error('boom');
        return `https://ai/${prompt.slice(0, 2)}.jpg`;
      })
    };
    const promptWriter = { writePrompts: vi.fn(async () => ['P0 scene', 'P1 scene', 'P2 scene']) };
    const fallback = {
      collectAssetsForTimeline: vi.fn(async (reqs: VisualRequest[]): Promise<Asset[]> =>
        reqs.map(r => ({ type: 'image', url: `https://pexels/${r.label}.jpg`, source: 'pexels' }))
      )
    };

    const collector = new AiVisualCollector(generator as any, promptWriter as any, fallback, 2);
    const assets = await collector.collect(channel, 'Roman aqueducts', beats);

    expect(assets.map(a => a.url)).toEqual([
      'https://ai/P0.jpg',
      'https://pexels/section-1-beat-1.jpg',
      'https://ai/P2.jpg'
    ]);
    expect(assets[0]).toMatchObject({ source: 'ai', type: 'image', duration: 7, prompt: 'P0 scene' });
    expect(fallback.collectAssetsForTimeline).toHaveBeenCalledWith([beats[1]]);
  });
});
