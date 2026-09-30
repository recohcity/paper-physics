// Feasibility sweeps on the rigid reference model. Usage: node sweep_trebuchet.mjs <spec.json>
// The grids below track the CURRENT product slider ranges (counterweight 1.40-3.00 kg,
// ball 0.30-0.60 kg), NOT the first-audit values (cw 0.30-1.00, ball 0.20-0.02). A sweep is
// evidence only for the parameter range it actually covers; the pre-fix grids live in the
// audit history, not here. If the slider ranges change, re-run this sweep (pitfall #18).
import fs from 'node:fs';
import { simulate } from './mech2d.mjs';
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const row = (r) => r.error ? 'NO RELEASE (arm never reaches stop)' :
  `v=${r.speed.toFixed(2)} m/s  ang=${r.angle_deg.toFixed(1)}deg  landX=${r.land_x.toFixed(3)}  drift=${r.energy_drift_J.toExponential(1)}J`;

console.log('== A. Current counterweight range (ball 0.45 kg default) ==');
for (const cw of [1.40, 1.60, 2.00, 2.60, 3.00, 4.00]) for (const pull of [45, 84.5])
  console.log(`cw=${cw.toFixed(2)} pull=${pull}:`, row(simulate(spec, { cw, pullDeg: pull })));

console.log('\n== B. Current ball range x counterweight (pull 84.5) ==');
for (const mb of [0.30, 0.45, 0.60]) for (const cw of [1.40, 2.60, 4.00]) {
  const s = clone(spec); s.mechanism.projectile.mass.value = mb;
  console.log(`ball=${mb.toFixed(2)} cw=${cw.toFixed(2)}:`, row(simulate(s, { cw, pullDeg: 84.5 })));
}

console.log('\n== C. Low-counterweight boundary (ball 0.45; does release hold below 1.40?) ==');
for (const cw of [1.00, 1.20, 1.40]) {
  const s = clone(spec); s.mechanism.projectile.mass.value = 0.45;
  console.log(`cw=${cw.toFixed(2)} pull=84.5:`, row(simulate(s, { cw, pullDeg: 84.5 })));
}

console.log('\n== D. Release-timing sensitivity at current default (ball 0.45, cw 2.60, pull 84.5) ==');
for (const d of [0, 5, 10, 20]) console.log(`release ${d} deg before stop:`, row(simulate(spec, { cw: 2.60, pullDeg: 84.5, releaseDeg: d })));
