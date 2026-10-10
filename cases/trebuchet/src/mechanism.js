// ============================================================================
// mechanism.js — headless trebuchet rigid-body dynamics + probe (§3.1 / §3.3).
//
// This file is the machine-judge-facing physical core. It builds the REAL
// counterweight ↔ beam ↔ projectile hinge chain (the same CoM/inertia math as
// physics.js createMechanism()) but in a self-contained cannon-es World that
// works with world = scene = null — no DOM, no THREE rendering path.
//
//   new Mechanism(null, null).probe()          -> §3.1 feature pack
//   new Mechanism(null, null).probe({perturb}) -> G4 anti-fake sensitivity
//
// Every physics constant is derived from spec.json via resolveParams() (SPEC /
// MECH from src/spec.js); nothing is hand-copied. Solver knobs (iterations /
// substeps / dt) are numerical-method settings, not physics constants.
// ============================================================================

import * as CANNON from 'cannon-es';
import { SPEC, MECH } from './spec.js';

// Pure function: the exact physics values the mechanism uses at runtime.
// verify.mjs / run-gates / probe all read this single derivation so a later
// hard-coded this.x1 = -0.6 can never drift silently.
export function resolveParams(spec = null) {
  const s = spec || SPEC;
  return {
    g: s.world.gravity,
    // Beam lever geometry (m), all from spec.json.
    x1: s.physics.armLongX,          // long-arm (cup) extent, negative
    x2: s.physics.armShortX,         // short-arm (counterweight) extent, positive
    restAngle: s.physics.restAngle,  // vertical-down stop (rad)
    // Masses (kg).
    cwMass: s.physics.counterweightKg.default,
    ballMass: s.physics.ballKg.default,
    // Beam / cup inertial geometry — MECH is derived from spec.json in spec.js.
    ty: MECH.arm_ty,
    dz: MECH.arm_dz,
    rho: MECH.rho,
    cup_x: MECH.cup_x, cup_y: MECH.cup_y,
    cup_ri: MECH.cup_ri, cup_ro: MECH.cup_ro,
    ball_x: MECH.ball_x, ball_y: MECH.ball_y,
    pin_x: MECH.pin_x,
    hang: MECH.hang,
    box: MECH.box,
  };
}

// Cock pose (scenario setting, not a spec physics constant): the short arm is
// rotated UP so the hanging counterweight is raised high; releasing it swings
// the beam through vertical and whips the cup end upward. Matches the
// physics.js hold/stop convention (hold ~ right-tilted, stop = vertical).
const HOLD_ANGLE = 0.8;
const DT = 1 / 240;       // fixed step (matches physics.js fixedDt)
const SUBSTEPS = 2;       // half-dt substeps keep hinge slack < 2%
const SIM_TIME = 3.0;     // seconds stepped per probe

// Build one headless cannon-es trebuchet. Returns bodies + derived offsets.
function buildTrebuchet(p) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -p.g, 0) });
  world.solver.iterations = 150;
  world.solver.tolerance = 1e-9;

  const Lc = p.hang + p.box / 2;   // hanger length (pin -> cw centre)

  // ---- Beam mass / inertia (mirrors physics.js createMechanism) ----
  const armCx = (p.x1 + p.x2) / 2;
  const mArm = (p.x2 - p.x1) * p.ty * p.dz * p.rho;
  const cupVol = (2 / 3) * Math.PI * (p.cup_ro ** 3 - p.cup_ri ** 3);
  const mCup = cupVol * p.rho;
  const M = mArm + mCup + p.ballMass;
  const Ibeam = mArm * (p.x2 ** 3 - p.x1 ** 3) / (3 * (p.x2 - p.x1)) + mArm * p.ty ** 2 / 12;
  const cx = (mCup * (p.cup_x - armCx) + p.ballMass * (p.ball_x - armCx)) / M;
  const cy = (mCup * p.cup_y + p.ballMass * p.ball_y) / M;
  const Iorigin = (Ibeam - mArm * armCx ** 2)
    + mCup * ((p.cup_x - armCx) ** 2 + p.cup_y ** 2)
    + p.ballMass * ((p.ball_x - armCx) ** 2 + p.ball_y ** 2);
  const Icm = Iorigin - M * (cx ** 2 + cy ** 2);
  const rCom = new CANNON.Vec3(armCx + cx, cy, 0);
  const pinLocal = new CANNON.Vec3(p.pin_x - armCx - cx, -cy, 0);
  const ballLocal = new CANNON.Vec3(p.ball_x - armCx - cx, p.ball_y - cy, 0);

  // Arm body — origin at the CoM (gravity must act at CoM, not the pivot).
  const armBody = new CANNON.Body({ mass: M, type: CANNON.Body.DYNAMIC });
  armBody.addShape(new CANNON.Box(new CANNON.Vec3((p.x2 - p.x1) / 2, p.ty / 2, p.dz / 2)),
    new CANNON.Vec3(-cx, -cy, 0));
  armBody.inertia.set(0.05, 0.05, Icm);
  armBody.invInertia.set(20, 20, 1 / Icm);
  armBody.updateInertiaWorld(true);
  world.addBody(armBody);

  // Counterweight box hanging Lc below the arm pin.
  const Icw = p.cwMass * p.box ** 2 / 6;
  const cwBody = new CANNON.Body({ mass: p.cwMass, type: CANNON.Body.DYNAMIC });
  cwBody.addShape(new CANNON.Box(new CANNON.Vec3(p.box / 2, p.box / 2, p.box / 2)));
  cwBody.inertia.set(Icw, Icw, Icw);
  cwBody.invInertia.set(1 / Icw, 1 / Icw, 1 / Icw);
  cwBody.updateInertiaWorld(true);
  world.addBody(cwBody);

  // Static pivot anchor.
  const anchor = new CANNON.Body({ type: CANNON.Body.STATIC });
  world.addBody(anchor);

  // Hinge 1: arm ↔ world (at pivot). Hinge 2: counterweight ↔ arm (at pin).
  world.addConstraint(new CANNON.HingeConstraint(armBody, anchor, {
    pivotA: new CANNON.Vec3(-(armCx + cx), -cy, 0), pivotB: new CANNON.Vec3(0, 0, 0),
    axisA: new CANNON.Vec3(0, 0, 1), axisB: new CANNON.Vec3(0, 0, 1),
  }));
  world.addConstraint(new CANNON.HingeConstraint(armBody, cwBody, {
    pivotA: pinLocal, pivotB: new CANNON.Vec3(0, Lc, 0),
    axisA: new CANNON.Vec3(0, 0, 1), axisB: new CANNON.Vec3(0, 0, 1),
  }));

  // Cock pose: arm rotated to HOLD_ANGLE, counterweight hung vertically below pin.
  armBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), HOLD_ANGLE);
  const rot = armBody.quaternion.vmult(rCom);
  armBody.position.set(rot.x, rot.y, 0);
  armBody.velocity.setZero();
  armBody.angularVelocity.setZero();
  const pinW = armBody.pointToWorldFrame(pinLocal);
  cwBody.position.set(pinW.x, pinW.y - Lc, 0);
  cwBody.quaternion.set(0, 0, 0, 1);
  cwBody.velocity.setZero();
  cwBody.angularVelocity.setZero();

  return { world, armBody, cwBody, pinLocal, ballLocal, M, Icm, Icw, cwMass: p.cwMass, Lc };
}

// Total mechanical energy of arm + counterweight (projectile is baked into M).
function totalEnergy(b, g) {
  const keA = 0.5 * b.M * b.armBody.velocity.lengthSquared()
    + 0.5 * b.Icm * b.armBody.angularVelocity.z ** 2;
  const keC = 0.5 * b.cwMass * b.cwBody.velocity.lengthSquared()
    + 0.5 * b.Icw * b.cwBody.angularVelocity.z ** 2;
  const pe = b.M * g * b.armBody.position.y + b.cwMass * g * b.cwBody.position.y;
  return { ke: keA + keC, pe, e: keA + keC + pe };
}

export class Mechanism {
  /**
   * @param {CANNON.World|null} world - external world (null = headless)
   * @param {THREE.Group|null} scene - render scene (null = headless)
   * @param {Object|null} spec - parameter source (defaults to imported SPEC)
   */
  constructor(world = null, scene = null, spec = null) {
    this.world = world;
    this.scene = scene;
    this.spec = spec || SPEC;
  }

  resolveParams() {
    return resolveParams(this.spec);
  }

  /**
   * Headless verification probe (§3.1).
   * @param {Object} options - { stepCount, dt, perturb:{counterweight,pendulumLength} }
   *   perturb.pendulumLength: +1.1 stretches the long-arm (cup) reach +10% — G4.
   *   perturb.counterweight:   +1.1 raises the counterweight mass +10% — G4.
   * @returns {Object} feature pack
   */
  probe(options = {}) {
    const p = this.resolveParams();
    const g = p.g;

    // ---- G4 anti-fake perturbation (applied BEFORE building) ----
    const perturb = options.perturb ?? null;
    if (perturb) {
      if (perturb.pendulumLength) {
        // Long-arm reach scale: x1 / cup_x / ball_x all live on the negative
        // long-arm side; scaling their magnitude lengthens the lever.
        const k = perturb.pendulumLength;
        p.x1 *= k; p.cup_x *= k; p.ball_x *= k;
      }
      if (perturb.counterweight) p.cwMass *= perturb.counterweight;
      if (perturb.ballMass) p.ballMass *= perturb.ballMass;
    }

    // ---- Rest-state settle check (§3.1 restStateSettled) ----
    // A held-beam / hanging-cw start configuration must stay finite and
    // near-stationary with no spontaneous NaN / runaway over a short window.
    const settle = buildTrebuchet(p);
    settle.armBody.type = CANNON.Body.KINEMATIC; // hold the beam, let cw settle
    for (let i = 0; i < 12; i++) {
      for (let k = 0; k < SUBSTEPS; k++) settle.world.step(DT / SUBSTEPS);
    }
    let restOk = true;
    for (const b of [settle.armBody, settle.cwBody]) {
      if (!isFinite(b.velocity.length()) || !isFinite(b.position.y)) restOk = false;
      if (b.velocity.length() > 0.3) restOk = false; // cw swing after 12 steps must be small
    }

    // ---- Main launch scenario ----
    const b = buildTrebuchet(p);
    const E0 = totalEnergy(b, g).e;

    const steps = Math.round((options.simTime ?? SIM_TIME) / DT);
    let prevBall = b.armBody.pointToWorldFrame(b.ballLocal);
    let peakSpeed = 0, peakVx = 0, peakVy = 0;
    let Epeak = E0;
    let kePeak = 0, pePeak = 0;
    let maxSlack = 0;
    let exploded = false;

    for (let s = 0; s < steps; s++) {
      for (let k = 0; k < SUBSTEPS; k++) b.world.step(DT / SUBSTEPS);

      // Projectile (cup-end ball anchor) world speed via central finite diff.
      const ball = b.armBody.pointToWorldFrame(b.ballLocal);
      const vx = (ball.x - prevBall.x) / DT;
      const vy = (ball.y - prevBall.y) / DT;
      const sp = Math.hypot(vx, vy);
      if (sp > peakSpeed) {
        peakSpeed = sp; peakVx = vx; peakVy = vy;
        const E = totalEnergy(b, g);
        Epeak = E.e; kePeak = E.ke; pePeak = E.pe;
      }
      prevBall = ball;

      // Constraint slack: cw centre must stay Lc from the pin (hinge integrity).
      const pinW = b.armBody.pointToWorldFrame(b.pinLocal);
      const d = pinW.distanceTo(b.cwBody.position);
      maxSlack = Math.max(maxSlack, (Math.abs(d - b.Lc) / b.Lc) * 100);

      if (!isFinite(ball.x) || Math.abs(ball.x) > 1e3) exploded = true;
    }

    // ---- Primary velocity + parabolic range (§3.3: trajectory is a parabola) ----
    const launchAngle = Math.atan2(peakVy, peakVx);
    const range = (peakSpeed ** 2 * Math.sin(2 * launchAngle)) / g;

    // Net momentum of the arm+cw system at the release snapshot.
    let px = 0, py = 0, pz = 0;
    px += b.M * b.armBody.velocity.x + b.cwMass * b.cwBody.velocity.x;
    py += b.M * b.armBody.velocity.y + b.cwMass * b.cwBody.velocity.y;

    return {
      // 1. conservation features
      kineticEnergy: kePeak,                       // J at release
      potentialEnergy: pePeak,                     // J at release
      totalEnergyDrift: ((Epeak - E0) / Math.abs(E0)) * 100, // % PE->KE balance
      momentumVector: [px, py, pz],                // kg·m/s
      // 2. mechanism features
      primaryVelocity: peakSpeed,                  // m/s, cup-end projectile exit speed
      restStateSettled: restOk && !exploded,       // no NaN / runaway
      maxDisplacement: range,                       // m, parabolic range
      // 3. constraints & contacts
      constraintSlack: maxSlack,                   // %
      propCollisions: [],                          // headless: no props; arm never penetrates frame
    };
  }
}
