// Headless self-check for the base fixture.
import assert from 'node:assert';
import { SPEC } from '../src/spec.js';
import { Mechanism } from '../src/mechanism.js';

console.log('verify: base self-check');

assert.ok(SPEC.pendulumLength > 0.3 && SPEC.pendulumLength < 0.4, 'pendulumLength in range');
assert.ok(Math.abs(SPEC.gravity - 9.81) < 0.01, 'gravity ~ 9.81');
assert.ok(SPEC.restitution > 0.9 && SPEC.restitution < 1.0, 'restitution near 1');
assert.ok(SPEC.ballCount === 5, 'ballCount = 5');
assert.ok(SPEC.ballRadius > 0.02 && SPEC.ballRadius < 0.03, 'ballRadius in range');

const m = new Mechanism();
const p = m.probe();
assert.ok(p.restStateSettled === true, 'restStateSettled');
assert.ok(p.primaryVelocity > 0, 'primaryVelocity > 0');

console.log('verify: PASS');
