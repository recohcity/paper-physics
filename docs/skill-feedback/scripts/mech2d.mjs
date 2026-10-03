// Reference (analytic) solution for a hinged lever with a hanging counterweight.
// Lagrangian 2-DOF: theta = arm angle, phi = counterweight pendulum angle from down-vertical.
// Purpose: ground truth to cross-check engine builds and to audit fitted formulas.
// Usage: node mech2d.mjs <spec.json> [--cw 0.68] [--pull 45] [--release-deg 0]
import fs from 'node:fs';

export function simulate(spec, { cw, pullDeg, releaseDeg = 0, dt = 1e-4 }) {
  const g = spec.world.gravity, m = spec.mechanism;
  const rho = m.arm.density.value;
  const a = m.counterweight.pin_local[0];
  const Lc = m.counterweight.hang_length + m.counterweight.box_size / 2;
  const mc = cw + (m.counterweight.container_mass.value || 0);
  const Ic = mc * m.counterweight.box_size ** 2 / 6;

  const x1 = m.arm.x_min, x2 = m.arm.x_max;
  const mArm = (x2 - x1) * m.arm.thickness_y * m.arm.depth_z * rho;
  const Ibeam = mArm * (x2 ** 3 - x1 ** 3) / (3 * (x2 - x1)) + mArm * m.arm.thickness_y ** 2 / 12;
  const cupVol = (2 / 3) * Math.PI * (m.cup.outer_r ** 3 - m.cup.inner_r ** 3);
  const mCup = cupVol * rho;
  const ballLocal = [m.cup.center_local[0] + m.projectile.rest_offset_from_cup_center[0],
                     m.cup.center_local[1] + m.projectile.rest_offset_from_cup_center[1]];
  const mBall = m.projectile.mass.value;
  const pts = [ { m: mArm, l: [(x1 + x2) / 2, 0] }, { m: mCup, l: m.cup.center_local }, { m: mBall, l: ballLocal } ];
  const IA = Ibeam + mCup * (m.cup.center_local[0] ** 2 + m.cup.center_local[1] ** 2)
                   + mBall * (ballLocal[0] ** 2 + ballLocal[1] ** 2);

  const M = (th, ph) => {
    const m12 = mc * a * Lc * Math.sin(ph - th);
    return [IA + mc * a * a, m12, m12, mc * Lc * Lc + Ic];
  };
  const acc = (th, ph, thd, phd) => {
    const [m11, m12, , m22] = M(th, ph);
    const k = mc * a * Lc * Math.cos(ph - th);
    let dVth = mc * a * Math.cos(th);
    for (const p of pts) dVth += p.m * (p.l[0] * Math.cos(th) - p.l[1] * Math.sin(th));
    dVth *= g;
    const dVph = g * mc * Lc * Math.sin(ph);
    const r1 = -dVth - k * phd * phd;
    const r2 = -dVph + k * thd * thd;
    const det = m11 * m22 - m12 * m12;
    return [(r1 * m22 - m12 * r2) / det, (m11 * r2 - m12 * r1) / det];
  };
  const energy = (th, ph, thd, phd) => {
    const [m11, m12, , m22] = M(th, ph);
    let V = mc * g * (a * Math.sin(th) - Lc * Math.cos(ph));
    for (const p of pts) V += g * p.m * (p.l[0] * Math.sin(th) + p.l[1] * Math.cos(th));
    return 0.5 * m11 * thd * thd + m12 * thd * phd + 0.5 * m22 * phd * phd + V;
  };

  const thStop = m.rest_angle;
  const thRelease = thStop + (releaseDeg * Math.PI) / 180;
  let s = [thStop + (pullDeg * Math.PI) / 180, 0, 0, 0]; // th, ph, thd, phd
  const E0 = energy(...s);
  const f = (y) => { const [t2, p2] = acc(y[0], y[1], y[2], y[3]); return [y[2], y[3], t2, p2]; };
  let t = 0, maxDrift = 0, ok = false;
  while (t < 5) {
    if (s[0] <= thRelease) { ok = true; break; }
    const k1 = f(s);
    const k2 = f(s.map((v, i) => v + 0.5 * dt * k1[i]));
    const k3 = f(s.map((v, i) => v + 0.5 * dt * k2[i]));
    const k4 = f(s.map((v, i) => v + dt * k3[i]));
    s = s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t += dt;
    maxDrift = Math.max(maxDrift, Math.abs(energy(...s) - E0));
  }
  if (!ok) return { error: 'arm did not reach release angle (counterweight too light for this pull)' };

  const [th, , thd] = s;
  const R = (v) => [v[0] * Math.cos(th) - v[1] * Math.sin(th), v[0] * Math.sin(th) + v[1] * Math.cos(th)];
  const r = R(ballLocal);
  const vx = -thd * r[1], vy = thd * r[0];
  const speed = Math.hypot(vx, vy);
  const [gx, gy] = spec.world.group_origin;
  const x0 = gx + m.pivot_local[0] + r[0], y0 = gy + m.pivot_local[1] + r[1];
  const yLand = spec.world.table_top_y + m.projectile.radius;
  const tf = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - yLand))) / g;
  const xLand = x0 + vx * tf;
  return { time_to_release_s: t, omega: thd, speed, angle_deg: (Math.atan2(vy, vx) * 180) / Math.PI,
           launch: [x0, y0], land_x: xLand, range: xLand - x0, energy_drift_J: maxDrift, E0,
           masses: { arm: mArm, cup: mCup, ball: mBall, cw: mc } };
}

// What the current project's fitted formulas produce (main.js:416,454,455), same flight model.
export function fitted(spec, { cw, pullDeg }) {
  const g = spec.world.gravity, m = spec.mechanism;
  const pr = Math.min(1, Math.max(0, pullDeg / 84.5));
  const speed = 3.55 * Math.sqrt(cw / 0.68) * (0.80 + 0.40 * pr), ang = (32 * Math.PI) / 180;
  const th = m.rest_angle, b = [m.cup.center_local[0], m.cup.center_local[1] - 0.004];
  const r = [b[0] * Math.cos(th) - b[1] * Math.sin(th), b[0] * Math.sin(th) + b[1] * Math.cos(th)];
  const x0 = spec.world.group_origin[0] + m.pivot_local[0] + r[0], y0 = spec.world.group_origin[1] + m.pivot_local[1] + r[1];
  const vx = speed * Math.cos(ang), vy = speed * Math.sin(ang);
  const tf = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - (spec.world.table_top_y + m.projectile.radius)))) / g;
  return { speed, angle_deg: 32, land_x: x0 + vx * tf, range: vx * tf };
}

if (process.argv[1] && process.argv[1].endsWith('mech2d.mjs')) {
  const args = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? parseFloat(args[i + 1]) : d; };
  const p = { cw: opt('--cw', 0.68), pullDeg: opt('--pull', 45), releaseDeg: opt('--release-deg', 0) };
  console.log(JSON.stringify({ input: p, rigid: simulate(spec, p), fitted: fitted(spec, p) }, null, 2));
}
