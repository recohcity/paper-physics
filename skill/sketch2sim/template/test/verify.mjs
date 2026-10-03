// Headless self-check, run with `node test/verify.mjs` before handoff.
// Replace the checks below with the project's domain-specific assertions (reference solver
// vs engine, energy non-injection, no clip, no inversion). Exit non-zero on any failure.
import assert from 'node:assert';

console.log('verify: placeholder — implement this project\'s checks.');

// Template example (pendulum / chain):
//   - engine and reference agree within tolerance
//   - rest state settles at the drawn position
//   - kinetic energy never exceeds input energy after settling
// assert.ok(energyDrift < 0.05, 'energy injected by solver');

console.log('verify: PASS (stub)');
