import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import {projectRoot} from './lib/config.mjs';
import {prepareEpisode} from './lib/episode.mjs';
import {finalizeVideo} from './lib/finalize-video.mjs';

try {
  const {values} = parseArgs({options: {episode: {type: 'string'}, visual: {type: 'string'}}});
  if (!values.visual) throw new Error('请指定正式渲染完成的画面文件：--visual <file>。');
  const prepared = await prepareEpisode(values.episode);
  const runDirectory = path.join(projectRoot, 'output', '.renders', randomUUID());
  await mkdir(runDirectory, {recursive: true});
  const result = await finalizeVideo({
    ...prepared, runDirectory, visualFile: path.resolve(projectRoot, values.visual),
  });
  console.log('成片已完成：' + result.finalFile);
  console.log(JSON.stringify(result.metadata));
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
