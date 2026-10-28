import {parseArgs} from 'node:util';
import {prepareEpisode} from './lib/episode.mjs';

try {
  const {values} = parseArgs({options: {episode: {type: 'string'}}});
  const prepared = await prepareEpisode(values.episode);
  console.log('已绑定真实旁白时间戳：' + prepared.id);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
