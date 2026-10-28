import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function readContent() {
  const source = fs.readFileSync(path.join(root, 'src/data/content.ts'), 'utf8');
  const match = source.match(/export const content\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error('content.ts must export const content = { ... };');
  return JSON.parse(match[1]);
}
function writeIfChanged(file, value) {
  const target = path.join(root, file);
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== value) fs.writeFileSync(target, value);
}
export function sync() {
  const content = readContent();
  writeIfChanged('public/content.js', '/** Generated from src/data/content.ts. Override before loading using window.PATRIKA_CONTENT. */\nwindow.WEDDING = window.PATRIKA_CONTENT || ' + JSON.stringify(content, null, 2) + ';\n');
  for (const name of ['app.js', 'foliage.js']) {
    writeIfChanged('public/' + name, fs.readFileSync(path.join(root, 'src/scripts', name), 'utf8'));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) sync();
