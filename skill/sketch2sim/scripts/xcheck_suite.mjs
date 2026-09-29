// V2 regression suite: run the rigid reference solver and the Cannon-es build over the same
// design variants and require agreement within 5% on launch speed and angle. This is what moves
// audit-checklist item V2 from Unverified to Pass for the hinged-lever template.
//
// The variants below are the paper-trebuchet audit's proposed fixes (audit/paper-trebuchet-audit.md,
// "已验证的修改方案" A-D) plus the as-built geometry as a negative control.
//
// Requires: cannon-es (same as cannon_trebuchet.mjs).
// Usage: NODE_PATH=<dir-with-cannon-es>/node_modules node xcheck_suite.mjs <spec.json>
import fs from 'node:fs';
import { simulate } from './mech2d.mjs';
import { runCannon } from './cannon_trebuchet.mjs';

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

const variants = [
  { name: 'as-built (negative control)', cw: 0.68, mut: () => {} },
  { name: 'fix A: ball 0.03, pin 0.30, cw 0.68', cw: 0.68, mut: (s) => { s.mechanism.projectile.mass.value = 0.03; s.mechanism.counterweight.pin_local[0] = 0.30; s.mechanism.arm.x_max = 0.315; } },
  { name: 'fix B: ball 0.06, pin 0.40, cw 0.68', cw: 0.68, mut: (s) => { s.mechanism.projectile.mass.value = 0.06; s.mechanism.counterweight.pin_local[0] = 0.40; s.mechanism.arm.x_max = 0.415; } },
  { name: 'fix C: ball 0.02, cw 1.00', cw: 1.00, mut: (s) => { s.mechanism.projectile.mass.value = 0.02; } },
  { name: 'fix D: ball 0.10, pin 0.30, cw 1.00', cw: 1.00, mut: (s) => { s.mechanism.projectile.mass.value = 0.10; s.mechanism.counterweight.pin_local[0] = 0.30; s.mechanism.arm.x_max = 0.315; } },
];

let pass = 0, fail = 0;
for (const { name, cw, mut } of variants) {
  const s = clone(spec); mut(s);
  const p = { cw, pullDeg: 84.5 };
  const rig = simulate(s, p), can = runCannon(s, p);
  const d = (x, y) => Math.abs(x - y) / Math.abs(y) * 100;
  const bothNoRelease = !!(rig.error && can.error);
  const agree = bothNoRelease || (!rig.error && !can.error && d(can.speed, rig.speed) <= 5 && d(can.angle_deg, rig.angle_deg) <= 5);
  agree ? pass++ : fail++;
  console.log(`${agree ? 'PASS' : 'FAIL'} | ${name}`);
  console.log(`      rigid : ${rig.error ? 'NO RELEASE' : `v=${rig.speed.toFixed(3)} ang=${rig.angle_deg.toFixed(1)} land=${rig.land_x.toFixed(3)}`}`);
  console.log(`      cannon: ${can.error ? 'NO RELEASE' : `v=${can.speed.toFixed(3)} ang=${can.angle_deg.toFixed(1)} land=${can.land_x.toFixed(3)}`}${bothNoRelease ? '' : (rig.error || can.error) ? '' : `  (diff v=${d(can.speed, rig.speed).toFixed(2)}% ang=${d(can.angle_deg, rig.angle_deg).toFixed(2)}%)`}`);
}
console.log(`\nV2 suite: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
