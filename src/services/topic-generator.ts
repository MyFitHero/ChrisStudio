import { generateText, parseJsonResponse } from './claude-client.js';
import { Channel } from '../types/index.js';
import logger from '../utils/logger.js';

export interface TopicSuggestion {
  topic: string;
  angle: string;
  hooks: string[];
  searchPotential: number;
  viralScore: number;
}

export class TopicGenerator {
  async generateTopic(channel: Channel, previousTopics: string[] = []): Promise<string> {
    logger.info({ channelId: channel.id }, 'Generating automatic topic with Anthropic');

    const prompt = this.buildTopicPrompt(channel, previousTopics);

    try {
      const raw = await generateText({
        maxTokens: 4000,
        effort: 'low',
        system: [
          'You are an expert YouTube content strategist.',
          'Generate compelling topics optimized for retention and search.',
          'Reply only with the topic, without quotes or extra explanation.'
        ].join(' '),
        prompt
      });

      const topic = raw.split('\n')[0].replace(/^["'\s]+|["'\s]+$/g, '');
      if (!topic) {
        throw new Error('No topic generated');
      }

      logger.info({ channelId: channel.id, topic }, 'Topic generated successfully');
      return topic;
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Topic generation failed');
      return this.getFallbackTopic(channel);
    }
  }

  async generateTopicSuggestions(
    channel: Channel,
    count: number = 5,
    previousTopics: string[] = []
  ): Promise<TopicSuggestion[]> {
    logger.info({ channelId: channel.id, count }, 'Generating topic suggestions with Anthropic');

    const prompt = this.buildSuggestionsPrompt(channel, count, previousTopics);

    try {
      const content = await generateText({
        maxTokens: 8000,
        effort: 'medium',
        system: [
          'You are an expert YouTube content strategist.',
          'Generate topic suggestions with viral and SEO analysis.',
          'Reply only with valid JSON.'
        ].join(' '),
        prompt
      });

      const suggestions = parseJsonResponse<{ topics?: TopicSuggestion[] }>(content);
      return Array.isArray(suggestions.topics) ? suggestions.topics : [];
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Topic suggestions failed');
      return this.getFallbackSuggestions(channel, count);
    }
  }

  private buildTopicPrompt(channel: Channel, previousTopics: string[]): string {
    const avoid = previousTopics.length > 0
      ? `\n\nPREVIOUS TOPICS TO AVOID:\n${previousTopics.slice(-10).map(t => `- ${t}`).join('\n')}`
      : '';

    return `Generate ONE compelling YouTube documentary topic.

CHANNEL: "${channel.name}"
THEME: ${channel.style.theme}
DESCRIPTION: ${channel.description}
${avoid}

CRITERIA:
1. Intriguing and clickable.
2. Strong search potential.
3. High retention potential.
4. Aligned with the channel theme.
5. Original enough to feel fresh.
6. In English for an international audience.

Reply only with the topic.`;
  }

  private buildSuggestionsPrompt(
    channel: Channel,
    count: number,
    previousTopics: string[]
  ): string {
    const avoid = previousTopics.length > 0
      ? `\n\nPREVIOUS TOPICS TO AVOID:\n${previousTopics.slice(-20).map(t => `- ${t}`).join('\n')}`
      : '';

    return `Generate ${count} YouTube documentary topic suggestions.

CHANNEL: "${channel.name}"
THEME: ${channel.style.theme}
DESCRIPTION: ${channel.description}
${avoid}

For each suggestion, provide:
- topic: video title in English
- angle: unique editorial angle
- hooks: 3 possible hook lines
- searchPotential: score from 1 to 10
- viralScore: score from 1 to 10

Reply with exactly this JSON shape:
{
  "topics": [
    {
      "topic": "What if the Library of Alexandria Never Burned?",
      "angle": "Alternative history with scientific speculation",
      "hooks": ["Hook 1", "Hook 2", "Hook 3"],
      "searchPotential": 8,
      "viralScore": 7
    }
  ]
}`;
  }

  private getFallbackSuggestions(channel: Channel, count: number): TopicSuggestion[] {
    return Array.from({ length: Math.max(1, count) }, () => {
      const topic = this.getFallbackTopic(channel);
      return {
        topic,
        angle: 'Evergreen documentary angle',
        hooks: [
          'What happened next changed everything.',
          'The answer is stranger than it looks.',
          'This story still echoes today.'
        ],
        searchPotential: 6,
        viralScore: 6
      };
    });
  }

  private getFallbackTopic(channel: Channel): string {
    const fallbacks: Record<string, string[]> = {
      'what-if': [
        'What if humans could photosynthesize like plants?',
        'What if Earth had two moons?',
        'What if the internet suddenly disappeared?',
        'What if time travel was possible?',
        'What if humans could breathe underwater?'
      ],
      'human-odyssey': [
        'The Lost City That Changed History Forever',
        'Ancient Technology That Still Baffles Scientists',
        'The Mysterious Civilization That Vanished Overnight',
        'How Ancient Humans Survived the Ice Age',
        'The Discovery That Rewrote Human History'
      ],
      'classified-files': [
        'The Conspiracy Theory That Turned Out To Be True',
        'Declassified Documents Reveal Shocking Truth',
        'The Mystery Behind the Missing Flight',
        'Government Secrets Finally Exposed',
        'The Cover-Up That Lasted Decades'
      ]
    };

    const channelFallbacks = fallbacks[channel.id] || fallbacks['what-if'];
    const randomIndex = Math.floor(Math.random() * channelFallbacks.length);
    return channelFallbacks[randomIndex];
  }
}
