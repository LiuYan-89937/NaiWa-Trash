import {mkdir, mkdtemp, rename} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {
  loadCredentials, loadTtsConfig, narrationSchema,
  parseDocument, publicNarrationRoot, readJson,
} from './lib/config.mjs';
import {prepareSegment, writeJson} from './lib/artifacts.mjs';
import {assembleAudio, prepareMediaTools} from './lib/media.mjs';

async function main() {
  const {values} = parseArgs({
    options: {episode: {type: 'string'}, help: {type: 'boolean'}},
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log('npm run tts -- --episode episodes/<episode-id>/narration.json');
    console.log('从正式旁白清单生成 WAV、真实时间戳和每期 latest.json。不会自动重试。');
    return;
  }
  if (!values.episode) throw new Error('请通过 --episode 指定正式旁白清单。');
  const narration = parseDocument(
    narrationSchema,
    await readJson(path.resolve(values.episode)),
    '旁白清单',
  );
  const config = await loadTtsConfig(narration);
  const credentials = await loadCredentials();
  await prepareMediaTools(config.tools);
  const segments = [];
  let cursorSamples = 0;
  for (const segment of narration.segments) {
    const prepared = await prepareSegment(segment, config, credentials);
    const first = segments[0]?.audio;
    if (first && (
      prepared.audio.sampleRate !== first.sampleRate ||
      prepared.audio.channels !== first.channels
    )) {
      throw new Error('旁白分段的采样率或声道不一致；请统一本期配置。');
    }
    const pauseSamples = Math.round((segment.pauseAfterSeconds ?? 0) * prepared.audio.sampleRate);
    segments.push({...segment, ...prepared, pauseSamples, startSample: cursorSamples});
    cursorSamples += prepared.audio.sampleCount + pauseSamples;
    console.log('已准备旁白分段 ' + segment.id + '（' + (prepared.cached ? '缓存' : '新合成') + '）。');
  }

  const directory = path.join(publicNarrationRoot, narration.episodeId);
  await mkdir(directory, {recursive: true});
  const staging = await mkdtemp(path.join(directory, '.staging-'));
  const revision = randomUUID();
  const audioFile = path.join(staging, 'narration.wav');
  const audio = await assembleAudio(segments, audioFile, config.tools);
  if (audio.sampleCount !== cursorSamples) {
    throw new Error('合成后的采样数与分段清单不一致；本次结果尚未发布。');
  }
  const assetRoot = '/narration/' + narration.episodeId + '/' + revision;
  const timeline = {
    schemaVersion: 1,
    episodeId: narration.episodeId,
    audio: assetRoot + '/narration.wav',
    timing: assetRoot + '/timing.json',
    ...audio,
    timestampUnit: 'milliseconds',
    wordTimeOrigin: 'segment-audio-start',
    wordIndexScope: 'provider-sentence',
    provider: config.provider,
    model: config.model,
    voice: config.voice,
    segments: segments.map(segment => ({
      id: segment.id,
      text: segment.text,
      cacheKey: segment.key,
      audioSha256: segment.audioSha256,
      startSample: segment.startSample,
      startSeconds: segment.startSample / audio.sampleRate,
      durationSamples: segment.audio.sampleCount,
      durationSeconds: segment.audio.durationSeconds,
      pauseSamples: segment.pauseSamples,
      pauseAfterSeconds: segment.pauseSamples / audio.sampleRate,
      requestId: segment.synthesis.requestId,
      usage: segment.synthesis.usage,
      sentences: segment.synthesis.sentences,
    })),
  };
  await writeJson(path.join(staging, 'timing.json'), timeline);
  await rename(staging, path.join(directory, revision));
  const latest = {
    schemaVersion: 1,
    episodeId: narration.episodeId,
    revision,
    audio: timeline.audio,
    timing: timeline.timing,
    durationSeconds: audio.durationSeconds,
  };
  // Publish the pointer only after the complete audio/timing package is ready.
  await writeJson(path.join(directory, 'latest.json'), latest);
  console.log(JSON.stringify(latest, null, 2));
}

try {
  await main();
} catch (error) {
  const interrupted = error.name === 'TimeoutError' || error.name === 'AbortError';
  console.error(interrupted
    ? 'TTS 请求超时或中断，可能已经计费。请检查私有缓存，不会自动重试。'
    : error.message);
  process.exitCode = 1;
}
