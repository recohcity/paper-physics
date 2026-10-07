// Headless self-check for trebuchet — verifies physics constants are consistent,
// AND that spec.json values match what was confirmed in intake-questions.md.
import assert from 'node:assert';
import fs from 'node:fs';

const spec = JSON.parse(fs.readFileSync(new URL('../spec.json', import.meta.url), 'utf8'));

console.log('verify: trebuchet self-check');

// 0. Cross-check: spec.json values must match docs/intake-questions.md
const intake = fs.readFileSync(new URL('../docs/intake-questions.md', import.meta.url), 'utf8');

// Q1: "Lever ratio? | 4:1 (short arm : long arm)"
const leverM = intake.match(/Lever ratio\?\s*\|\s*([\d.]+)\s*:/);
assert.ok(leverM, 'intake-questions.md: Q1 (lever ratio) not found');
assert.strictEqual(spec.physics.leverRatio, parseFloat(leverM[1]),
  `spec leverRatio=${spec.physics.leverRatio} but intake Q1 says "${leverM[1]}"`);

// Q2: "Counterweight range? | 1.4–10 kg (default 4.8)"
const cwM = intake.match(/Counterweight range\?\s*\|\s*([\d.]+)[–-]([\d.]+)\s*kg\s*\(default\s*([\d.]+)\)/);
assert.ok(cwM, 'intake-questions.md: Q2 (CW range) not found');
assert.strictEqual(spec.physics.counterweightKg.min, parseFloat(cwM[1]));
assert.strictEqual(spec.physics.counterweightKg.max, parseFloat(cwM[2]));
assert.strictEqual(spec.physics.counterweightKg.default, parseFloat(cwM[3]));

// Q4: "What does it hit? | 3 wooden blocks, 0.14 kg each"
const blockM = intake.match(/(\d+)\s*wooden blocks,\s*([\d.]+)\s*kg each/);
assert.ok(blockM, 'intake-questions.md: Q4 (blocks) not found');
assert.strictEqual(spec.geometry.blockCount, parseInt(blockM[1], 10));
assert.strictEqual(spec.geometry.blockKg, parseFloat(blockM[2]));

// 1. Gravity sane
assert.ok(Math.abs(spec.world.gravity - 9.82) < 0.01, 'gravity should be 9.82');

// 2. Lever ratio 4:1
assert.strictEqual(spec.physics.leverRatio, 4.0, 'lever ratio must be 4:1');

// 3. Counterweight range: min 1.4 prevents inversion
assert.ok(spec.physics.counterweightKg.min >= 1.4, 'CW min must be >= 1.4 kg');

// 4. Ball mass range positive
assert.ok(spec.physics.ballKg.min > 0 && spec.physics.ballKg.max > spec.physics.ballKg.min,
  'ball mass range invalid');

// 5. Energy sanity: CW heavier than ball for meaningful launch
const ratio = spec.physics.counterweightKg.default / spec.physics.ballKg.default;
assert.ok(ratio > 10, `CW/ball ratio ${ratio} should be >10 for launch`);

console.log('verify: PASS');
