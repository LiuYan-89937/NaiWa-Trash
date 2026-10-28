import {execFile} from 'node:child_process';
import {rename, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {promisify} from 'node:util';
import {projectRoot, readJson} from './config.mjs';

const execute = promisify(execFile);

/** Publish the requested media streams after assembly and metadata inspection. */
export async function finalizeVideo({episode, timeline, output, audioFile, visualFile, runDirectory}) {
  const settings = await readJson(path.join(projectRoot, 'config', 'render.json'));
  const masterFile = path.join(runDirectory, episode.render.filename + '.mp4');
  const mediaArguments = audioFile ? [
    '-i', visualFile, '-i', audioFile, '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy', '-c:a', settings.audioCodec, '-b:a', settings.audioBitrate,
    '-af', 'apad=whole_dur=' + timeline.durationSeconds,
  ] : ['-i', visualFile, '-map', '0:v:0', '-c:v', 'copy', '-an'];
  await execute(settings.ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-n',
    ...mediaArguments,
    '-t', String(timeline.durationSeconds),
    ...(settings.fastStart ? ['-movflags', '+faststart'] : []), masterFile,
  ]);
  const {stdout} = await execute(settings.ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate,nb_frames,duration',
    '-of', 'json', masterFile,
  ]);
  const metadata = JSON.parse(stdout);
  const video = metadata.streams.find(stream => stream.codec_type === 'video');
  const audio = metadata.streams.find(stream => stream.codec_type === 'audio');
  const [numerator, denominator] = video?.avg_frame_rate.split('/').map(Number) ?? [];
  if (!video || Boolean(audio) !== Boolean(audioFile) ||
      video.width !== Math.round(episode.output.width * episode.render.resolutionScale) ||
      video.height !== Math.round(episode.output.height * episode.render.resolutionScale) ||
      numerator / denominator !== episode.output.fps) {
    throw new Error('成片媒体参数不符合本期输出配置；保留中间产物，不发布。');
  }
  const finalFile = path.join(output, episode.render.filename + '.mp4');
  await writeFile(path.join(output, episode.render.filename + '.metadata.json'), JSON.stringify(metadata, null, 2) + '\n');
  await rename(visualFile, path.join(runDirectory, 'visual.mp4'));
  await rename(masterFile, finalFile);
  return {finalFile, metadata};
}
