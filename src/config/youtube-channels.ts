/**
 * Mapping ChrisStudio channel id -> YouTube channel. Kept separate from channels.ts on purpose
 * (channels.ts drives content generation; this file only drives publishing).
 */
export interface YouTubeChannelTarget {
  /** YouTube channel ID (UC...). The OAuth login for this slot must authorize exactly this channel. */
  youtubeChannelId: string;
  handle: string;
  /** YouTube category: 27 = Education, 24 = Entertainment. */
  categoryId: string;
}

export const youtubeChannels: Record<string, YouTubeChannelTarget> = {
  'what-if': { youtubeChannelId: 'UCg5KvEQBZ90dsk5O0lXlqeg', handle: '@WhatIfScienceDoc', categoryId: '27' },
  'human-odyssey': { youtubeChannelId: 'UCWzrIQhDt6IKyVHroDoRWGw', handle: '@HumanOdysseyDoc', categoryId: '27' },
  'classified-files': { youtubeChannelId: 'UCp3fqxkp3kgFJu33gpdcUtA', handle: '@ClassifiedFilesDoc', categoryId: '24' }
};

/** Infer the ChrisStudio channel from an output file name like "human-odyssey-1732700000000.mp4". */
export function channelKeyFromVideoPath(videoPath: string): string | undefined {
  const file = videoPath.replace(/\\/g, '/').split('/').pop() || '';
  return Object.keys(youtubeChannels)
    .sort((a, b) => b.length - a.length)
    .find(key => file.startsWith(`${key}-`));
}
