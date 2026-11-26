import { Asset, Channel, VideoScript } from '../types/index.js';
import { mkdir, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { exec, spawn } from 'child_process';
import { VisualEffectsEngine, VisualEffect, ColorGrade, TransitionType } from './visual-effects-engine.js';
import { MusicManager } from './music-manager.js';
import { DynamicPacingEngine, ShotTiming, PacingContext } from './dynamic-pacing-engine.js';
import { ContentType, EmotionalTone, EnhancedSection, EnhancedVideoScript } from './script-generator.js';
import logger from '../utils/logger.js';
import path from 'path';

const execAsync = promisify(exec);

export interface ComposeOptions {
  channel?: Channel;
  shortVideoStrategy?: 'loop' | 'extend_last_frame';
  enableMusic?: boolean;
  musicPath?: string;
  enableSFX?: boolean;
  enableVisualEffects?: boolean;
  enableColorGrading?: boolean;
  musicVolume?: number;
  enhancedScript?: EnhancedVideoScript;
}

interface SegmentMeta {
  localPath: string;
  type: 'image' | 'video';
  targetDuration: number;
  mediaDuration: number;
  isShort: boolean;
  sourceFrames: number;
  effect?: VisualEffect;
  transition?: TransitionType;
  contentType?: ContentType;
  emotionalTone?: EmotionalTone;
  pacing?: ShotTiming;
}

export class VideoComposer {
  private outputDir: string;
  private visualEffects: VisualEffectsEngine;
  private musicManager: MusicManager;
  private pacingEngine: DynamicPacingEngine;

  constructor(outputDir: string = './output/videos') {
    this.outputDir = outputDir;
    this.visualEffects = new VisualEffectsEngine();
    this.musicManager = new MusicManager();
    this.pacingEngine = new DynamicPacingEngine();
  }

  async composeVideo(
    script: VideoScript,
    audioPath: string,
    assets: Asset[],
    outputFile: string,
    options: ComposeOptions = {}
  ): Promise<string> {
    await mkdir(this.outputDir, { recursive: true });
    const outputPath = `${this.outputDir}/${outputFile}`;
    const fps = 30;
    const width = 1920;
    const height = 1080;

    logger.info({ title: script.title, assetCount: assets.length }, 'Starting V2 video composition (segment-by-segment)');

    const usableAssets = assets.filter(a => !!a.localPath);
    if (usableAssets.length === 0) throw new Error('No usable assets with localPath');

    const audioDuration = await this.getAudioDurationStrict(audioPath);
    logger.info({ audioDuration: audioDuration.toFixed(2) }, 'Audio duration');

    const segments = await this.prepareSegments(usableAssets, options, audioDuration);

    // Extend last segment if total is shorter than audio
    const totalPlanned = segments.reduce((sum, s) => sum + s.targetDuration, 0);
    if (totalPlanned + 0.05 < audioDuration) {
      segments[segments.length - 1].targetDuration += audioDuration - totalPlanned;
    }

    const colorGrade: ColorGrade | null = (options.enableColorGrading && options.channel?.style?.theme)
      ? this.visualEffects.getColorGrade(options.channel.style.theme)
      : null;

    // Phase 1: render each segment to a temp .ts file
    const tempDir = `${this.outputDir}/tmp_${Date.now()}`;
    await mkdir(tempDir, { recursive: true });
    const tempFiles: string[] = [];

    logger.info({ count: segments.length }, 'Rendering segments');
    for (let i = 0; i < segments.length; i++) {
      const tempFile = `${tempDir}/seg_${String(i).padStart(4, '0')}.ts`;
      try {
        await this.renderSegment(segments[i], tempFile, options, colorGrade, width, height, fps);
      } catch (err) {
        logger.error({ i, localPath: segments[i].localPath, err }, 'Segment render error — using placeholder');
        try {
          await this.renderPlaceholder(segments[i].targetDuration, tempFile, width, height, fps);
        } catch (placeholderErr) {
          logger.error({ i, placeholderErr }, 'Placeholder also failed — skipping segment');
          continue; // skip this segment entirely
        }
      }
      tempFiles.push(tempFile);
      if ((i + 1) % 10 === 0 || i === segments.length - 1) {
        logger.info({ done: i + 1, total: segments.length }, 'Segments rendered');
      }
    }

    // Phase 2: write concat list
    const concatListPath = `${tempDir}/concat.txt`;
    await writeFile(
      concatListPath,
      tempFiles.map(f => `file '${path.basename(f)}'`).join('\n'),
      'utf-8'
    );

    // Phase 3: prepare audio
    const audioInputs = await this.prepareAudioInputs(audioPath, audioDuration, options);

    // Phase 4: final pass — concat segments + mix audio + overlays
    logger.info({ outputPath }, 'Final pass: concat + audio');
    await this.finalPass(concatListPath, audioInputs, audioDuration, outputPath, options);

    // Cleanup temp files
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    logger.info({ outputPath }, 'Video composition complete');
    return outputPath;
  }

  // Render a single segment to an MPEG-TS file
  private renderSegment(
    segment: SegmentMeta,
    outputFile: string,
    options: ComposeOptions,
    colorGrade: ColorGrade | null,
    width: number,
    height: number,
    fps: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const dur = segment.targetDuration;
      const fadeSeconds = Math.min(0.3, dur / 5);
      const fadeOutStart = Math.max(0, dur - fadeSeconds);
      const args: string[] = ['-hide_banner', '-loglevel', 'error'];

      if (segment.type === 'image') {
        args.push('-loop', '1', '-i', segment.localPath, '-t', dur.toFixed(3));

        const effectIntensity = segment.pacing
          ? DynamicPacingEngine.getEffectIntensity(segment.pacing.feel)
          : 0.5;
        const effectToApply = (options.enableVisualEffects && segment.effect) ? segment.effect : 'ken_burns_zoom_in';
        const effectFilter = this.visualEffects.generateImageEffectFilter(effectToApply, dur, width, height, fps, effectIntensity);

        // Prescale large images to max 3840px wide to avoid memory allocation failures with huge Pexels photos
        const prescale = `scale='min(iw,3840)':-2,setsar=1`;
        let vf = prescale + ',' + effectFilter + ',format=yuv420p';
        if (colorGrade && options.enableColorGrading) {
          vf += ',' + this.visualEffects.generateColorGradeFilter(colorGrade, 0.7);
        }
        vf += `,fade=t=in:st=0:d=${fadeSeconds.toFixed(3)},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSeconds.toFixed(3)}`;
        args.push('-vf', vf);
      } else {
        // Video segment — loop short clips via -stream_loop
        if (segment.isShort) {
          args.push('-stream_loop', '-1');
        }
        args.push('-i', segment.localPath, '-t', dur.toFixed(3));

        let vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p`;
        if (colorGrade && options.enableColorGrading) {
          vf += ',' + this.visualEffects.generateColorGradeFilter(colorGrade, 0.7);
        }
        vf += `,fade=t=in:st=0:d=${fadeSeconds.toFixed(3)},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSeconds.toFixed(3)}`;
        args.push('-vf', vf);
      }

      args.push(
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-r', String(fps),
        '-an', '-f', 'mpegts', '-y', outputFile
      );

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('close', (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(`code ${code}: ${stderr.slice(-400)}`));
      });
      proc.on('error', reject);
    });
  }

  // Black placeholder for failed segments
  private renderPlaceholder(duration: number, outputFile: string, width: number, height: number, fps: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}`,
        '-t', duration.toFixed(3),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p', '-an', '-f', 'mpegts', '-y', outputFile
      ];
      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      proc.on('close', (code: number | null) => code === 0 ? resolve() : reject(new Error(`Placeholder failed: ${code}`)));
      proc.on('error', reject);
    });
  }

  // Final FFmpeg pass: concat demuxer + audio + optional overlays
  private finalPass(
    concatListPath: string,
    audioInputs: { narration: string; music?: string },
    audioDuration: number,
    outputPath: string,
    options: ComposeOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = ['-hide_banner'];

      // Input 0: concatenated video (concat demuxer)
      args.push('-f', 'concat', '-safe', '0', '-i', concatListPath);
      // Input 1: narration audio
      args.push('-i', audioInputs.narration);
      const narrationIdx = 1;
      let musicIdx = -1;
      if (audioInputs.music) {
        args.push('-i', audioInputs.music);
        musicIdx = 2;
      }

      const channel = options.channel;
      const brand = channel?.branding;
      const hasOverlays = !!(brand?.overlay);
      const hasMusic = musicIdx >= 0 && !!options.enableMusic;

      const filters: string[] = [];

      // Video side
      if (hasOverlays) {
        const fontCandidates = [
          'C:/Windows/Fonts/arialbd.ttf',
          '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        ];
        const foundFont = fontCandidates.find(f => existsSync(f));
        const fontfile = foundFont
          ? `:fontfile='${foundFont.replace(/\\/g, '/').replace(':', '\\:')}'`
          : '';

        const stingText = brand!.stingText.replace('{ChannelName}', channel?.name || '');
        const softCtaText = brand!.softCtaText;
        const finalCtaText = brand!.finalCtaText;
        const ov = brand!.overlay!;
        const stingStart = ov.stingStartSeconds;
        const stingEnd = stingStart + ov.stingDurationSeconds;
        const ctaStart = ov.softCtaStartSeconds;
        const ctaEnd = ctaStart + ov.softCtaDurationSeconds;
        const finalCtaStart = Math.max(0, audioDuration - 10);
        const finalCtaEnd = audioDuration;

        const style = brand!.overlayStyle;
        const fontSize = Math.max(24, Math.min(72, style?.fontSize ?? 48));
        const fontColor = style?.fontColor ?? 'white';
        const boxColor = style?.boxColor ?? 'black';
        const boxOpacity = Math.max(0, Math.min(1, style?.boxOpacity ?? 0.45));
        const boxBorderW = Math.max(0, Math.min(40, style?.boxBorderW ?? 18));
        const drawCommon = `:x=(w-text_w)/2:y=h-(text_h*2.2):fontsize=${fontSize}:fontcolor=${fontColor}:box=1:boxcolor=${boxColor}@${boxOpacity}:boxborderw=${boxBorderW}`;

        filters.push(
          `[0:v]` +
          `drawtext=text='${this.escapeDrawtext(stingText)}'${fontfile}${drawCommon}:enable='between(t,${stingStart.toFixed(2)},${stingEnd.toFixed(2)})',` +
          `drawtext=text='${this.escapeDrawtext(softCtaText)}'${fontfile}${drawCommon}:enable='between(t,${ctaStart.toFixed(2)},${ctaEnd.toFixed(2)})',` +
          `drawtext=text='${this.escapeDrawtext(finalCtaText)}'${fontfile}${drawCommon}:enable='between(t,${finalCtaStart.toFixed(2)},${finalCtaEnd.toFixed(2)})'[outv]`
        );
        args.push('-map', '[outv]');
        args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p');
      } else {
        args.push('-map', '0:v');
        args.push('-c:v', 'copy');
      }

      // Audio side
      if (hasMusic) {
        const musicVolume = options.musicVolume ?? 0.15;
        filters.push(
          `[${narrationIdx}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[narr]`,
          `[${musicIdx}:a]aloop=loop=-1:size=2e+09,atrim=0:${audioDuration.toFixed(3)},volume=${musicVolume},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[musicbase]`,
          `[musicbase][narr]sidechaincompress=threshold=0.02:ratio=6:attack=50:release=300:level_sc=1[musicducked]`,
          `[narr][musicducked]amix=inputs=2:duration=first:dropout_transition=2,atrim=0:${audioDuration.toFixed(3)}[outa]`
        );
        args.push('-map', '[outa]');
      } else {
        filters.push(
          `[${narrationIdx}:a]atrim=0:${audioDuration.toFixed(3)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outa]`
        );
        args.push('-map', '[outa]');
      }

      if (filters.length > 0) {
        args.push('-filter_complex', filters.join(';'));
      }

      args.push(
        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
        '-t', audioDuration.toFixed(3),
        '-movflags', '+faststart',
        '-y', outputPath
      );

      logger.debug({ args: args.join(' ') }, 'Final pass FFmpeg command');

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        const m = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (m) {
          const t = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
          process.stdout.write(`\r  Final pass: ${(t / audioDuration * 100).toFixed(1)}% (${t.toFixed(0)}s / ${audioDuration.toFixed(0)}s)`);
        }
      });

      proc.on('close', (code: number | null) => {
        process.stdout.write('\n');
        if (code === 0) resolve();
        else {
          logger.error({ code, stderr: stderr.slice(-2000) }, 'Final pass failed');
          reject(new Error(`Final pass FFmpeg failed (code ${code})\n${stderr.slice(-1000)}`));
        }
      });
      proc.on('error', reject);
    });
  }

  private async prepareAudioInputs(
    narrationPath: string,
    audioDuration: number,
    options: ComposeOptions
  ): Promise<{ narration: string; music?: string }> {
    const result: { narration: string; music?: string } = { narration: narrationPath };

    if (options.enableMusic) {
      let musicPath = options.musicPath;
      if (!musicPath) {
        const theme = options.channel?.style?.theme || 'sci-fi';
        const track = await this.musicManager.selectTrack(theme, audioDuration);
        musicPath = track?.path;
      }
      if (musicPath && existsSync(musicPath)) {
        result.music = musicPath;
        logger.info({ musicPath }, 'Background music selected');
      }
    }

    return result;
  }

  private async prepareSegments(
    assets: Asset[],
    options: ComposeOptions,
    audioDuration: number
  ): Promise<SegmentMeta[]> {
    const fps = 30;
    const enhancedScript = options.enhancedScript;

    const segmentPromises = assets.map(async (asset, index) => {
      const localPath = asset.localPath as string;
      let mediaDuration = Infinity;
      let isShort = false;
      let sourceFrames = 1;

      if (asset.type === 'video') {
        mediaDuration = await this.getMediaDurationSeconds(localPath);
        const target = asset.duration || 6.5;
        isShort = !Number.isFinite(mediaDuration) || mediaDuration <= 0 || target > mediaDuration + 0.1;
        sourceFrames = Number.isFinite(mediaDuration) && mediaDuration > 0
          ? Math.max(1, Math.floor(mediaDuration * fps))
          : 1;
      }

      const section = enhancedScript?.sections[index] as EnhancedSection | undefined;
      let pacing: ShotTiming | undefined;
      let targetDuration = asset.duration || 6.5;

      if (section && enhancedScript) {
        const pacingContext: PacingContext = {
          contentType: section.contentType || 'exposition',
          emotionalTone: section.emotionalTone || 'curiosity',
          emotionalIntensity: this.getIntensityForSection(index, enhancedScript),
          act: section.act || 1,
          narrationDuration: section.duration || 60,
          isClimaxSection: index === enhancedScript.threeActStructure?.climaxSection,
          isMicroHook: section.isMicroHook || false
        };
        pacing = this.pacingEngine.calculateShotTiming(pacingContext);
        targetDuration = Math.min(pacing.duration, section.duration || 60);
      }

      let effect: VisualEffect = 'ken_burns_zoom_in';
      if (options.enableVisualEffects && section) {
        effect = this.visualEffects.selectEffect(section.contentType || 'exposition');
      }

      let transition: TransitionType = 'fade';
      if (pacing) {
        const map: Record<ShotTiming['feel'], TransitionType> = {
          rapid: 'wipe_left', quick: 'dissolve', moderate: 'fade',
          slow: 'dissolve', contemplative: 'dip_to_black'
        };
        transition = map[pacing.feel];
      }

      return {
        localPath, type: asset.type, targetDuration, mediaDuration,
        isShort, sourceFrames, effect, transition,
        contentType: section?.contentType, emotionalTone: section?.emotionalTone, pacing
      } as SegmentMeta;
    });

    return Promise.all(segmentPromises);
  }

  private getIntensityForSection(index: number, script: EnhancedVideoScript): number {
    const emotionalArc = script.emotionalArc || [];
    if (emotionalArc.length === 0) return 5;

    let timestamp = 0;
    for (let i = 0; i < index && i < script.sections.length; i++) {
      timestamp += script.sections[i].duration || 60;
    }

    let intensity = 5;
    for (let i = 0; i < emotionalArc.length - 1; i++) {
      if (emotionalArc[i].timestamp <= timestamp && emotionalArc[i + 1].timestamp >= timestamp) {
        const range = emotionalArc[i + 1].timestamp - emotionalArc[i].timestamp;
        if (range > 0) {
          const progress = (timestamp - emotionalArc[i].timestamp) / range;
          intensity = emotionalArc[i].intensity + (emotionalArc[i + 1].intensity - emotionalArc[i].intensity) * progress;
        }
        break;
      }
    }

    return intensity;
  }

  private async getAudioDurationStrict(audioPath: string): Promise<number> {
    const { stdout } = await execAsync(
      `ffprobe -i "${audioPath}" -show_entries format=duration -v quiet -of csv="p=0"`
    );
    const value = parseFloat(stdout.trim());
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Unable to determine audio duration: ${audioPath}`);
    }
    return value;
  }

  private async getMediaDurationSeconds(filePath: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`
      );
      const value = parseFloat(stdout.trim());
      return Number.isFinite(value) ? value : NaN;
    } catch {
      return NaN;
    }
  }

  private escapeDrawtext(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'")
      .replace(/\n/g, ' ');
  }
}
