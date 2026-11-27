import { existsSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { CharacterAlignment, alignmentPathFor } from './elevenlabs-voice-generator.js';
import { generateText, parseJsonResponse } from './claude-client.js';
import logger from '../utils/logger.js';

export interface SubtitleCue {
  start: number; // seconds
  end: number;
  text: string;
}

const MAX_CUE_CHARS = 84; // two lines of ~42 characters
const MIN_CUE_CHARS = 25;
const MAX_CUE_SECONDS = 6;
const TRANSLATE_BATCH = 80;

/**
 * Split timed characters into readable cues: break at sentence ends once a cue has some length,
 * and always before a cue gets too long or too slow to read.
 */
export function cuesFromAlignment(alignment: CharacterAlignment): SubtitleCue[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  // Words with their timings.
  const words: Array<{ text: string; start: number; end: number }> = [];
  let current = '';
  let wordStart = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      if (current) words.push({ text: current, start: wordStart, end: ends[i - 1] });
      current = '';
      continue;
    }
    if (!current) wordStart = starts[i];
    current += ch;
  }
  if (current) words.push({ text: current, start: wordStart, end: ends[chars.length - 1] });

  return groupWords(words);
}

/** Fallback when no timings exist: spread the text over the audio duration by character count. */
export function cuesFromText(text: string, durationSeconds: number): SubtitleCue[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const totalChars = Math.max(1, tokens.reduce((n, t) => n + t.length + 1, 0));
  let cursor = 0;
  const words = tokens.map(t => {
    const start = (cursor / totalChars) * durationSeconds;
    cursor += t.length + 1;
    return { text: t, start, end: (cursor / totalChars) * durationSeconds };
  });
  return groupWords(words);
}

function groupWords(words: Array<{ text: string; start: number; end: number }>): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let buf: typeof words = [];
  const flush = () => {
    if (!buf.length) return;
    cues.push({ start: buf[0].start, end: buf[buf.length - 1].end, text: buf.map(w => w.text).join(' ') });
    buf = [];
  };

  for (const word of words) {
    const nextText = [...buf, word].map(w => w.text).join(' ');
    const nextDuration = buf.length ? word.end - buf[0].start : 0;
    if (buf.length && (nextText.length > MAX_CUE_CHARS || nextDuration > MAX_CUE_SECONDS)) flush();
    buf.push(word);
    const text = buf.map(w => w.text).join(' ');
    if (/[.!?…]["')\]]?$/.test(word.text) && text.length >= MIN_CUE_CHARS) flush();
  }
  flush();
  return cues;
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
}

/** Wrap to at most two balanced lines. */
function wrap(text: string): string {
  if (text.length <= 42) return text;
  const middle = Math.floor(text.length / 2);
  const left = text.lastIndexOf(' ', middle);
  const right = text.indexOf(' ', middle);
  const cut = left < 0 ? right : right < 0 ? left : middle - left <= right - middle ? left : right;
  return cut > 0 ? `${text.slice(0, cut)}\n${text.slice(cut + 1)}` : text;
}

export function toSrt(cues: SubtitleCue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(Math.max(c.end, c.start + 0.5))}\n${wrap(c.text)}\n`)
    .join('\n');
}

/** Translate cue texts to French, keeping one output line per cue (falls back to English per batch). */
export async function translateCues(cues: SubtitleCue[], context: string): Promise<SubtitleCue[]> {
  const out: SubtitleCue[] = [];
  for (let i = 0; i < cues.length; i += TRANSLATE_BATCH) {
    const batch = cues.slice(i, i + TRANSLATE_BATCH);
    let translated: string[] = [];
    try {
      const text = await generateText({
        effort: 'low',
        maxTokens: 16000,
        prompt: `Translate these English documentary subtitles into natural French (France).
Context: ${context}
Rules: one French line per input line, same order, same count (${batch.length}); keep proper names; keep it concise enough to read as a subtitle; no notes.
Respond with JSON only: {"fr": ["...", "..."]}

${JSON.stringify(batch.map(c => c.text))}`
      });
      const parsed = parseJsonResponse<{ fr?: unknown }>(text);
      if (Array.isArray(parsed.fr) && parsed.fr.length === batch.length) {
        translated = parsed.fr.map(x => String(x));
      } else {
        logger.warn({ batchStart: i }, 'Subtitle translation count mismatch, keeping English for this batch');
      }
    } catch (error) {
      logger.warn({ batchStart: i, error: (error as Error).message }, 'Subtitle translation failed, keeping English for this batch');
    }
    batch.forEach((c, k) => out.push({ ...c, text: translated[k] || c.text }));
  }
  return out;
}

export interface SubtitleResult {
  englishPath: string;
  frenchPath?: string;
  timed: boolean;
}

/** Number of French review subtitle files already produced for a channel. */
export async function countFrenchSubtitles(videosDir: string, channelKey: string): Promise<number> {
  const files = await readdir(videosDir).catch(() => [] as string[]);
  return files.filter(f => f.startsWith(`${channelKey}-`) && f.endsWith('.fr.srt')).length;
}

/**
 * Write <video>.en.srt and, if requested, <video>.fr.srt next to the video
 * (VLC and most players load them automatically).
 */
export async function generateSubtitles(options: {
  videoPath: string;
  audioPath: string;
  narrationText: string;
  audioDurationSeconds: number;
  french: boolean;
  context: string;
}): Promise<SubtitleResult> {
  const base = options.videoPath.replace(/\.mp4$/i, '');
  const alignmentPath = alignmentPathFor(options.audioPath);

  let cues: SubtitleCue[];
  let timed = false;
  if (existsSync(alignmentPath)) {
    cues = cuesFromAlignment(JSON.parse(await readFile(alignmentPath, 'utf-8')) as CharacterAlignment);
    timed = true;
  } else {
    cues = cuesFromText(options.narrationText, options.audioDurationSeconds);
  }

  const englishPath = `${base}.en.srt`;
  await writeFile(englishPath, toSrt(cues), 'utf-8');

  let frenchPath: string | undefined;
  if (options.french) {
    frenchPath = `${base}.fr.srt`;
    await writeFile(frenchPath, toSrt(await translateCues(cues, options.context)), 'utf-8');
  }

  logger.info({ englishPath, frenchPath, timed, cues: cues.length }, 'Subtitles written');
  return { englishPath, frenchPath, timed };
}

export function frenchSubtitleLimit(): number {
  const raw = Number(process.env.FRENCH_SUBTITLES_LIMIT ?? 10);
  return Number.isFinite(raw) ? raw : 10;
}

export function videosDirOf(videoPath: string): string {
  return path.dirname(videoPath);
}
