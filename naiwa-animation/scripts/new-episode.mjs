import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {identifierSchema, parseDocument, projectRoot} from './lib/config.mjs';

try {
  const [requestedId, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('只接受一个 episode-id。');
  const id = parseDocument(identifierSchema, requestedId, 'episode-id');
  const target = path.join(projectRoot, 'episodes', id);
  await mkdir(target); // Refuses to overwrite an existing episode.
  await cp(path.join(projectRoot, 'templates', 'episode'), target, {recursive: true});
  const file = path.join(target, 'narration.json');
  const narration = JSON.parse(await readFile(file, 'utf8'));
  narration.episodeId = id;
  await writeFile(file, JSON.stringify(narration, null, 2) + '\n');
  const episodeFile = path.join(target, 'episode.json');
  const episode = JSON.parse(await readFile(episodeFile, 'utf8'));
  episode.id = id;
  episode.render.filename = id + '-' + episode.output.width + 'x' + episode.output.height + '-' + episode.output.fps + 'fps';
  await writeFile(episodeFile, JSON.stringify(episode, null, 2) + '\n');
  console.log('已创建 ' + target + '；请填写本期内容和正式旁白。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
