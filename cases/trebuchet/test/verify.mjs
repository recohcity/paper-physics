// Headless self-check for trebuchet — verifies physics constants are consistent,
// AND that spec.json values match what was confirmed in intake-questions.md.
import assert from 'node:assert';
import fs from 'node:fs';
import { SPEC, MECH, GEOM, UI, derivedLeverRatio } from '../src/spec.js';
import { resolveParams } from '../src/physics.js';

console.log('verify: trebuchet self-check');

// 0. Cross-check: SPEC values must match docs/intake-questions.md
const intake = fs.readFileSync(new URL('../docs/intake-questions.md', import.meta.url), 'utf8');

// Q1: "Lever ratio? | 4:1 (short arm : long arm)"
const leverM = intake.match(/Lever ratio\?\s*\|\s*([\d.]+)\s*:/);
assert.ok(leverM, 'intake-questions.md: Q1 (lever ratio) not found');
assert.strictEqual(SPEC.physics.leverRatio, parseFloat(leverM[1]),
  `SPEC.physics.leverRatio=${SPEC.physics.leverRatio} but intake Q1 says "${leverM[1]}"`);

// Q2: "Counterweight range? | 1.4–10 kg (default 4.8)"
const cwM = intake.match(/Counterweight range\?\s*\|\s*([\d.]+)[–-]([\d.]+)\s*kg\s*\(default\s*([\d.]+)\)/);
assert.ok(cwM, 'intake-questions.md: Q2 (CW range) not found');
assert.strictEqual(SPEC.physics.counterweightKg.min, parseFloat(cwM[1]));
assert.strictEqual(SPEC.physics.counterweightKg.max, parseFloat(cwM[2]));
assert.strictEqual(SPEC.physics.counterweightKg.default, parseFloat(cwM[3]));

// Q3: "Ball weight range? | 0.30–0.60 kg (default 0.45)"
const ballM = intake.match(/Ball weight range\?\s*\|\s*([\d.]+)[–-]([\d.]+)\s*kg\s*\(default\s*([\d.]+)\)/);
assert.ok(ballM, 'intake-questions.md: Q3 (ball range) not found');
assert.strictEqual(SPEC.physics.ballKg.min, parseFloat(ballM[1]));
assert.strictEqual(SPEC.physics.ballKg.max, parseFloat(ballM[2]));
assert.strictEqual(SPEC.physics.ballKg.default, parseFloat(ballM[3]));

// Q4: "What does it hit? | 10-block pyramid [4,3,2,1], 0.30 kg each"
const blockM = intake.match(/(\d+)-block pyramid.*?([\d.]+)\s*kg each/);
assert.ok(blockM, 'intake-questions.md: Q4 (blocks) not found');
assert.strictEqual(SPEC.geometry.blockCount, parseInt(blockM[1], 10));
assert.strictEqual(SPEC.geometry.blockKg, parseFloat(blockM[2]));

// Q5: "Pull-back angle range? | 0–135° (default 0)"
const pullM = intake.match(/Pull-back angle range\?\s*\|\s*([\d.]+)[–-]([\d.]+)°/);
assert.ok(pullM, 'intake-questions.md: Q5 (pull angle) not found');
assert.strictEqual(SPEC.physics.pullbackDeg.min, parseFloat(pullM[1]));
assert.strictEqual(SPEC.physics.pullbackDeg.max, parseFloat(pullM[2]));

// Runtime checks: MECH/GEOM/UI must derive from SPEC, not hardcoded
assert.strictEqual(MECH.arm_x1, SPEC.physics.armLongX, 'MECH.arm_x1 must derive from SPEC');
assert.strictEqual(MECH.arm_x2, SPEC.physics.armShortX, 'MECH.arm_x2 must derive from SPEC');
assert.strictEqual(GEOM.REST_ANGLE, SPEC.physics.restAngle, 'GEOM.REST_ANGLE must derive from SPEC');
assert.strictEqual(UI.ball.min, SPEC.inputs[1].min, 'UI.ball.min must derive from SPEC');

// RUNTIME: resolveParams() must return values physics.js actually uses.
// Variant C: if someone hard-codes this.ballKg = 0.2 in the constructor, this fails.
const rt = resolveParams();
assert.strictEqual(rt.ballKgDefault, SPEC.physics.ballKg.default, 'runtime ballKgDefault must equal SPEC');
assert.strictEqual(rt.ballKgMin, SPEC.physics.ballKg.min, 'runtime ballKgMin must equal SPEC');
assert.strictEqual(rt.armLongX, SPEC.physics.armLongX, 'runtime armLongX must equal SPEC');
assert.strictEqual(rt.armShortX, SPEC.physics.armShortX, 'runtime armShortX must equal SPEC');
assert.strictEqual(rt.restAngle, SPEC.physics.restAngle, 'runtime restAngle must equal SPEC');

// 1. Gravity sane
assert.ok(Math.abs(SPEC.world.gravity - 9.82) < 0.01, 'gravity should be 9.82');

// 2. Lever ratio: derived from actual geometry, must match intake 4:1
assert.ok(Math.abs(derivedLeverRatio - SPEC.physics.leverRatio) < 0.05,
  `derived lever ratio ${derivedLeverRatio.toFixed(2)} != declared ${SPEC.physics.leverRatio}`);

// 3. Counterweight range: min 1.4 prevents inversion
assert.ok(SPEC.physics.counterweightKg.min >= 1.4, 'CW min must be >= 1.4 kg');

// 4. Ball mass range positive
assert.ok(SPEC.physics.ballKg.min > 0 && SPEC.physics.ballKg.max > SPEC.physics.ballKg.min,
  'ball mass range invalid');

// 5. Energy sanity: CW heavier than ball for meaningful launch
const ratio = SPEC.physics.counterweightKg.default / SPEC.physics.ballKg.default;
assert.ok(ratio > 5, `CW/ball ratio ${ratio} should be >5 for launch`);

console.log('verify: PASS');
