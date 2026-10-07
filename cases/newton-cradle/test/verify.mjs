// Headless self-check for Newton's cradle.
// Verifies physics constants and collision math are consistent,
// AND that SPEC values match what was confirmed in intake-questions.md.
import assert from 'node:assert';
import fs from 'node:fs';
import { SPEC } from '../src/spec.js';

console.log('verify: Newton cradle self-check');

// 0. Cross-check: SPEC values must match docs/intake-questions.md
const intake = fs.readFileSync(new URL('../docs/intake-questions.md', import.meta.url), 'utf8');

// Q1: "How many balls? | 5, classic"
const ballCountM = intake.match(/How many balls\?\s*\|\s*(\d+)/);
assert.ok(ballCountM, 'intake-questions.md: Q1 (how many balls) not found');
assert.strictEqual(SPEC.ballCount, parseInt(ballCountM[1], 10),
  `SPEC.ballCount=${SPEC.ballCount} but intake Q1 says "${ballCountM[1]}"`);

// Q5: "Restitution? | 0.97 (nearly elastic)"
const restM = intake.match(/Restitution\?\s*\|\s*([\d.]+)/);
assert.ok(restM, 'intake-questions.md: Q5 (restitution) not found');
assert.strictEqual(SPEC.restitution, parseFloat(restM[1]),
  `SPEC.restitution=${SPEC.restitution} but intake Q5 says "${restM[1]}"`);

// 1. Pendulum length and gravity are sane
assert.ok(SPEC.pendulumLength > 0.3 && SPEC.pendulumLength < 0.5,
  `pendulumLength ${SPEC.pendulumLength} out of expected range`);
assert.ok(Math.abs(SPEC.gravity - 9.81) < 0.01, 'gravity should be 9.81');

// 2. Restitution in valid range
assert.ok(SPEC.restitution > 0.9 && SPEC.restitution < 1.0,
  `restitution ${SPEC.restitution} should be near 1`);

// 3. Densities: steel ~7.5x plastic
const ratio = SPEC.densities.steel / SPEC.densities.plastic;
assert.ok(ratio > 7 && ratio < 8, `steel/plastic density ratio ${ratio} should be ~7.5`);

// 4. Ball count = 5
assert.strictEqual(SPEC.ballCount, 5, 'ballCount should be 5');

// 5. Collision math sanity: equal mass, equal speed opposite -> swap velocities
// m1=m2, v1=v, v2=-v -> after elastic: v1'=-v, v2'=v (velocity swap)
const e = SPEC.restitution;
const m1 = SPEC.densities.steel, m2 = SPEC.densities.steel;
const u1 = 1, u2 = -1;
const v1 = (m1*u1 + m2*u2 + m2*e*(u2-u1)) / (m1+m2);
const v2 = (m1*u1 + m2*u2 + m1*e*(u1-u2)) / (m1+m2);
// For equal mass + e=1: should swap exactly
assert.ok(Math.abs(v1 - (-1)) < 0.05 && Math.abs(v2 - 1) < 0.05,
  `equal-mass collision should swap velocities: got v1=${v1.toFixed(3)}, v2=${v2.toFixed(3)}`);

console.log('verify: PASS');
