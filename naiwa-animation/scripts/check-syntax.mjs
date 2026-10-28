/**
 * Parse source only. Adapted from the user's existing check_typescript.mjs.
 * Never imports application modules, typechecks, runs scenes, or calls TTS.
 */
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', 'generated', 'public', 'output', 'dist', 'private']);
const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (entry.name.startsWith('.') || excluded.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (/\.(?:[cm]?ts|tsx|[cm]?js|jsx|json)$/.test(entry.name)) files.push(file);
  }
}
await collect(root);
let errors = 0;
for (const file of files.sort()) {
  const source = await readFile(file, 'utf8');
  if (file.endsWith('.json')) {
    try {
      JSON.parse(source);
    } catch {
      console.error(path.relative(root, file) + ': invalid JSON syntax');
      errors++;
    }
  } else if (/\.(?:[cm]?js)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
    if (result.status !== 0) {
      console.error(result.stderr || result.error?.message || 'Node syntax check failed');
      errors++;
    }
  } else {
    const document = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const diagnostic of document.parseDiagnostics) {
      const position = document.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      console.error(
        path.relative(root, file) + ':' + (position.line + 1) + ':' + (position.character + 1) +
        ': ' + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
      errors++;
    }
  }
}
console.log(JSON.stringify({files: files.length, syntaxErrors: errors, scope: 'syntax only'}));
process.exitCode = errors ? 1 : 0;
