/**
 * Diagnose API keys without printing them: npm run check:keys
 */
import { existsSync, readFileSync } from 'fs';
import dotenv from 'dotenv';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { formatElevenLabsDetail } from './services/elevenlabs-voice-generator.js';

const systemEnv = { ...process.env };
const envPath = '.env';

type Status = 'OK' | 'WARN' | 'FAIL';
const report = (status: Status, name: string, detail: string) => {
  const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️ ' : '❌';
  console.log(`${icon} ${name.padEnd(20)} ${detail}`);
};

function describeShape(value: string): string {
  const visible = value.startsWith('sk-ant-') ? 'sk-ant-' : value.slice(0, 3);
  return `length ${value.length}, starts with "${visible}"`;
}

function shapeProblems(value: string): string[] {
  const problems: string[] = [];
  if (/^\s|\s$/.test(value)) problems.push('leading/trailing space');
  if (/^["']|["']$/.test(value)) problems.push('quotes around the key');
  if (/your_api_key_here|\.\.\./.test(value)) problems.push('placeholder text, not a real key');
  return problems;
}

async function main() {
  console.log('\n🔑 ChrisStudio key check (keys are never printed)\n');

  if (!existsSync(envPath)) {
    report('FAIL', '.env', `not found in ${process.cwd()}. Copy .env.example to .env.`);
    process.exit(1);
  }
  const raw = readFileSync(envPath, 'utf8');
  const fileVars = dotenv.parse(raw);

  const badLines = raw
    .split(/\r?\n/)
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line && !line.startsWith('#') && !/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line));
  for (const { line, n } of badLines) {
    report('WARN', `.env line ${n}`, `not a KEY=value line, ignored: "${line.slice(0, 25)}..."`);
  }

  for (const name of ['ANTHROPIC_API_KEY', 'KIE_API_KEY', 'FAL_KEY', 'ELEVENLABS_API_KEY']) {
    const fromFile = fileVars[name];
    const fromSystem = systemEnv[name];
    if (fromSystem && fromFile && fromSystem !== fromFile) {
      report('WARN', name, 'also set as a Windows/system variable with a DIFFERENT value. ChrisStudio now uses .env, but delete the system variable to avoid confusion.');
    }
    if (!fromFile) {
      if (name === 'ANTHROPIC_API_KEY' || name === 'ELEVENLABS_API_KEY') report('FAIL', name, 'missing from .env');
      continue;
    }
    const problems = shapeProblems(fromFile);
    report(problems.length ? 'FAIL' : 'OK', name, `${describeShape(fromFile)}${problems.length ? ` -> ${problems.join(', ')}` : ''}`);
  }

  const anthropicKey = fileVars.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    if (!anthropicKey.startsWith('sk-ant-')) {
      report('FAIL', 'Anthropic format', 'an Anthropic API key starts with "sk-ant-api03-". This looks like another kind of key.');
    }
    try {
      await new Anthropic({ apiKey: anthropicKey }).models.list({ limit: 1 });
      report('OK', 'Anthropic API', 'key accepted');
    } catch (error) {
      const status = (error as { status?: number }).status;
      report('FAIL', 'Anthropic API', status === 401
        ? 'key rejected (401). Create a new key at console.anthropic.com/settings/keys and paste it whole.'
        : `request failed: ${(error as Error).message}`);
    }
  }

  const elevenKey = fileVars.ELEVENLABS_API_KEY?.trim();
  if (elevenKey) {
    try {
      // Same call the pipeline makes (text-to-speech), on a 2-word text with the first channel voice.
      const voiceId = 'QIhD5ivPGEoYZQDocuHI';
      await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        { text: 'Key check.', model_id: fileVars.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2' },
        { headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' }, timeout: 30_000, responseType: 'arraybuffer' }
      );
      report('OK', 'ElevenLabs API', 'key accepted, text-to-speech works');
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: ArrayBuffer } }).response;
      const detail = response?.data ? formatElevenLabsDetail(Buffer.from(response.data).toString('utf8')) : '';
      report('FAIL', 'ElevenLabs API', response?.status
        ? `HTTP ${response.status}${detail ? ` - ${detail}` : ''}`
        : `request failed: ${(error as Error).message}`);
    }
  }

  console.log('');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
