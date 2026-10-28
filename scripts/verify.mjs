import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readContent, root } from './sync.mjs';
const source = fs.readFileSync(root + '/src/scripts/app.js', 'utf8').replaceAll('\r\n', '\n');
const data = readContent();
const extract = (name) => {
  const match = source.match(new RegExp('  function ' + name + '\\([^]*?\\n  }\\n'));
  assert(match, 'Missing function ' + name);
  return match[0];
};
let now = Date.parse('2027-01-01T00:00:00Z');
class Clock extends Date { static now() { return now; } }
const nodes = Object.fromEntries(['days','hours','minutes','seconds','days-label'].map(id => ['#' + id, { textContent: '' }]));
const context = { Date: Clock, w: data, $: (id) => nodes[id] };
vm.createContext(context);
vm.runInContext(extract('smoothScrollStep') + extract('countdownParts') + extract('tick'), context);

const finish = [];
for (const refreshRate of [30, 60, 120]) {
  let position = 0, velocity = 0;
  for (let frame = 0; frame < refreshRate; frame++) {
    const step = context.smoothScrollStep(position, velocity, 1000, 1000 / refreshRate, data.car.smoothingMs);
    assert(step.position >= position && step.position <= 1000, 'Car must approach without overshooting');
    assert(Number.isFinite(step.velocity));
    position = step.position; velocity = step.velocity;
  }
  finish.push(position);
}
assert(Math.max(...finish) - Math.min(...finish) < 0.00001, 'Smoothing must not depend on display refresh rate');
const largeStep = context.smoothScrollStep(500, 10000, 100, 50, data.car.smoothingMs);
assert(Number.isFinite(largeStep.position) && Number.isFinite(largeStep.velocity), 'Direction changes remain stable');

const originalDate = data.date;
for (const [seconds, expected, label] of [
  [172800, [2,0,0,0], 'Days'], [86400, [1,0,0,0], 'Day'],
  [86399, [0,23,59,59], 'Days'], [3600, [0,1,0,0], 'Days'],
  [0, [0,0,0,0], 'Days'], [-1, [0,0,0,0], 'Days'],
]) {
  data.date = new Date(now + seconds * 1000).toISOString();
  assert.deepEqual(Array.from(context.countdownParts(data.date, now)), expected);
  context.tick();
  assert.equal(nodes['#days-label'].textContent, label);
  assert.equal(nodes['#hours'].textContent, String(expected[1]).padStart(2, '0'));
}
assert.deepEqual(Array.from(context.countdownParts('invalid date', now)), [0,0,0,0]);
data.date = originalDate;
assert.equal(data.car.arrivalEnterMs, 2000);
assert.equal(data.car.arrivalDriveMs, 4000);
assert.equal(data.botanicals.motionScale, 1.1);
assert(data.events.every(event => event.name === event.name.toUpperCase()));
assert(data.pages.every(page => page.subtitle !== page.subtitle.toUpperCase()));
console.log('Verified refresh-independent car smoothing, day/hour boundaries, singular Day, expired dates and preserved arrival timing.');
