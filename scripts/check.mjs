import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readContent, root, sync } from './sync.mjs';
sync();
const data = readContent();
assert.equal(data.pages.length,8,'Keep eight scene configurations');
assert.equal(data.car.paths.length,8,'Keep eight car paths');
for (const entry of [...data.pages.map(p=>({src:p.background})),...data.gallery]) {
  assert(fs.existsSync(path.join(root,'public',entry.src)), 'Missing image: '+entry.src);
}
for (const script of ['app.js','foliage.js']) {
  assert.equal(fs.readFileSync(path.join(root,'src/scripts',script),'utf8'),fs.readFileSync(path.join(root,'public',script),'utf8'));
  execFileSync(process.execPath,['--check',path.join(root,'public',script)]);
}
for (const file of ['scripts/sync.mjs','public/content.js']) execFileSync(process.execPath,['--check',path.join(root,file)]);
const page=fs.readFileSync(path.join(root,'src/pages/index.astro'),'utf8');
for (const p of data.pages) assert(page.includes('id="'+p.id+'"'), 'Missing scene '+p.id);
assert(data.events.length<=40);
if (data.audio?.enabled) {
  assert(fs.existsSync(path.join(root,'public',data.audio.src)), 'Missing local audio file');
  assert(data.audio.volume >= 0 && data.audio.volume <= 1, 'Music volume must be 0 to 1');
}
console.log('Content, scene structure, local assets, script copies and JavaScript syntax verified.');

if (data.entrance?.enabled) {
  assert(fs.existsSync(path.join(root,'public',data.entrance.background)), 'Missing entrance artwork');
  for (const file of ['src/components/PalaceEntrance.astro','src/styles/entrance.css','src/styles/countdown.css']) assert(fs.existsSync(path.join(root,file)),file);
}
