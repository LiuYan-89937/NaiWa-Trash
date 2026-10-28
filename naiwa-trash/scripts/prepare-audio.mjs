import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const project = resolve(import.meta.dirname, '..');
const path = join(project, 'config', 'assets.json');
const assets = JSON.parse(await readFile(path, 'utf8'));
for (const audio of Object.values(assets.audio)) {
  if (!audio.trim) continue;
  const input = join(project, 'public', 'pet', audio.original_source);
  const output = join(project, 'public', 'pet', audio.source);
  const filter = `atrim=start=${audio.trim.start_seconds}:end=${audio.trim.end_seconds},asetpts=PTS-STARTPTS`;
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-af', filter, '-c:a', 'pcm_s16le', output], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'json', output], {encoding: 'utf8'});
  if (probe.status !== 0) throw new Error(probe.stderr || probe.error?.message);
  audio.duration_seconds = Number(JSON.parse(probe.stdout).format.duration);
}
await writeFile(path, JSON.stringify(assets, null, 2) + '\n');
console.log('音频制作完成，保留原文件，播放版本已移除首尾静音。');
