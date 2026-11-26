import logger from '../utils/logger.js';

export type VisualEffect =
  | 'ken_burns_zoom_in'
  | 'ken_burns_zoom_out'
  | 'pan_left'
  | 'pan_right'
  | 'pan_up'
  | 'pan_down'
  | 'diagonal_pan'
  | 'slow_zoom'
  | 'drift'
  | 'static'
  | 'pulse'
  | 'vignette_zoom';

export type TransitionType =
  | 'fade'
  | 'dissolve'
  | 'dip_to_black'
  | 'wipe_left'
  | 'wipe_right'
  | 'zoom_in'
  | 'zoom_out'
  | 'blur_transition';

export type ColorGrade =
  | 'cinematic_blue_orange'
  | 'warm_vintage'
  | 'cold_desaturated'
  | 'high_contrast'
  | 'film_noir'
  | 'golden_hour'
  | 'mysterious_dark'
  | 'neutral';

export interface VisualEffectConfig {
  effect: VisualEffect;
  intensity?: number; // 0-1, default 0.5
  direction?: 'normal' | 'reverse';
}

export interface TransitionConfig {
  type: TransitionType;
  duration?: number; // seconds, default 0.5
}

export interface ColorGradeConfig {
  grade: ColorGrade;
  intensity?: number; // 0-1, default 0.7
}

// Map themes to appropriate color grades
const THEME_COLOR_GRADES: Record<string, ColorGrade> = {
  'sci-fi': 'cinematic_blue_orange',
  'historical': 'warm_vintage',
  'mysterious': 'mysterious_dark'
};

// Effects suitable for different content types
const CONTENT_EFFECTS: Record<string, VisualEffect[]> = {
  hook: ['ken_burns_zoom_in', 'slow_zoom', 'vignette_zoom'],
  reveal: ['ken_burns_zoom_in', 'slow_zoom', 'pulse'],
  exposition: ['pan_left', 'pan_right', 'drift', 'ken_burns_zoom_out'],
  action: ['diagonal_pan', 'ken_burns_zoom_in', 'pan_up'],
  conclusion: ['ken_burns_zoom_out', 'drift', 'static'],
  transition_moment: ['static', 'drift', 'slow_zoom'],
  generic: ['ken_burns_zoom_in', 'ken_burns_zoom_out', 'pan_left', 'pan_right', 'drift']
};

export class VisualEffectsEngine {
  private lastEffect: VisualEffect | null = null;
  private effectIndex = 0;

  /**
   * Select an appropriate visual effect based on content type
   */
  selectEffect(
    contentType: 'hook' | 'reveal' | 'exposition' | 'action' | 'conclusion' | 'transition_moment' | 'generic',
    seed?: number
  ): VisualEffect {
    const effects = CONTENT_EFFECTS[contentType] || [
      'ken_burns_zoom_in',
      'ken_burns_zoom_out',
      'pan_left',
      'pan_right',
      'drift'
    ];

    // Pick from effects that differ from lastEffect, avoiding infinite loop
    const available = effects.length > 1
      ? effects.filter(e => e !== this.lastEffect)
      : effects;

    const rng = seed !== undefined ? this.seededRandom(seed + this.effectIndex) : Math.random();
    const selectedEffect = available[Math.floor(rng * available.length)];

    this.lastEffect = selectedEffect;
    this.effectIndex++;

    return selectedEffect;
  }

  /**
   * Get color grade for a theme
   */
  getColorGrade(theme: 'sci-fi' | 'historical' | 'mysterious'): ColorGrade {
    return THEME_COLOR_GRADES[theme] || 'neutral';
  }

  /**
   * Generate FFmpeg filter for a visual effect on an image
   */
  generateImageEffectFilter(
    effect: VisualEffect,
    durationSeconds: number,
    width: number = 1920,
    height: number = 1080,
    fps: number = 30,
    intensity: number = 0.5
  ): string {
    // Fast Ken Burns:
    //   Zoom effects  → scale with eval=frame (t-variable in w/h) + centered crop  (~8 min/11min video)
    //   Pan  effects  → prescale to 130% + crop with t-variable in x/y              (fastest)
    // Both are 20-50x faster than zoompan.
    const dur = durationSeconds.toFixed(3);

    // 30% zoom room
    const sw30 = Math.round(width * 1.3);
    const sh30 = Math.round(height * 1.3);
    const ew30 = sw30 - width;  // 576 for 1080p
    const eh30 = sh30 - height; // 324 for 1080p

    // 15% zoom room (gentle)
    const sw15 = Math.round(width * 1.15);
    const sh15 = Math.round(height * 1.15);
    const ew15 = sw15 - width;
    const eh15 = sh15 - height;

    // 10% zoom room (very subtle)
    const sw10 = Math.round(width * 1.1);
    const sh10 = Math.round(height * 1.1);
    const ew10 = sw10 - width;
    const eh10 = sh10 - height;

    const prescale = (w: number, h: number) =>
      `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;

    // Zoom via scale eval=frame: scale dims grow/shrink per frame, crop from center
    const zoomIn = (sw: number, sh: number, ew: number, eh: number) =>
      `scale='${width}+${ew}*t/${dur}':'${height}+${eh}*t/${dur}':eval=frame,crop=${width}:${height}:'(iw-${width})/2':'(ih-${height})/2',setsar=1`;

    const zoomOut = (sw: number, sh: number, ew: number, eh: number) =>
      `scale='max(${width},${sw}-${ew}*t/${dur})':'max(${height},${sh}-${eh}*t/${dur})':eval=frame,crop=${width}:${height}:'max(0,(iw-${width})/2)':'max(0,(ih-${height})/2)',setsar=1`;

    switch (effect) {
      case 'ken_burns_zoom_in':
        return zoomIn(sw30, sh30, ew30, eh30);

      case 'ken_burns_zoom_out':
        return zoomOut(sw30, sh30, ew30, eh30);

      case 'slow_zoom':
        return zoomIn(sw10, sh10, ew10, eh10);

      case 'pan_left':
        return `${prescale(sw30, sh30)},crop=${width}:${height}:'${ew30}*(1-t/${dur})':'${Math.round(eh30 / 2)}',setsar=1`;

      case 'pan_right':
        return `${prescale(sw30, sh30)},crop=${width}:${height}:'${ew30}*t/${dur}':'${Math.round(eh30 / 2)}',setsar=1`;

      case 'pan_up':
        return `${prescale(sw30, sh30)},crop=${width}:${height}:'${Math.round(ew30 / 2)}':'${eh30}*(1-t/${dur})',setsar=1`;

      case 'pan_down':
        return `${prescale(sw30, sh30)},crop=${width}:${height}:'${Math.round(ew30 / 2)}':'${eh30}*t/${dur}',setsar=1`;

      case 'diagonal_pan':
        return `${prescale(sw30, sh30)},crop=${width}:${height}:'${ew30}*(1-t/${dur})':'${eh30}*(1-t/${dur})',setsar=1`;

      case 'drift': {
        const dx = Math.round(ew15 / 2);
        const dy = Math.round(eh15 / 2);
        return `${prescale(sw15, sh15)},crop=${width}:${height}:'${dx}+${dx}*sin(2*PI*t/${dur})':'${dy}+${dy}*cos(2*PI*t/${dur})',setsar=1`;
      }

      case 'vignette_zoom':
        return `${zoomIn(sw15, sh15, ew15, eh15).replace(',setsar=1', '')},setsar=1,vignette=PI/4`;

      case 'pulse':
        return `${prescale(sw10, sh10)},crop=${width}:${height}:'${Math.round(ew10 / 2)}+${Math.round(ew10 / 2)}*sin(PI*t/${dur})':'${Math.round(eh10 / 2)}+${Math.round(eh10 / 2)}*cos(PI*t/${dur})',setsar=1`;

      case 'static':
      default:
        return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    }
  }

  /**
   * Generate FFmpeg filter for a video clip
   */
  generateVideoEffectFilter(
    effect: VisualEffect,
    durationSeconds: number,
    width: number = 1920,
    height: number = 1080,
    intensity: number = 0.5
  ): string {
    // For videos, we use simpler effects to avoid complexity
    switch (effect) {
      case 'ken_burns_zoom_in':
      case 'slow_zoom': {
        const zoomAmount = 0.1 * intensity;
        return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='1+${zoomAmount}*on/25':d=1:s=${width}x${height}`;
      }

      case 'ken_burns_zoom_out': {
        const zoomAmount = 0.1 * intensity;
        return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='${1 + zoomAmount}-${zoomAmount}*on/25':d=1:s=${width}x${height}`;
      }

      default:
        // Most videos just need scaling
        return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
    }
  }

  /**
   * Generate FFmpeg filter for color grading
   */
  generateColorGradeFilter(grade: ColorGrade, intensity: number = 0.7): string {
    const i = intensity; // Shorthand

    switch (grade) {
      case 'cinematic_blue_orange':
        // Teal/orange look popular in sci-fi
        return `eq=saturation=${1 + 0.2 * i}:contrast=${1 + 0.1 * i},` +
          `colorbalance=rs=${-0.1 * i}:gs=${-0.05 * i}:bs=${0.15 * i}:rm=${0.1 * i}:gm=${0.02 * i}:bm=${-0.05 * i}:rh=${0.15 * i}:gh=${0.05 * i}:bh=${-0.1 * i}`;

      case 'warm_vintage':
        // Golden, warm tones for historical content
        return `eq=saturation=${0.9 + 0.1 * i}:contrast=${1 + 0.05 * i}:brightness=${0.02 * i},` +
          `colorbalance=rs=${0.1 * i}:gs=${0.05 * i}:bs=${-0.1 * i}:rm=${0.15 * i}:gm=${0.08 * i}:bm=${-0.05 * i},` +
          `curves=vintage`;

      case 'cold_desaturated':
        // Cold, muted look
        return `eq=saturation=${0.7 + 0.1 * i}:contrast=${1 + 0.15 * i},` +
          `colorbalance=rs=${-0.1 * i}:gs=${-0.05 * i}:bs=${0.1 * i}`;

      case 'high_contrast':
        return `eq=contrast=${1 + 0.3 * i}:saturation=${1 + 0.1 * i}`;

      case 'film_noir':
        // Dark, high contrast, desaturated
        return `eq=saturation=${0.3 + 0.2 * i}:contrast=${1 + 0.4 * i}:brightness=${-0.05 * i},` +
          `vignette=PI/3`;

      case 'golden_hour':
        // Warm golden light
        return `eq=saturation=${1 + 0.15 * i}:brightness=${0.03 * i},` +
          `colorbalance=rs=${0.2 * i}:gs=${0.1 * i}:bs=${-0.15 * i}:rm=${0.15 * i}:gm=${0.1 * i}:bm=${-0.1 * i}`;

      case 'mysterious_dark':
        // Dark, slightly blue, mysterious
        return `eq=saturation=${0.85 + 0.1 * i}:contrast=${1 + 0.2 * i}:brightness=${-0.08 * i},` +
          `colorbalance=rs=${-0.05 * i}:gs=${-0.02 * i}:bs=${0.1 * i},` +
          `vignette=PI/4`;

      case 'neutral':
      default:
        return 'null'; // No color grading
    }
  }

  /**
   * Generate FFmpeg transition filter between two clips
   */
  generateTransitionFilter(
    transition: TransitionType,
    duration: number = 0.5,
    clipALabel: string,
    clipBLabel: string,
    outputLabel: string
  ): string {
    const frames = Math.ceil(duration * 30); // Assuming 30fps

    switch (transition) {
      case 'dissolve':
      case 'fade':
        return `[${clipALabel}][${clipBLabel}]xfade=transition=fade:duration=${duration}:offset=0[${outputLabel}]`;

      case 'dip_to_black':
        return `[${clipALabel}][${clipBLabel}]xfade=transition=fadeblack:duration=${duration}:offset=0[${outputLabel}]`;

      case 'wipe_left':
        return `[${clipALabel}][${clipBLabel}]xfade=transition=wipeleft:duration=${duration}:offset=0[${outputLabel}]`;

      case 'wipe_right':
        return `[${clipALabel}][${clipBLabel}]xfade=transition=wiperight:duration=${duration}:offset=0[${outputLabel}]`;

      case 'zoom_in':
        return `[${clipALabel}][${clipBLabel}]xfade=transition=zoomin:duration=${duration}:offset=0[${outputLabel}]`;

      case 'zoom_out':
        return `[${clipALabel}][${clipBLabel}]xfade=transition=squeezeh:duration=${duration}:offset=0[${outputLabel}]`;

      case 'blur_transition':
        // Blur out then in (approximation with fadeblack)
        return `[${clipALabel}][${clipBLabel}]xfade=transition=fadeblack:duration=${duration}:offset=0[${outputLabel}]`;

      default:
        return `[${clipALabel}][${clipBLabel}]xfade=transition=fade:duration=${duration}:offset=0[${outputLabel}]`;
    }
  }

  /**
   * Select appropriate transition based on content change
   */
  selectTransition(
    fromContent: 'hook' | 'section' | 'reveal' | 'conclusion',
    toContent: 'hook' | 'section' | 'reveal' | 'conclusion'
  ): TransitionType {
    // Dramatic transitions for reveals
    if (toContent === 'reveal') {
      return Math.random() > 0.5 ? 'dip_to_black' : 'zoom_in';
    }

    // Smooth transitions for sections
    if (fromContent === 'section' && toContent === 'section') {
      const options: TransitionType[] = ['dissolve', 'fade', 'wipe_left'];
      return options[Math.floor(Math.random() * options.length)];
    }

    // Conclusion gets special treatment
    if (toContent === 'conclusion') {
      return 'dip_to_black';
    }

    return 'fade';
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}
