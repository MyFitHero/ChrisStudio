import { describe, it, expect } from 'vitest';
import { youtubeChannels, channelKeyFromVideoPath } from '../config/youtube-channels.js';
import { channels } from '../config/channels.js';
import { YouTubeUploader } from '../services/youtube-uploader.js';

describe('youtube channel mapping', () => {
  it('maps every ChrisStudio channel to a YouTube channel id', () => {
    expect(Object.keys(youtubeChannels).sort()).toEqual(Object.keys(channels).sort());
    for (const target of Object.values(youtubeChannels)) {
      expect(target.youtubeChannelId).toMatch(/^UC[\w-]{22}$/);
    }
  });

  it('infers the channel from output file names (Windows and POSIX paths)', () => {
    expect(channelKeyFromVideoPath('./output/videos/human-odyssey-1732700000000.mp4')).toBe('human-odyssey');
    expect(channelKeyFromVideoPath('C:\\out\\classified-files-1.mp4')).toBe('classified-files');
    expect(channelKeyFromVideoPath('what-if-42.mp4')).toBe('what-if');
    expect(channelKeyFromVideoPath('random.mp4')).toBeUndefined();
  });
});

describe('YouTubeUploader', () => {
  it('stores one login per channel', () => {
    const u = new YouTubeUploader({ channelKey: 'what-if', expectedChannelId: 'UCx' });
    expect(u.getTokensPath()).toBe('./secrets/youtube_tokens_what-if.json');
  });

  it('sends language, embedding, kids and AI disclosure explicitly', () => {
    const body = new YouTubeUploader().buildVideoResource(
      { title: 'T', description: 'D', tags: ['a'], category: '27', privacy: 'private' },
      { defaultLanguage: 'en', containsSyntheticMedia: true }
    );
    expect(body.snippet).toMatchObject({ categoryId: '27', defaultLanguage: 'en', defaultAudioLanguage: 'en' });
    expect(body.status).toMatchObject({
      privacyStatus: 'private',
      selfDeclaredMadeForKids: false,
      embeddable: true,
      containsSyntheticMedia: true
    });
  });
});
