import {access, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {identifierSchema, parseDocument, projectRoot, readJson} from './config.mjs';
import {compileTimeline, serializeSrt} from './timeline.mjs';

const audioSchema = z.discriminatedUnion('mode', [
  z.strictObject({mode: z.literal('none')}),
  z.strictObject({mode: z.literal('narration'), master: z.string().min(1).optional()}),
  z.strictObject({mode: z.literal('file'), file: z.string().min(1)}),
]);
const timingSchema = z.discriminatedUnion('mode', [
  z.strictObject({mode: z.literal('narration')}),
  z.strictObject({mode: z.literal('authored'), file: z.string().min(1).optional()}),
]);
const intervalSchema = {
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
};
const authoredTimingSchema = z.strictObject({
  captions: z.array(z.strictObject({
    text: z.string().min(1).refine(text => !/[\r\n]/u.test(text)),
    ...intervalSchema,
  }).refine(caption => caption.end > caption.start)),
  chapters: z.array(z.strictObject({
    id: identifierSchema,
    ...intervalSchema,
    cues: z.record(z.string().min(1), z.number().finite().nonnegative()),
  }).refine(chapter => chapter.end > chapter.start)),
});

function publicAsset(id, reference, directory) {
  if (typeof reference !== 'string' || !reference.startsWith('/' + directory + '/' + id + '/') || reference.includes('..')) {
    throw new Error('公开资产必须位于本期 ' + directory + ' 目录。');
  }
  return path.join(projectRoot, 'public', reference.slice(1));
}

async function loadNarration(id) {
  const latest = await readJson(path.join(projectRoot, 'public', 'narration', id, 'latest.json'));
  return {latest, timing: await readJson(publicAsset(id, latest.timing, 'narration'))};
}

async function loadAuthoredTiming(directory, config, durationSeconds) {
  if (!config.file) return {captions: [], chapters: []};
  const file = path.resolve(directory, config.file);
  const relative = path.relative(directory, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(file) !== '.json') {
    throw new Error('编排时间文件必须是本期目录内的 JSON。');
  }
  const timing = parseDocument(authoredTimingSchema, await readJson(file), '编排时间');
  let captionEnd = 0;
  for (const caption of timing.captions) {
    if (caption.start < captionEnd || caption.end > durationSeconds) {
      throw new Error('字幕须按时间排序、互不重叠，并位于本期时长内。');
    }
    captionEnd = caption.end;
  }
  const ids = new Set();
  let chapterStart = -Infinity;
  for (const chapter of timing.chapters) {
    if (ids.has(chapter.id) || chapter.start < chapterStart || chapter.end > durationSeconds ||
        Object.values(chapter.cues).some(time => time < chapter.start || time >= chapter.end)) {
      throw new Error('时间索引须按起点排序、ID 唯一，cue 位于相应区间内。');
    }
    ids.add(chapter.id);
    chapterStart = chapter.start;
  }
  return timing;
}

async function prepareTimeline(id, episode, directory, presentation) {
  const durationSeconds = episode.output.targetSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('本期需要明确的正数时长。');
  }
  const audio = parseDocument(audioSchema, episode.audio ?? {mode: 'none'}, '音轨配置');
  const timingConfig = parseDocument(timingSchema, episode.timing ?? {
    mode: audio.mode === 'narration' ? 'narration' : 'authored',
  }, '时间来源');
  const captionsEnabled = episode.captions ?? false;
  if (typeof captionsEnabled !== 'boolean') throw new Error('captions 必须为布尔值。');
  const narration = audio.mode === 'narration' || timingConfig.mode === 'narration'
    ? await loadNarration(id) : null;
  let timeline;
  if (timingConfig.mode === 'narration') {
    const storyboard = await readJson(path.join(directory, 'storyboard.json'));
    timeline = compileTimeline(narration.timing, storyboard, presentation, durationSeconds);
  } else {
    const timing = await loadAuthoredTiming(directory, timingConfig, durationSeconds);
    timeline = {...timing, durationSeconds, audio: null};
  }
  if (captionsEnabled && !timeline.captions.length) {
    throw new Error('已选择字幕，但尚未提供真实语音时间或明确编排的字幕时间。');
  }
  if (!captionsEnabled) timeline.captions = [];
  const audioReference = audio.mode === 'narration' ? audio.master ?? narration.latest.audio
    : audio.mode === 'file' ? audio.file : null;
  const audioDirectory = audio.mode === 'narration' && !audio.master ? 'narration' : 'audio';
  const audioFile = audio.mode === 'none' ? null : publicAsset(id, audioReference, audioDirectory);
  if (audioFile) await access(audioFile);
  timeline.audio = audioReference;
  return {timeline, audioFile};
}

export async function prepareEpisode(requestedId) {
  const id = parseDocument(identifierSchema, requestedId, 'episode-id');
  const directory = path.join(projectRoot, 'episodes', id);
  const episode = await readJson(path.join(directory, 'episode.json'));
  if (episode.id !== id) throw new Error('本期配置 ID 与目录不一致。');
  const presentation = await readJson(path.join(projectRoot, 'config', 'presentation.json'));
  const render = await readJson(path.join(projectRoot, 'config', 'render.json'));
  const {timeline, audioFile} = await prepareTimeline(id, episode, directory, presentation);
  // Scene-facing timing is a public episode asset, separate from private caches.
  const assets = path.join(directory, 'assets');
  await mkdir(assets, {recursive: true});
  await writeFile(path.join(assets, 'timeline.json'), JSON.stringify(timeline, null, 2) + '\n');
  const output = path.join(projectRoot, 'output', id);
  await mkdir(output, {recursive: true});
  if (timeline.captions.length) {
    await writeFile(path.join(output, episode.render.filename + '.srt'), serializeSrt(timeline.captions));
  }
  await writeFile(path.join(directory, 'project.meta'), JSON.stringify({
    version: 1,
    shared: {background: presentation.colors.background, range: [0, timeline.durationSeconds], size: {x: episode.output.width, y: episode.output.height}, audioOffset: 0},
    preview: {fps: episode.output.fps, resolutionScale: episode.render.resolutionScale},
    rendering: {fps: episode.output.fps, resolutionScale: episode.render.resolutionScale, colorSpace: episode.render.colorSpace, exporter: {name: '@motion-canvas/ffmpeg', options: {includeAudio: false, fastStart: render.fastStart}}},
  }, null, 2) + '\n');
  return {id, episode, timeline, output, audioFile};
}
