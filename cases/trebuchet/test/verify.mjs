// Headless self-check for trebuchet — verifies physics constants are consistent.
import assert from 'node:assert';
import fs from 'node:fs';

const spec = JSON.parse(fs.readFileSync(new URL('../spec.json', import.meta.url), 'utf8'));

console.log('verify: trebuchet self-check');

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
