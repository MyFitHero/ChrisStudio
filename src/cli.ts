import './load-env.js';
import { ScriptGenerator } from './services/script-generator.js';
import { VoiceGeneratorFactory } from './services/voice-generator-factory.js';
import { VoiceGenerator } from './services/voice-generator.js';
import { FullVideoPipeline } from './workflows/full-video-pipeline.js';
import { channels } from './config/channels.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'full':
      // Full pipeline: script + audio + assets + video
      const fullChannelId = args[1] || 'what-if';
      const fullTopic = args.slice(2).join(' ') || 'What if AI became conscious tomorrow?';

      const fullChannel = channels[fullChannelId];
      if (!fullChannel) {
        console.error('❌ Unknown channel:', fullChannelId);
        console.error('Available channels:', Object.keys(channels).join(', '));
        process.exit(1);
      }

      console.log('\n🎬 Full Video Generation Pipeline');
      console.log('This will generate: Script → Audio → Assets → Video\n');

      const pipeline = new FullVideoPipeline();
      await pipeline.generateVideo(fullChannel, fullTopic);
      break;

    case 'generate':
      const channelId = args[1] || 'what-if';
      const topic = args.slice(2).join(' ') || 'What if humans could live forever?';

      console.log(`\n🎬 ChrisStudio`);
      console.log(`${'='.repeat(50)}\n`);
      console.log(`📺 Channel: ${channelId}`);
      console.log(`📝 Topic: ${topic}\n`);

      const channel = channels[channelId];
      if (!channel) {
        console.error('❌ Unknown channel:', channelId);
        console.error('Available channels:', Object.keys(channels).join(', '));
        process.exit(1);
      }

      // Generate script
      const scriptGen = new ScriptGenerator();
      console.log('📝 Generating script...');
      const script = await scriptGen.generateScript(channel, topic);
      console.log(`✅ Script generated: "${script.title}"`);
      console.log(`📊 Duration: ${script.duration}s (${Math.floor(script.duration / 60)}min ${script.duration % 60}s)`);
      console.log(`📄 Sections: ${script.sections.length}\n`);

      // Save script to file
      const fs = await import('fs/promises');
      const scriptPath = `./output/scripts/${channelId}-${Date.now()}.json`;
      await fs.mkdir('./output/scripts', { recursive: true });
      await fs.writeFile(scriptPath, JSON.stringify(script, null, 2));
      console.log(`💾 Script saved: ${scriptPath}\n`);

      // Generate voice using factory
      const voiceFactory = new VoiceGeneratorFactory();
      const fullNarration = `${script.hook} ${script.sections.map(s => s.narration).join(' ')} ${script.conclusion}`;
      console.log(`📊 Narration length: ${fullNarration.length} characters`);
      console.log(`🎙️ Voice provider: ${channel.voice.provider}\n`);

      const audioPath = await voiceFactory.generateAudio(
        fullNarration,
        channel.voice,
        `${channelId}-${Date.now()}.mp3`
      );

      console.log(`\n${'='.repeat(50)}`);
      console.log(`🎉 Generation complete!\n`);
      console.log(`📄 Script: ${scriptPath}`);
      console.log(`🎵 Audio: ${audioPath}`);
      console.log(`\nNext steps:`);
      console.log(`1. Download images/videos for visual sections`);
      console.log(`2. Run video composition with FFmpeg`);
      console.log(`3. Upload to YouTube\n`);
      break;

    case 'recompose':
      // Recompose from existing script/audio — skips regeneration, saves API cost
      // Usage: npm run recompose [channelId] [projectId] [topic]
      const recomposeChannelId = args[1] || 'what-if';
      const recomposeProjectId = args[2];
      const recomposeTopic = args.slice(3).filter(a => a !== '--new-images').join(' ') || recomposeProjectId;

      if (!recomposeProjectId) {
        console.error('❌ Missing projectId. Usage: npm run recompose [channelId] [projectId] [topic]');
        process.exit(1);
      }

      const recomposeChannel = channels[recomposeChannelId];
      if (!recomposeChannel) {
        console.error('❌ Unknown channel:', recomposeChannelId);
        process.exit(1);
      }

      console.log(`\n🎬 Recompose from existing script/audio`);
      console.log(`   Channel: ${recomposeChannelId}`);
      console.log(`   Project: ${recomposeProjectId}\n`);

      const recomposePipeline = new FullVideoPipeline();
      const recomposedPath = await recomposePipeline.regenerateAssetsAndRecompose(
        recomposeChannel,
        recomposeTopic,
        recomposeProjectId,
        { reuseExistingAssets: !args.includes('--new-images') }
      );
      console.log(`\n✅ Video ready: ${recomposedPath}\n`);
      break;

    case 'subtitles': {
      // Usage: npm run subtitles <projectId>   e.g. human-odyssey-1732700000000
      const projectId = args[1];
      const channelKey = projectId && Object.keys(channels).sort((a, b) => b.length - a.length).find(k => projectId.startsWith(`${k}-`));
      if (!projectId || !channelKey) {
        console.error('❌ Usage: npm run subtitles <projectId>   (file name of the video without .mp4)');
        process.exit(1);
      }
      const result = await new FullVideoPipeline().subtitlesForProject(channels[channelKey], projectId);
      console.log(`\n✅ EN: ${result.englishPath}${result.timed ? '' : ' (estimated timing: this video was made before timed voice)'}`);
      if (result.frenchPath) console.log(`✅ FR: ${result.frenchPath}`);
      break;
    }

    case 'voices':
      const voiceGen2 = new VoiceGenerator();
      await voiceGen2.listAvailableVoices();
      break;

    default:
      console.log('\n🎬 ChrisStudio CLI\n');
      console.log('Commands:');
      console.log('  npm run generate:full [channel] [topic]  - Full pipeline (script→audio→assets→video)');
      console.log('  npm run generate [channel] [topic]       - Generate script & audio only');
      console.log('  npm run voices                           - List available Edge TTS voices');
      console.log('  npm run test:tts                         - Test voice generation');
      console.log('  npm run test:assets                      - Test asset collection');
      console.log('  npm run test:video                       - Test video composition');
      console.log('\nChannels:');
      Object.entries(channels).forEach(([id, ch]) => {
        console.log(`  ${id.padEnd(20)} - ${ch.name} (${ch.voice.provider})`);
      });
      console.log('\nExamples:');
      console.log('  npm run generate:full what-if "What if AI became conscious tomorrow?"');
      console.log('  npm run generate what-if "What if gravity suddenly stopped?"\n');
  }
}

main().catch(console.error);
