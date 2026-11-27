import { describe, it, expect } from 'vitest';
import { cuesFromAlignment, cuesFromText, toSrt } from '../services/subtitle-generator.js';
import { alignmentPathFor } from '../services/elevenlabs-voice-generator.js';

function fakeAlignment(text: string, secondsPerChar = 0.06) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * secondsPerChar),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * secondsPerChar)
  };
}

describe('subtitles', () => {
  const text =
    'In 1453, the walls of Constantinople had stood for a thousand years. ' +
    'Sultan Mehmed the Second arrived with the largest cannon the world had ever seen. ' +
    'What happened next ended an empire.';

  it('builds readable cues from character timings, breaking at sentence ends', () => {
    const cues = cuesFromAlignment(fakeAlignment(text));
    expect(cues.length).toBeGreaterThanOrEqual(3);
    expect(cues[0].text).toBe('In 1453, the walls of Constantinople had stood for a thousand years.');
    expect(cues[0].start).toBe(0);
    for (const c of cues) {
      expect(c.text.length).toBeLessThanOrEqual(84);
      expect(c.end).toBeGreaterThan(c.start);
    }
    // Every word is kept, in order.
    expect(cues.map(c => c.text).join(' ')).toBe(text);
  });

  it('estimates timings over the audio duration when no alignment exists', () => {
    const cues = cuesFromText(text, 12);
    expect(cues[0].start).toBe(0);
    expect(cues[cues.length - 1].end).toBeCloseTo(12, 5);
  });

  it('writes valid SRT with two-line wrapping', () => {
    const srt = toSrt([{ start: 61.5, end: 64.25, text: 'Sultan Mehmed the Second arrived with the largest cannon ever seen.' }]);
    expect(srt).toBe('1\n00:01:01,500 --> 00:01:04,250\nSultan Mehmed the Second arrived\nwith the largest cannon ever seen.\n');
  });

  it('stores alignment next to the audio file', () => {
    expect(alignmentPathFor('./output/audio/human-odyssey-1.mp3')).toBe('./output/audio/human-odyssey-1.alignment.json');
  });
});
