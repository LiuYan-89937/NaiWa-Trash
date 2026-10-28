import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {z} from 'zod';
import {parseDocument} from './config.mjs';

const execute = promisify(execFile);
const probeSchema = z.object({
  streams: z.array(z.object({
    sample_rate: z.coerce.number().int().positive(),
    channels: z.number().int().positive(),
    duration: z.coerce.number().positive(),
  })).length(1),
});

export async function prepareMediaTools(tools) {
  for (const executable of [tools.ffprobe, tools.ffmpeg]) {
    try {
      await execute(executable, ['-version']);
    } catch {
      throw new Error('无法使用音频工具：' + executable + '。请先检查 config/tts.json 中的工具路径。');
    }
  }
}

export async function inspectAudio(file, tools) {
  const {stdout} = await execute(tools.ffprobe, [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,duration',
    '-of', 'json', file,
  ]);
  let document;
  try {
    document = JSON.parse(stdout);
  } catch {
    throw new Error('ffprobe 返回了无效 JSON。');
  }
  const audio = parseDocument(probeSchema, document, '音频元数据').streams[0];
  const sampleCount = Math.round(audio.duration * audio.sample_rate);
  if (sampleCount <= 0) throw new Error('音频没有可用采样。');
  return {
    sampleRate: audio.sample_rate,
    channels: audio.channels,
    sampleCount,
    durationSeconds: sampleCount / audio.sample_rate,
  };
}

/** Concatenate complete narration units with explicit, sample-accurate pauses. */
export async function assembleAudio(segments, output, tools) {
  const first = segments[0].audio;
  const filters = [];
  const labels = [];
  const argumentsList = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n'];
  for (const [index, segment] of segments.entries()) {
    if (segment.audio.sampleRate !== first.sampleRate || segment.audio.channels !== first.channels) {
      throw new Error('旁白分段的采样率或声道不一致；请统一本期配置。');
    }
    argumentsList.push('-i', segment.audioFile);
    filters.push('[' + index + ':a]apad=pad_len=' + segment.pauseSamples + '[s' + index + ']');
    labels.push('[s' + index + ']');
  }
  filters.push(labels.join('') + 'concat=n=' + segments.length + ':v=0:a=1[out]');
  argumentsList.push(
    '-filter_complex', filters.join(';'), '-map', '[out]',
    '-c:a', tools.audioCodec, '-ar', String(first.sampleRate),
    '-ac', String(first.channels), output,
  );
  await execute(tools.ffmpeg, argumentsList);
  return inspectAudio(output, tools);
}
