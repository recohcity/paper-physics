// Feasibility sweeps on the rigid reference model. Usage: node sweep_trebuchet.mjs <spec.json>
import fs from 'node:fs';
import { simulate, fitted } from './mech2d.mjs';
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const row = (r) => r.error ? 'NO RELEASE (arm never reaches stop)' :
  `v=${r.speed.toFixed(2)} m/s  ang=${r.angle_deg.toFixed(1)}deg  landX=${r.land_x.toFixed(3)}  drift=${r.energy_drift_J.toExponential(1)}J`;

console.log('== A. As-built masses (arm rho=160 assumed, ball 0.20 kg, code geometry) ==');
for (const cw of [0.30, 0.48, 0.68, 1.00]) for (const pull of [45, 84.5])
  console.log(`cw=${cw.toFixed(2)} pull=${pull}:`, row(simulate(spec, { cw, pullDeg: pull })));

console.log('\n== B. Best case for the design: massless arm+cup (rho~0), ball 0.20 kg ==');
const s0 = clone(spec); s0.mechanism.arm.density.value = 0.001;
for (const cw of [0.68, 1.00]) console.log(`cw=${cw} pull=84.5:`, row(simulate(s0, { cw, pullDeg: 84.5 })));

console.log('\n== C. What ball mass lets cw=0.68 reach the fitted ~3.6 m/s? (as-built arm) ==');
for (const mb of [0.20, 0.10, 0.06, 0.04, 0.03, 0.02]) {
  const s = clone(spec); s.mechanism.projectile.mass.value = mb;
  console.log(`ball=${mb.toFixed(2)} kg pull=84.5:`, row(simulate(s, { cw: 0.68, pullDeg: 84.5 })));
}

console.log('\n== D. Release timing sensitivity (ball 0.03 kg, cw 0.68, pull 84.5) ==');
const sd = clone(spec); sd.mechanism.projectile.mass.value = 0.03;
for (const d of [0, 5, 10, 20]) console.log(`release ${d} deg before stop:`, row(simulate(sd, { cw: 0.68, pullDeg: 84.5, releaseDeg: d })));

console.log('\n== E. Fitted formula for comparison (same flight model) ==');
for (const cw of [0.30, 0.68, 1.00]) { const f = fitted(spec, { cw, pullDeg: 45 }); console.log(`cw=${cw} pull=45: v=${f.speed.toFixed(2)} ang=32 landX=${f.land_x.toFixed(3)}`); }
