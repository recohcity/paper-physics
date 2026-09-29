// Find parameter changes that make the rigid model hit the target front (default: pyramid rows).
// Target window is derived from the Spec: [center_x - (rows[0]/2)*block.size, center_x + (rows[0]/2)*block.size].
// Falls back to [0.75, 1.05] when the Spec has no target geometry. Grid scans pin offset x ball mass x cw.
import fs from 'node:fs';
import { simulate } from './mech2d.mjs';
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const t = spec.target;
let lo = 0.75, hi = 1.05; // fallback
if (t && Array.isArray(t.rows) && t.rows[0] && t.block && Number.isFinite(t.center_x)) {
  const half = (t.rows[0] / 2) * t.block.size;
  lo = t.center_x - half;
  hi = t.center_x + half;
}
const hits = [];
for (const a of [0.185, 0.25, 0.30, 0.35, 0.40])
  for (const mb of [0.20, 0.10, 0.06, 0.04, 0.03, 0.02])
    for (const cw of [0.68, 1.00]) {
      const s = clone(spec);
      s.mechanism.counterweight.pin_local[0] = a;
      s.mechanism.arm.x_max = a + 0.015;
      s.mechanism.projectile.mass.value = mb;
      const r = simulate(s, { cw, pullDeg: 84.5 });
      if (!r.error && r.land_x > lo && r.land_x < hi) hits.push({ pin_a: a, ball_kg: mb, cw_kg: cw, v: +r.speed.toFixed(2), ang: +r.angle_deg.toFixed(1), land_x: +r.land_x.toFixed(3) });
    }
console.log(`target window: [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
console.log(hits.length ? hits : 'no hits in grid');
