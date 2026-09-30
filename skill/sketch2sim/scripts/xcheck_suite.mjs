// V2 regression suite: run the rigid reference solver and the Cannon-es build over the same
// design variants and require agreement within 5% on launch speed and angle. This is what moves
// audit-checklist item V2 from Unverified to Pass for the rigid_linkage (hinged-lever) build.
//
// Two variant families, reported separately:
//  - audit-fix regression: the original audit's as-built negative control + proposed fixes A-D
//    (kept as regression history; proves engine/reference agreement across the audited space).
//  - product-range: variants are GENERATED FROM THE SPEC (counterweight_kg / ball_kg inputs and
//    counterweight mass_range/default_mass), so a slider-range change is picked up automatically —
//    re-run this suite after any range change; old PASSes do not carry over (physics-pitfalls.md #18).
//    KNOWN DIFFERENCE at the expanded range (cw up to 10.0): with strong driver torque and a light
//    ball (cw >= 4.8, ball 0.30-0.45), the Cannon-es release angle runs ~1.9-2.0 deg lower than the
//    reference (~29.3 vs 31.2 deg, i.e. 5-6% relative) while speed and land_x stay within 5% — a
//    HingeConstraint release-timing offset under strong torque, not a release bug. Raised solver
//    iterations 50->100 / tolerance 1e-7->1e-8 did NOT converge it, so the 5% gate deliberately
//    reports these variants as FAIL rather than masking them with a looser criterion; treat the
//    product-range angle as carrying ~2 deg engine bias in the heavy-counterweight corner.
//
// Requires: cannon-es (same as cannon_trebuchet.mjs).
// Usage: NODE_PATH=<dir-with-cannon-es>/node_modules node xcheck_suite.mjs <spec.json>
import fs from 'node:fs';
import { simulate } from './mech2d.mjs';
import { runCannon } from './cannon_trebuchet.mjs';

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

const auditFixVariants = [
  { name: 'as-built (negative control)', cw: 0.68, mut: () => {} },
  { name: 'fix A: ball 0.03, pin 0.30, cw 0.68', cw: 0.68, mut: (s) => { s.mechanism.projectile.mass.value = 0.03; s.mechanism.counterweight.pin_local[0] = 0.30; s.mechanism.arm.x_max = 0.315; } },
  { name: 'fix B: ball 0.06, pin 0.40, cw 0.68', cw: 0.68, mut: (s) => { s.mechanism.projectile.mass.value = 0.06; s.mechanism.counterweight.pin_local[0] = 0.40; s.mechanism.arm.x_max = 0.415; } },
  { name: 'fix C: ball 0.02, cw 1.00', cw: 1.00, mut: (s) => { s.mechanism.projectile.mass.value = 0.02; } },
  { name: 'fix D: ball 0.10, pin 0.30, cw 1.00', cw: 1.00, mut: (s) => { s.mechanism.projectile.mass.value = 0.10; s.mechanism.counterweight.pin_local[0] = 0.30; s.mechanism.arm.x_max = 0.315; } },
];

// ---- Product-range variants generated from the Spec ----
const cwMin = spec.mechanism.counterweight.mass_range[0];
const cwMax = spec.mechanism.counterweight.mass_range[1];
const cwDefault = spec.mechanism.counterweight.default_mass;
const ballMin = spec.inputs.find((i) => i.id === 'ball_kg').range[0];
const ballMax = spec.inputs.find((i) => i.id === 'ball_kg').range[1];
const ballDefault = spec.inputs.find((i) => i.id === 'ball_kg').default;

const productRangeVariants = [
  { name: `prod default: ball ${ballDefault}, cw ${cwDefault}`, cw: cwDefault, mut: (s) => { s.mechanism.projectile.mass.value = ballDefault; } },
  { name: `prod light cw: ball ${ballDefault}, cw ${cwMin}`, cw: cwMin, mut: (s) => { s.mechanism.projectile.mass.value = ballDefault; } },
  { name: `prod heavy cw: ball ${ballDefault}, cw ${cwMax}`, cw: cwMax, mut: (s) => { s.mechanism.projectile.mass.value = ballDefault; } },
  { name: `prod light ball: ball ${ballMin}, cw ${cwDefault}`, cw: cwDefault, mut: (s) => { s.mechanism.projectile.mass.value = ballMin; } },
  { name: `prod heavy ball: ball ${ballMax}, cw ${cwDefault}`, cw: cwDefault, mut: (s) => { s.mechanism.projectile.mass.value = ballMax; } },
  { name: `prod corner: ball ${ballMax}, cw ${cwMin}`, cw: cwMin, mut: (s) => { s.mechanism.projectile.mass.value = ballMax; } },
  { name: `prod max cw: ball ${ballDefault}, cw ${cwMax}`, cw: cwMax, mut: (s) => { s.mechanism.projectile.mass.value = ballDefault; } },
  { name: `prod max both: ball ${ballMax}, cw ${cwMax}`, cw: cwMax, mut: (s) => { s.mechanism.projectile.mass.value = ballMax; } },
];

function runSuite(label, variants) {
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
  console.log(`${label}: ${pass} pass / ${fail} fail`);
  return fail;
}

let fails = runSuite('\nV2 suite (audit-fix regression)', auditFixVariants);
fails += runSuite('\nV2 suite (product range)', productRangeVariants);
process.exit(fails ? 1 : 0);
