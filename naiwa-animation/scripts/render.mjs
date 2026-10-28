import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {projectRoot, readJson} from './lib/config.mjs';
import {prepareEpisode} from './lib/episode.mjs';
import {finalizeVideo} from './lib/finalize-video.mjs';

let server;
let browser;
try {
  const {values} = parseArgs({options: {episode: {type: 'string'}}});
  const {id, episode, timeline, output, audioFile} = await prepareEpisode(values.episode);
  const settings = await readJson(path.join(projectRoot, 'config', 'render.json'));
  const presentation = await readJson(path.join(projectRoot, 'config', 'presentation.json'));
  const executablePath = process.env[settings.browserEnvironmentKey];
  if (!executablePath) throw new Error('请在 .env 设置 ' + settings.browserEnvironmentKey + '。');
  const runDirectory = path.join(projectRoot, 'output', '.renders', randomUUID());
  await mkdir(runDirectory, {recursive: true});
  server = await createServer({root: projectRoot, server: {port: 0}});
  await server.listen();
  const address = server.httpServer.address();
  if (typeof address === 'string' || !address) throw new Error('无法获得渲染服务器地址。');
  const browserEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !['DASHSCOPE_API_KEY', 'SFM_WORKSPACE_ID', 'ALIYUN_CREDENTIALS_FILE'].includes(key),
  ));
  browser = await chromium.launch({executablePath, headless: true, env: browserEnv});
  const page = await browser.newPage();
  page.setDefaultTimeout(settings.timeoutMs);
  await page.exposeFunction('reportRender', message => console.log(message));
  page.on('pageerror', error => console.error(error.message));
  await page.goto('http://127.0.0.1:' + address.port + '/');
  const visualName = 'render-' + path.basename(runDirectory);
  console.log('开始正式渲染：' + episode.output.width + '×' + episode.output.height + ' / ' + episode.output.fps + 'fps / ' + timeline.durationSeconds + 's');
  await page.evaluate(async ({id, episode, timeline, visualName, interval, presentation, fastStart}) => {
    const {default: project} = await import('/episodes/' + id + '/project.ts?project');
    const {Renderer, RendererResult, Vector2} = await import('/@id/@motion-canvas/core');
    await document.fonts.load('500 ' + presentation.bodySize + 'px "' + presentation.fontFamily + '"');
    await document.fonts.ready;
    project.name = visualName;
    const errors = [];
    project.logger.onLogged.subscribe(log => {
      if (log.level === 'error') {
        errors.push(log.message);
        window.reportRender('渲染错误：' + log.message + (log.stack ? '\n' + log.stack : ''));
      }
    });
    const renderer = new Renderer(project);
    let result;
    let reported = -Infinity;
    renderer.onFinished.subscribe(value => {result = value;});
    renderer.onFrameChanged.subscribe(frame => {
      const seconds = frame / episode.output.fps;
      if (seconds - reported >= interval) {
        reported = seconds;
        window.reportRender('正式渲染 ' + seconds.toFixed(1) + ' / ' + timeline.durationSeconds + ' 秒');
      }
    });
    await renderer.render({
      ...project.meta.getFullRenderingSettings(),
      name: visualName,
      size: new Vector2(episode.output.width, episode.output.height),
      // The native renderer includes its range's final frame.
      fps: episode.output.fps,
      range: [0, (Math.round(timeline.durationSeconds * episode.output.fps) - 1) / episode.output.fps],
      resolutionScale: episode.render.resolutionScale, colorSpace: episode.render.colorSpace,
      exporter: {name: '@motion-canvas/ffmpeg', options: {includeAudio: false, fastStart}},
    });
    if (result !== RendererResult.Success || errors.length) throw new Error('正式渲染未成功完成。');
  }, {
    id, episode, timeline, visualName, presentation, fastStart: settings.fastStart,
    interval: settings.progressIntervalSeconds,
  });
  const visualFile = path.join(projectRoot, 'output', visualName + '.mp4');
  const result = await finalizeVideo({episode, timeline, output, audioFile, visualFile, runDirectory});
  console.log('成片已完成：' + result.finalFile);
  console.log(JSON.stringify(result.metadata));
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server?.close();
}
