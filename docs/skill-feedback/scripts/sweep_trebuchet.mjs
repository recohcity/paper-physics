// Feasibility sweeps on the rigid reference model. Usage: node sweep_trebuchet.mjs <spec.json>
// The grids are READ FROM THE SPEC (mechanism.counterweight.mass_range/default_mass and the
// counterweight_kg / ball_kg inputs), so a slider-range change re-runs the sweep over the new
// range without editing this file (pitfall #18: validation coverage expires when ranges change).
// The first-audit grids (cw 0.30-1.00, ball 0.20-0.02) live in the audit history, not here.
import fs from 'node:fs';
import { simulate } from './mech2d.mjs';
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const row = (r) => r.error ? 'NO RELEASE (arm never reaches stop)' :
  `v=${r.speed.toFixed(2)} m/s  ang=${r.angle_deg.toFixed(1)}deg  landX=${r.land_x.toFixed(3)}  drift=${r.energy_drift_J.toExponential(1)}J`;

// ---- Grids derived from the Spec ----
const cwMin = spec.mechanism.counterweight.mass_range[0];
const cwMax = spec.mechanism.counterweight.mass_range[1];
const cwDefault = spec.mechanism.counterweight.default_mass;
const ballMin = spec.inputs.find((i) => i.id === 'ball_kg').range[0];
const ballMax = spec.inputs.find((i) => i.id === 'ball_kg').range[1];
const ballDefault = spec.inputs.find((i) => i.id === 'ball_kg').default;
const maxPull = spec.inputs.find((i) => i.id === 'pull_deg').range[1];
const cwMid = (cwMin + cwMax) / 2;

// Counterweight sweep points: min, min+0.2, mid, default, max (unique, ascending)
const cwPoints = [...new Set([cwMin, cwMin + 0.2, cwMid, cwDefault, cwMax].map((x) => +x.toFixed(2)))].sort((a, b) => a - b);

console.log(`Spec-derived grid: cw [${cwMin}-${cwMax}] default ${cwDefault}, ball [${ballMin}-${ballMax}] default ${ballDefault}, max pull ${maxPull}deg`);

console.log(`\n== A. Counterweight range x pull (ball ${ballDefault} kg default) ==`);
for (const cw of cwPoints) for (const pull of [45, maxPull])
  console.log(`cw=${cw.toFixed(2)} pull=${pull}:`, row(simulate(spec, { cw, pullDeg: pull })));

console.log(`\n== B. Ball range x counterweight (pull ${maxPull}) ==`);
const cw3 = [...new Set([cwMin, cwDefault, cwMax])];
for (const mb of [ballMin, ballDefault, ballMax]) for (const cw of cw3) {
  const s = clone(spec); s.mechanism.projectile.mass.value = mb;
  console.log(`ball=${mb.toFixed(2)} cw=${cw.toFixed(2)}:`, row(simulate(s, { cw, pullDeg: maxPull })));
}

console.log(`\n== C. Low-counterweight boundary (ball ${ballDefault}; does release hold below ${cwMin}?) ==`);
for (const cw of [cwMin - 0.4, cwMin - 0.2, cwMin]) {
  if (cw < 0.4) continue;
  const s = clone(spec); s.mechanism.projectile.mass.value = ballDefault;
  console.log(`cw=${cw.toFixed(2)} pull=${maxPull}:`, row(simulate(s, { cw, pullDeg: maxPull })));
}

console.log(`\n== D. Release-timing sensitivity at default (ball ${ballDefault}, cw ${cwDefault}, pull ${maxPull}) ==`);
for (const d of [0, 5, 10, 20]) console.log(`release ${d} deg before stop:`, row(simulate(spec, { cw: cwDefault, pullDeg: maxPull, releaseDeg: d })));
