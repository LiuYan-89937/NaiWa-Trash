import {appendFileSync, closeSync, openSync} from 'node:fs';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {z} from 'zod';
import {cacheRoot, parseDocument, readJson} from './config.mjs';
import {synthesisSchema, synthesize} from './aliyun-tts.mjs';
import {inspectAudio} from './media.mjs';

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function writeJson(file, document) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(document, null, 2) + '\n', {mode: 0o600});
  await rename(temporary, file);
}

const stateBase = {
  schemaVersion: z.literal(1),
  key: z.string(),
  updatedAt: z.string(),
};
const stateSchema = z.discriminatedUnion('status', [
  z.strictObject({...stateBase, status: z.literal('pending')}),
  z.strictObject({...stateBase, status: z.literal('failed'), error: z.string()}),
  z.strictObject({
    ...stateBase, status: z.literal('complete'),
    audioSha256: z.string(), synthesis: synthesisSchema,
  }),
]);

/**
 * Reserving a directory is atomic, including across processes. Incomplete
 * reservations remain visible and cannot silently cause another billed request.
 */
export async function prepareSegment(segment, config, credentials) {
  const request = {
    schemaVersion: 1,
    provider: config.provider,
    endpoint: config.endpointTemplate.replace('{workspaceId}', credentials.workspaceId),
    model: config.model,
    voice: config.voice,
    input: {text: segment.text, ...config.input},
  };
  const key = digest(JSON.stringify(request));
  const directory = path.join(cacheRoot, key);
  const audioFile = path.join(directory, 'audio.wav');
  const stateFile = path.join(directory, 'state.json');
  await mkdir(cacheRoot, {recursive: true, mode: 0o700});
  let cached = false;
  try {
    await mkdir(directory, {mode: 0o700});
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    cached = true;
  }

  let synthesis;
  let audioSha256;
  if (cached) {
    const state = parseDocument(stateSchema, await readJson(stateFile), '缓存状态');
    if (state.key !== key || state.status !== 'complete') {
      throw new Error(
        '旁白缓存未完成：' + directory +
        '。请先审阅 state.json 和 events.ndjson；确认后将该目录移出缓存再显式重试。',
      );
    }
    const bytes = await readFile(audioFile);
    if (digest(bytes) !== state.audioSha256) throw new Error('缓存音频与记录不一致：' + directory + '。');
    synthesis = state.synthesis;
    audioSha256 = state.audioSha256;
  } else {
    await writeJson(stateFile, {
      schemaVersion: 1, key, status: 'pending', updatedAt: new Date().toISOString(),
    });
    // Contains the narration/request settings, never authentication headers.
    await writeJson(path.join(directory, 'request.json'), request);
    const log = openSync(path.join(directory, 'events.ndjson'), 'wx', 0o600);
    try {
      const result = await synthesize({
        text: segment.text, config, credentials,
        recordEvent: event => appendFileSync(log, JSON.stringify(event) + '\n'),
      });
      await writeFile(audioFile, result.audio, {flag: 'wx', mode: 0o600});
      const audio = await inspectAudio(audioFile, config.tools);
      validateTiming(result.synthesis, audio);
      synthesis = result.synthesis;
      audioSha256 = digest(result.audio);
      await writeJson(stateFile, {
        schemaVersion: 1, key, status: 'complete', audioSha256, synthesis,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      await writeJson(stateFile, {
        schemaVersion: 1, key, status: 'failed', error: error.name ?? 'Error',
        updatedAt: new Date().toISOString(),
      });
      throw error;
    } finally {
      closeSync(log);
    }
  }
  const audio = await inspectAudio(audioFile, config.tools);
  validateTiming(synthesis, audio);
  return {key, audioFile, audioSha256, synthesis, audio, cached};
}

function validateTiming(synthesis, audio) {
  const words = synthesis.sentences.flatMap(sentence => sentence.words);
  if (!words.length) throw new Error('旁白缺少字级时间戳。');
  // Provider timestamps have millisecond precision; audio has sample precision.
  const durationMs = Math.ceil(audio.durationSeconds * 1000);
  if (words.some(word => word.end_time > durationMs)) {
    throw new Error('服务时间戳超出了实际音频时长；不会自动截断或估算。');
  }
}
