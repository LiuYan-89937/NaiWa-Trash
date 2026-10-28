import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const target = 'x86_64-pc-windows-msvc';
const project = resolve(import.meta.dirname, '..');
const tauri = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');

function run(command, args) {
  const result = spawnSync(command, args, {cwd: project, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform !== 'win32') {
  throw new Error('请在 Windows 环境运行此打包命令。');
}
run('rustup.exe', ['target', 'add', target]);
run(process.execPath, [tauri, 'build', '--target', target, '--bundles', 'nsis']);
console.log(`Windows x64 安装包目录：src-tauri/target/${target}/release/bundle/nsis`);
