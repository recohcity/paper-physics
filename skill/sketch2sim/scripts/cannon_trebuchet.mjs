// Cross-check (V2): rebuild the hinged-lever-with-hanging-counterweight mechanism in Cannon-es
// and compare against the rigid reference solver (mech2d.mjs). Same inputs must agree within ~5%.
// This validates that engine dynamics (hinge constraints, body inertias) match the Lagrangian model,
// NOT that the mechanism is feasible. Feasibility verdicts come from the reference solver + sweeps.
//
// Mechanism template: hinged_lever_with_hanging_counterweight (trebuchet). Not generic.
//
// Requires: cannon-es installed somewhere reachable, e.g.
//   mkdir -p /tmp/cannon-xcheck && cd /tmp/cannon-xcheck && npm init -y && npm install cannon-es
// Usage: NODE_PATH=/tmp/cannon-xcheck/node_modules node cannon_trebuchet.mjs <spec.json> [--cw 0.68] [--pull 84.5] [--release-deg 0]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// createRequire uses CommonJS resolution, so NODE_PATH works reliably regardless of the skill's location.
const { World, Body, Box, Sphere, Vec3, HingeConstraint, Quaternion } = require('cannon-es');
import { simulate } from './mech2d.mjs';

export function runCannon(spec, { cw, pullDeg, releaseDeg = 0, dt = 1 / 240, maxTime = 5 }) {
  const g = spec.world.gravity, m = spec.mechanism;
  const rho = m.arm.density.value;
  const a = m.counterweight.pin_local[0];
  const Lc = m.counterweight.hang_length + m.counterweight.box_size / 2;
  const mc = cw + (m.counterweight.container_mass.value || 0);

  // Shared masses, identical to mech2d.simulate
  const x1 = m.arm.x_min, x2 = m.arm.x_max;
  const mArm = (x2 - x1) * m.arm.thickness_y * m.arm.depth_z * rho;
  const cupVol = (2 / 3) * Math.PI * (m.cup.outer_r ** 3 - m.cup.inner_r ** 3);
  const mCup = cupVol * rho;
  const mBall = m.projectile.mass.value;
  const ballLocal = [m.cup.center_local[0] + m.projectile.rest_offset_from_cup_center[0],
                     m.cup.center_local[1] + m.projectile.rest_offset_from_cup_center[1]];

  const world = new World();
  world.gravity.set(0, -g, 0);
  world.allowSleep = false;

  // ---- Arm assembly (arm beam + cup + ball) as one rigid body ----
  // cannon-es computes mass only from the Body `mass` option and approximates inertia with an
  // AABB box; shape density does NOT contribute. To match mech2d exactly we therefore set the
  // total mass and the exact inertia about the CoM by hand (the same quantities mech2d uses).
  const armCx = (x1 + x2) / 2;
  const M = mArm + mCup + mBall; // total mass of the arm assembly
  const Ibeam = mArm * (x2 ** 3 - x1 ** 3) / (3 * (x2 - x1)) + mArm * m.arm.thickness_y ** 2 / 12;
  const IA = Ibeam + mCup * (m.cup.center_local[0] ** 2 + m.cup.center_local[1] ** 2)
                   + mBall * (ballLocal[0] ** 2 + ballLocal[1] ** 2); // about the pivot, as in mech2d
  const cx = (mCup * (m.cup.center_local[0] - armCx) + mBall * (ballLocal[0] - armCx)) / M; // CoM rel. arm centre
  const cy = (mCup * m.cup.center_local[1] + mBall * ballLocal[1]) / M;
  const Iorigin = (Ibeam - mArm * armCx ** 2) + mCup * ((m.cup.center_local[0] - armCx) ** 2 + m.cup.center_local[1] ** 2)
                + mBall * ((ballLocal[0] - armCx) ** 2 + ballLocal[1] ** 2); // about the arm centre
  const Icm = Iorigin - M * (cx ** 2 + cy ** 2); // about the CoM

  const arm = new Body({ mass: M, type: Body.DYNAMIC });
  arm.addShape(new Box(new Vec3((x2 - x1) / 2, m.arm.thickness_y / 2, m.arm.depth_z / 2)), new Vec3(-cx, -cy, 0));
  const cupR = Math.cbrt((3 * cupVol) / (4 * Math.PI)); // sphere of equal volume to the shell (visual only)
  arm.addShape(new Sphere(cupR), new Vec3(m.cup.center_local[0] - armCx - cx, m.cup.center_local[1] - cy, 0));
  const ballBodyLocal = new Vec3(ballLocal[0] - armCx - cx, ballLocal[1] - cy, 0);
  arm.addShape(new Sphere(m.projectile.radius), ballBodyLocal);
  arm.collisionFilterGroup = 1; arm.collisionFilterMask = 0;
  arm.inertia.set(0.05, 0.05, Icm); // z-inertia exact; x/y large enough to resist out-of-plane tilt
  arm.invInertia.set(20, 20, 1 / Icm);
  arm.updateInertiaWorld(true);
  const q0 = new Quaternion(); q0.setFromAxisAngle(new Vec3(0, 0, 1), m.rest_angle + (pullDeg * Math.PI) / 180);
  arm.quaternion.copy(q0);
  const [gx, gy] = spec.world.group_origin;
  const pivotWorld = new Vec3(gx + m.pivot_local[0], gy + m.pivot_local[1], 0);
  // The arm must be COCKED around the pivot: rotate the CoM offset (armCx+cx, cy) by q0 and place
  // the body so its pivot point sits exactly on pivotWorld. Placing it un-rotated would leave the
  // hinge misaligned and inject a large initial force from the constraint solve.
  const rCom = new Vec3(armCx + cx, cy, 0); // CoM offset from pivot in the rest frame
  const rotated = q0.vmult(rCom);
  arm.position.set(pivotWorld.x + rotated.x, pivotWorld.y + rotated.y, 0); // body origin at the CoM
  world.addBody(arm);

  // ---- Counterweight pendulum ----
  const cwBody = new Body({ mass: mc, type: Body.DYNAMIC });
  cwBody.addShape(new Box(new Vec3(m.counterweight.box_size / 2, m.counterweight.box_size / 2, m.counterweight.box_size / 2)));
  cwBody.collisionFilterGroup = 1; cwBody.collisionFilterMask = 0;
  cwBody.inertia.set(mc * m.counterweight.box_size ** 2 / 12, mc * m.counterweight.box_size ** 2 / 12, mc * m.counterweight.box_size ** 2 / 6);
  cwBody.invInertia.set(12 / (mc * m.counterweight.box_size ** 2), 12 / (mc * m.counterweight.box_size ** 2), 6 / (mc * m.counterweight.box_size ** 2));
  cwBody.updateInertiaWorld(true);
  const pinLocal = new Vec3(a - armCx - cx, -cy, 0); // pin in body-local (CoM) coords
  const pinWorld = arm.pointToWorldFrame(pinLocal);
  cwBody.position.set(pinWorld.x, pinWorld.y - Lc, 0); // hangs straight down from the rotated pin
  world.addBody(cwBody);

  const ground = new Body({ type: Body.STATIC });
  ground.position.copy(pivotWorld);
  world.addBody(ground);

  // Hinges (rotation axis = z in both bodies)
  world.addConstraint(new HingeConstraint(arm, ground, {
    pivotA: new Vec3(-(armCx + cx), -cy, 0), // pivot in body-local (CoM) coords
    pivotB: new Vec3(0, 0, 0),
    axisA: new Vec3(0, 0, 1), axisB: new Vec3(0, 0, 1),
  }));
  world.addConstraint(new HingeConstraint(arm, cwBody, {
    pivotA: pinLocal,
    pivotB: new Vec3(0, Lc, 0),
    axisA: new Vec3(0, 0, 1), axisB: new Vec3(0, 0, 1),
  }));

  // Solve config: high iterations, no damping/contact → close to the dissipation-free reference
  world.solver.iterations = 50;
  world.solver.tolerance = 1e-7;

  const thRelease = m.rest_angle + (releaseDeg * Math.PI) / 180;
  let t = 0, released = false, out = null;
  while (t < maxTime && !released) {
    world.step(dt);
    t += dt;
    const th = 2 * Math.atan2(arm.quaternion.z, arm.quaternion.w); // pure z-rotation angle
    if (th <= thRelease) {
      released = true;
      const omega = arm.angularVelocity.z;
      const rw = arm.pointToWorldFrame(ballBodyLocal).vsub(pivotWorld); // ball radius vector from pivot
      const vx = -omega * rw.y, vy = omega * rw.x;
      const speed = Math.hypot(vx, vy);
      const x0 = pivotWorld.x + rw.x, y0 = pivotWorld.y + rw.y;
      const yLand = spec.world.table_top_y + m.projectile.radius;
      const tf = (vy + Math.sqrt(vy * vy + 2 * g * (y0 - yLand))) / g;
      const landX = x0 + vx * tf;
      out = { time_to_release_s: +t.toFixed(4), omega, speed, angle_deg: (Math.atan2(vy, vx) * 180) / Math.PI,
              launch: [+x0.toFixed(3), +y0.toFixed(3)], land_x: +landX.toFixed(3), range: +(vx * tf).toFixed(3) };
    }
  }
  if (!released) return { error: 'arm did not reach release angle (counterweight too light for this pull)' };
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('cannon_trebuchet.mjs')) {
  const args = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? parseFloat(args[i + 1]) : d; };
  const p = { cw: opt('--cw', 0.68), pullDeg: opt('--pull', 84.5), releaseDeg: opt('--release-deg', 0) };
  const rig = simulate(spec, p);
  const can = runCannon(spec, p);
  if (rig.error || can.error) {
    console.log(JSON.stringify({ input: p, rigid: rig, cannon: can }, null, 2));
    process.exit(1);
  }
  const d = (x, y) => Math.abs(x - y) / Math.abs(y) * 100;
  console.log(JSON.stringify({
    input: p,
    rigid: { speed: +rig.speed.toFixed(3), angle_deg: +rig.angle_deg.toFixed(2), land_x: +rig.land_x.toFixed(3), time: +rig.time_to_release_s.toFixed(3) },
    cannon: { speed: +can.speed.toFixed(3), angle_deg: +can.angle_deg.toFixed(2), land_x: +can.land_x.toFixed(3), time: +can.time_to_release_s.toFixed(3) },
    diff_pct: { speed: +d(can.speed, rig.speed).toFixed(2), angle_deg: +d(can.angle_deg, rig.angle_deg).toFixed(2), land_x: +d(can.land_x, rig.land_x).toFixed(2) },
    verdict: (d(can.speed, rig.speed) <= 5 && d(can.angle_deg, rig.angle_deg) <= 5) ? 'AGREE within 5%' : 'DISAGREE (>5%)'
  }, null, 2));
}
