import {readFile, mkdir, copyFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
const project = resolve(import.meta.dirname, '..');
const source = resolve(project, '..', 'naiwa-animation', 'output');
const output = join(project, 'public', 'pet');
const assets = JSON.parse(await readFile(join(project, 'config', 'assets.json'), 'utf8'));
const clips = {};
for (const [version, ids] of assets.imports) {
  const directory = join(source, version);
  const manifest = JSON.parse(await readFile(join(directory, 'actions.json'), 'utf8'));
  for (const id of ids) {
    const action = manifest.actions.find(action => action.id === id);
    if (!action) throw new Error('缺少动作：' + id);
    const target = join(output, 'frames', id);
    await mkdir(target, {recursive: true});
    const frames = [];
    for (let i = 0; i < action.frames; i++) {
      const name = String(i).padStart(2, '0') + '.png';
      await copyFile(join(directory, 'frames', id, name), join(target, name));
      frames.push('frames/' + id + '/' + name);
    }
    const sequence = action.segments.flatMap(segment =>
      Array.from({length: segment.repeat ?? 1}, () => segment.frames.map((frame, index) =>
        ({frame, duration: (segment.durations?.[index] ?? segment.duration) * 1000})
      )).flat()
    );
    clips[id] = {label: action.label, frames, sequence,
      ...(action.registration ? {registration: action.registration} : {}),
      ...(assets.audio[id] ? {audio: assets.audio[id]} : {}),
    };
  }
}
const mouth = clips.mouth.frames;
clips.idle = {label: '待机', frames: mouth, sequence: [{frame: 0, duration: 1000}]};
clips['mouth-open'] = {label: '张嘴', frames: mouth,
  sequence: [0, 1, 2, 3].map(frame => ({frame, duration: 90}))};
clips['mouth-hold'] = {label: '等待投喂', frames: mouth,
  sequence: [3, 4].map(frame => ({frame, duration: 220}))};
clips['mouth-close'] = {label: '咀嚼吞咽', frames: mouth,
  sequence: [{frame: 5, duration: 160}, {frame: 6, duration: 220}, {frame: 7, duration: 160}]};
await writeFile(join(output, 'catalog.json'), JSON.stringify({
  width: 192, height: 208, clips,
  previews: ['jump', 'think', 'surprised', 'wave', 'blink', 'laugh', 'fart', 'mouth'],
  sources: ['https://github.com/yugh6/Naiwa'],
}, null, 2) + '\n');
await copyFile(join(source, 'naiwa-actions-v5', 'sources', 'reference-LICENCE'), join(output, 'reference-LICENCE'));
console.log('已汇入已认可的七组动作和新张嘴动作。');
