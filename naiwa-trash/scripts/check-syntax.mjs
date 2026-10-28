import {readdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
async function files(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.filter(entry => !['node_modules','target','gen','.git','dist'].includes(entry.name))
    .map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
const paths = await files(root);
for (const path of paths.filter(path => /\.(m?js)$/.test(path))) {
  const result = spawnSync(process.execPath, ['--check', path], {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
}
for (const path of paths.filter(path => path.endsWith('.json'))) JSON.parse(await readFile(path, 'utf8'));
for (const path of paths.filter(path => path.endsWith('.rs'))) {
  const result = spawnSync('rustfmt', ['--edition', '2021', '--emit', 'stdout', path],
    {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
}
console.log('JavaScript、JSON、Rust 语法解析完成。未执行类型检查、应用或文件操作。');
