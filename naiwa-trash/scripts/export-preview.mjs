import {cp, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';

if (!process.argv[2]) throw new Error('请指定预览导出目录。');
const project = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2]);
await mkdir(output, {recursive: true});
for (const file of ['preview.html', 'fart-preview.html', 'src/animator.js', 'src/gas-jet.js', 'src/laugh-preview.js', 'src/laugh-preview.css', 'src/fart-preview.js', 'src/fart-preview.css', 'src/fart-duration.js', 'config/defaults.json']) {
  await mkdir(resolve(output, file, '..'), {recursive: true});
  await cp(join(project, file), join(output, file));
}
await cp(join(project, 'public', 'pet'), join(output, 'pet'), {recursive: true});
console.log('预览已导出：' + join(output, 'preview.html'));
