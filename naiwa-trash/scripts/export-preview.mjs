import {cp, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';

if (!process.argv[2]) throw new Error('请指定预览导出目录。');
const project = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2]);
await mkdir(output, {recursive: true});
for (const file of ['preview.html', 'src/animator.js', 'src/laugh-preview.js', 'src/laugh-preview.css', 'config/defaults.json']) {
  await mkdir(resolve(output, file, '..'), {recursive: true});
  await cp(join(project, file), join(output, file));
}
await cp(join(project, 'public', 'pet'), join(output, 'pet'), {recursive: true});
console.log('预览已导出：' + join(output, 'preview.html'));
