import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { sound } from './audio.js';
import { SPEC, MECH } from './spec.js';

// Pure function returning physics values used at runtime.
export function resolveParams() {
  return {
    ballKgDefault: SPEC.physics.ballKg.default,
    ballKgMin: SPEC.physics.ballKg.min,
    ballKgMax: SPEC.physics.ballKg.max,
    armLongX: MECH.arm_x1,
    armShortX: MECH.arm_x2,
    restAngle: SPEC.physics.restAngle,
  };
}

// ---------------------------------------------------------------------------
// SCALE ANCHOR: 1 scene unit = 1 m (single source of truth; audit F3).
// Gravity (9.82), masses (kg), densities (kg/m³) and mm display all derive
// from it.  All mechanism numbers (arm x ∈ [-0.596, 0.17], rest angle -1.571,
// apexY 0.5964 hover geometry, counterweight slider 1.40-10.0 (default 4.8), ball slider
// 0.30-0.60) live in src/spec.js — single source of truth via spec.json.
// Lower bound 1.40 kg keeps the released arm from inverting (mech2d sweep);
// below it the throw stalls.  The upper bound is open to 10.0 kg (sand full);
// a heavier BALL than counterweight is a normal seesaw — the arm simply settles
// cup-down and is stopped by the paper (mask 4) / chassis limiter (group 8),
// never by clamping the sliders (see pitfall #18 re-run note).  Browser-
// verified baseline (historical, 2.6 kg default era): 2.6 kg x 0.45 kg ->
// 3.53 m/s / 31° / down 1-4; the current 4.8 kg default needs a fresh browser
// re-measure before it is quoted as a baseline.
// ---------------------------------------------------------------------------

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.world.broadphase = new CANNON.NaiveBroadphase();
    // Match the cross-validated baseline exactly (50 iters / 1e-7) so release
    // speed matches mech2d/Cannon-es to <1.5%.  Impact-momentum transfer was
    // measured separately: a 0.10 kg ball at 3.3 m/s knocks the 0.14 kg blocks
    // over with the default solver budget (see cannon-xcheck/collision_test.mjs).
    this.world.solver.iterations = 80;   // rope P2P chain shares the budget (was 50)
    this.world.solver.tolerance = 1e-7;

    // Contact Materials
    const groundMaterial = new CANNON.Material('ground');
    const woodMaterial = new CANNON.Material('wood');
    const metalMaterial = new CANNON.Material('metal');

    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, woodMaterial, {
      friction: 0.7, restitution: 0.12,
    }));
    // Block-on-block: wood-wood Coulomb friction (0.35).  cannon-es solves
    // friction as a hard constraint, so 0.65 locked the blocks ("like stone");
    // 0.0 made them slide away like plastic (user feedback).  0.35 lets a
    // struck block topple while still gripping its neighbours.
    this.world.addContactMaterial(new CANNON.ContactMaterial(woodMaterial, woodMaterial, {
      friction: 0.35, restitution: 0.15,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(metalMaterial, woodMaterial, {
      friction: 0.45, restitution: 0.50,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, metalMaterial, {
      friction: 0.50, restitution: 0.25,
    }));

    this.materials = { groundMaterial, woodMaterial, metalMaterial };

    this.blocks = [];
    this.blockMeshes = [];
    this.initialBlockPositions = [];
    this.blocksActivated = false;

    this.ballBody = null;
    this.ballMesh = null;
    this.ballReleased = false;

    // Solid Table surface — dedicated collision group 4 so the counterweight
    // can rest on it after the shot without hitting blocks or the projectile.
    const tableBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(5, 0.5, 5)),
      material: groundMaterial,
      position: new CANNON.Vec3(0, -0.5 + 0.006, 0),
    });
    tableBody.collisionFilterGroup = 4;
    tableBody.collisionFilterMask = 0xffffffff;
    this.world.addBody(tableBody);

    // Base deck — collision body for the chassis top deck (chassis x from
    // -0.38 to +0.38, z ±0.08, deck top y=0.10).  The counterweight lands on
    // this deck instead of clipping through open crossbeams; it never falls to
    // the floor because the deck covers its whole landing zone (pin at chassis
    // x~0.32, box half-width 0.065 < 0.08).  Narrow so the wheels (z ±0.15)
    // stay exposed beside it.
    const deckBody = new CANNON.Body({ type: CANNON.Body.STATIC });
    deckBody.addShape(new CANNON.Box(new CANNON.Vec3(0.40, 0.01, 0.08)),
                      new CANNON.Vec3(-0.72 + 0.05, 0.09, 0));
    deckBody.collisionFilterGroup = 2;
    deckBody.collisionFilterMask = 4; // only the counterweight box
    this.world.addBody(deckBody);
    this._deckBody = deckBody; // saved for the cw collide listener (F.1)

    // Chassis arm-limiter (REAL collision for the lever, pitfall #18 follow-up):
    // the arm body used to be mask 0 (never collides), so when the ball outweighs
    // the counterweight (seesaw inversion) the beam swung straight through the
    // chassis deck.  This static plate sits on the deck top face (y=0.09) and the
    // arm mask includes its group (8).  Right edge = A-frame front foot (world
    // x=-0.48): the cup's whole seesaw-settle arc (x -0.36..-0.01) lies to the
    // RIGHT of it, so an inverted arm swings free past the chassis and stops on
    // the paper (mask 4) — the cup never overlaps the deck.  The plate only
    // catches the beam if the inversion goes past vertical.  Dedicated group 8:
    // counterweight (mask 4|2), ball/blocks/props (mask 0xffffffff but plate
    // mask=2 excludes group 1) are unaffected.
    const armLimiter = new CANNON.Body({ type: CANNON.Body.STATIC });
    armLimiter.addShape(new CANNON.Box(new CANNON.Vec3(0.295, 0.015, 0.10)),
                        new CANNON.Vec3(0, 0, 0));
    armLimiter.position.set(-0.775, 0.09, 0); // x in [-1.07, -0.48]
    armLimiter.collisionFilterGroup = 8;
    armLimiter.collisionFilterMask = 2; // only the arm beam
    this.world.addBody(armLimiter);
    this._armLimiter = armLimiter;

    // Chassis + A-frame collision bodies (ball-blocker, 2026-09-30): the
    // projectile used to fly straight through the trebuchet when it bounced
    // back, because only the cw-landing deck (mask 4) and the arm-limiter
    // (mask 8) had bodies and neither collided with group 1 (ball/blocks).
    // Add a full chassis box + two A-frame side plates, group 1, so the
    // machine physically stops the ball (and the blocks) like real wood.
    // The trebuchet recoils (chassis x shifts ±~0.03), so their x is synced
    // every frame to trebuchet.group.position.x via syncChassis().
    this._chassisBodies = [];
    const woodMat = this.materials?.woodMaterial || groundMaterial;
    const chassisBox = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMat });
    chassisBox.addShape(new CANNON.Box(new CANNON.Vec3(0.38, 0.035, 0.145)),
                        new CANNON.Vec3(0, 0.065, 0)); // chassis x [-0.38,0.38] rel apex
    chassisBox.position.set(-0.72, 0, 0);
    chassisBox.collisionFilterGroup = 64;
    chassisBox.collisionFilterMask = 0xffffffff;
    chassisBox._relX = 0; // chassis is group-local x=0 -> world x = groupX
    chassisBox.userData = { hit: 'machine' };
    this.world.addBody(chassisBox);
    this._chassisBodies.push(chassisBox);
    // Two A-frame side plates (covers rear/front slanted legs + centre post at
    // z ±0.125; kept off z=0 so the hanging counterweight and beam are untouched).
    [-0.125, 0.125].forEach((z) => {
      const frame = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMat });
      frame.addShape(new CANNON.Box(new CANNON.Vec3(0.275, 0.25, 0.015)),
                     new CANNON.Vec3(0.02, 0.33, z)); // frame x [-0.675,0.295]? no — rel apex x
      frame.position.set(-0.72, 0, 0);
      frame.collisionFilterGroup = 64;
      frame.collisionFilterMask = 0xffffffff;
      frame._relX = 0; // A-frame is also group-local x=0 (legs span x[-0.92,0.24])
      frame.userData = { hit: 'machine' };
      this.world.addBody(frame);
      this._chassisBodies.push(frame);
    });
    // Four wheels (group-local x ±0.22, z ±0.205, axle y 0.065): a ball
    // rolling into a wheel must be stopped, not pass through it.
    [-0.22, 0.22].forEach((wx) => {
      [-0.205, 0.205].forEach((wz) => {
        const wheel = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMat });
        wheel.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.065, 0.014)),
                       new CANNON.Vec3(wx, 0.065, wz));
        wheel.position.set(-0.72, 0, 0);
        wheel.collisionFilterGroup = 64;
        wheel.collisionFilterMask = 0xffffffff;
        wheel._relX = wx; // world x = groupX + wx
        wheel.userData = { hit: 'machine' };
        this.world.addBody(wheel);
        this._chassisBodies.push(wheel);
      });
    });
    // Winch (rope drum + crank wheels), group-local (-0.27, 0.10, 0).
    const winch = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMat });
    winch.addShape(new CANNON.Box(new CANNON.Vec3(0.06, 0.03, 0.04)),
                   new CANNON.Vec3(-0.27, 0.13, 0));
    winch.position.set(-0.72, 0, 0);
    winch.collisionFilterGroup = 64;
    winch.collisionFilterMask = 0xffffffff;
    winch._relX = -0.27;
    winch.userData = { hit: 'machine' };
    this.world.addBody(winch);
    this._chassisBodies.push(winch);

    this.onBlockHit = null;
    this.onBallLand = null;

    // Real hinge mechanism (arm + counterweight, audit F1/F2 fix) — built by
    // createMechanism(); stays KINEMATIC (locked to the 3D model) until fire().
    this.mechArmBody = null;
    this.mechCwBody = null;
    this._mechAnchor = null;
    this._mechPivot = new CANNON.Vec3(0, 0, 0);
    this._mechRestAngle = -0.85;
    this._mechIcm = 0;
    this._mechLc = MECH.hang + MECH.box / 2;
    this._mechCwMass = 1.00;
    this._mechCwBox = MECH.box;
    this.ballKg = SPEC.physics.ballKg.default;      // adjustable via BALL slider
    this.ballRadius = 0.03;  // derived from default ball kg (see setBall)
  }

  // Sync chassis/frame colliders with the 3D group (recoil).  Call every
  // frame with trebuchet.group.position.x.
  syncChassis(groupX) {
    if (!this._chassisBodies) return;
    for (const b of this._chassisBodies) b.position.x = groupX + b._relX;
  }

  // Ball-stand collider: the two-tier wooden rack (base+tray at the paper's
  // lower-left) was invisible to physics, so a rolled/landed ball slid through
  // it.  Add one static box over the tray; group 64 (same as chassis/frame) so
  // it blocks the ball (group 1, mask 0xffffffff once released) but never
  // touches the arm/counterweight.  Stand is fixed on the paper (does NOT
  // recoil with the trebuchet group), so it is kept out of _chassisBodies.
  addBallStandCollider(x, z) {
    if (this._standCollider) return;
    const woodMat = this.materials?.woodMaterial || groundMaterial;
    const stand = new CANNON.Body({ type: CANNON.Body.STATIC, material: woodMat });
    // Tray 0.12 square, y 0.017..0.047 (base 0.006..0.020 + tray 0.020..0.046).
    stand.addShape(new CANNON.Box(new CANNON.Vec3(0.055, 0.015, 0.055)),
                   new CANNON.Vec3(0, 0.032, 0));
    stand.position.set(x, 0, z);
    stand.collisionFilterGroup = 64;
    stand.collisionFilterMask = 0xffffffff;
    stand.userData = { hit: 'stand' };
    this.world.addBody(stand);
    this._standCollider = stand;
  }

  // -------------------------------------------------------------------------
  // Real hinge mechanism (trebuchet arm + hanging counterweight).
  // Geometry and masses mirror scripts/mech2d.mjs so the front-end dynamics
  // reproduce the cross-validated reference (V2: rigid vs Cannon-es <5%).
  // Until releaseMechanism() is called both bodies are KINEMATIC and their
  // poses are driven by setCocked() from the 3D model — the audit F1 fix
  // (the fitted-acceleration launch loop in main.js is gone).
  // -------------------------------------------------------------------------
  createMechanism(pivotWorldX, pivotWorldY, restAngle = -0.85) {
    const { arm_x1: x1, arm_x2: x2, arm_ty: ty, arm_dz: dz, rho,
            cup_x, cup_y, cup_ri, cup_ro, ball_x, ball_y, pin_x, box } = MECH;
    const ball_m = this.ballKg, ball_r = this.ballRadius; // adjustable via the BALL slider

    this._mechRestAngle = restAngle;
    this._mechPivot.set(pivotWorldX, pivotWorldY, 0);
    this._mechCwBox = box;

    // Masses & inertias — identical to mech2d.simulate / cannon_trebuchet.mjs.
    // cannon-es assumes the CoM is at the body origin (shape density does not
    // contribute to mass or inertia), so the arm body origin MUST be the CoM.
    // Placing it at the pivot would apply gravity at the pivot and drop the
    // arm's own restoring torque — the same energy-injection failure mode
    // documented in physics-pitfalls.md #12/#13 (and measured here: 5.2 m/s
    // instead of the cross-checked 3.57 m/s).
    const armCx = (x1 + x2) / 2;
    const mArm = (x2 - x1) * ty * dz * rho;
    const cupVol = (2 / 3) * Math.PI * (cup_ro ** 3 - cup_ri ** 3);
    const mCup = cupVol * rho;
    const M = mArm + mCup + ball_m;
    const Ibeam = mArm * (x2 ** 3 - x1 ** 3) / (3 * (x2 - x1)) + mArm * ty ** 2 / 12;
    const IA = Ibeam + mCup * (cup_x ** 2 + cup_y ** 2) + ball_m * (ball_x ** 2 + ball_y ** 2);
    const cx = (mCup * (cup_x - armCx) + ball_m * (ball_x - armCx)) / M;
    const cy = (mCup * cup_y + ball_m * ball_y) / M;
    const Iorigin = (Ibeam - mArm * armCx ** 2)
      + mCup * ((cup_x - armCx) ** 2 + cup_y ** 2)
      + ball_m * ((ball_x - armCx) ** 2 + ball_y ** 2);
    this._mechIcm = Iorigin - M * (cx ** 2 + cy ** 2);
    this._mechRCom = new CANNON.Vec3(armCx + cx, cy, 0);        // CoM offset from pivot (rest frame)
    this._mechPinLocal = new CANNON.Vec3(pin_x - armCx - cx, -cy, 0);  // pin rel CoM
    this._mechBallLocal = new CANNON.Vec3(ball_x - armCx - cx, ball_y - cy, 0);

    // Arm body — origin at the CoM; shapes offset relative to the CoM.
    const armBody = new CANNON.Body({ mass: M, type: CANNON.Body.DYNAMIC });
    armBody.addShape(new CANNON.Box(new CANNON.Vec3((x2 - x1) / 2, ty / 2, dz / 2)),
                     new CANNON.Vec3(-cx, -cy, 0));
    // mask 4 (paper, group 4) + 8 (chassis arm-limiter, group 8): the arm now
    // really collides.  It must NOT collide with the counterweight (group 2,
    // hinge-connected) or ball/blocks/props (group 1) — 4|8 contains none of
    // those, so the throw path and the block physics are untouched.  The
    // physical bottom limit of the downward pull is the analytic clamp at
    // maxPullDeg = 135° (45° from the mast; cradle stays ~8 cm clear of the
    // paper, so paper contact is only a safety net, not the working limit);
    // the limiter plate (group 8) is the seesaw-inversion stop.
    armBody.collisionFilterGroup = 2 | 32; armBody.collisionFilterMask = 4 | 8 | 1;
    armBody.userData = { hit: 'machine' };
    this._applyInertia(armBody, this._mechIcm);
    this.world.addBody(armBody);
    this.mechArmBody = armBody;
    // Ring anchor (where the rope ties) in CoM-local space: visual ring sits at
    // armPivot-local (-0.50, -0.042, 0); armPivot x=armCx maps to CoM x=-cx.
    this._ringLocalCoM = new CANNON.Vec3(-0.50 - armCx - cx, -0.042 - cy, 0);
    // Counterweight body — origin at box centre; hangs Lc below the arm pin.
    // Collides ONLY with the table (group 4): during flight the counterweight
    // must swing free (mask 0, set again in releaseMechanism); after the arm
    // stops it falls and rests on the table naturally instead of being teleported.
    const cwBody = new CANNON.Body({ mass: this._mechCwMass, type: CANNON.Body.DYNAMIC,
                                     linearDamping: 0.05, angularDamping: 0.30 });
    cwBody.addShape(new CANNON.Box(new CANNON.Vec3(box / 2, box / 2, box / 2)));
    cwBody.collisionFilterGroup = 2; cwBody.collisionFilterMask = 4 | 1;
    cwBody.userData = { hit: 'machine' };
    this.world.addBody(cwBody);
    this.mechCwBody = cwBody;

    // HOVER (user directive 1): the counterweight box never rests on the
    // chassis deck.  It hangs Lc below the arm pin; the deck (group 2) is kept
    // as a collision body and the box mask includes 4|2 AFTER lock as a safety
    // net only — with the 20 mm rest gap and ≥10 mm transient clearance it
    // should never actually contact, so no touch-down logic is needed here.
    // The residual post-release pendulum is damped and eased to vertical hang
    // in step() (see _cwSettle block).

    // Static anchor at the pivot for the arm hinge.
    const anchor = new CANNON.Body({ type: CANNON.Body.STATIC });
    anchor.position.copy(this._mechPivot);
    this.world.addBody(anchor);
    this._mechAnchor = anchor;

    // Two z-axis hinges: arm↔world at the pivot; counterweight↔arm at the pin.
    this.world.addConstraint(new CANNON.HingeConstraint(armBody, anchor, {
      pivotA: new CANNON.Vec3(-(armCx + cx), -cy, 0), pivotB: new CANNON.Vec3(0, 0, 0),
      axisA: new CANNON.Vec3(0, 0, 1), axisB: new CANNON.Vec3(0, 0, 1),
    }));
    this._cwHinge = new CANNON.HingeConstraint(armBody, cwBody, {
      pivotA: this._mechPinLocal,
      pivotB: new CANNON.Vec3(0, this._mechLc, 0),
      axisA: new CANNON.Vec3(0, 0, 1), axisB: new CANNON.Vec3(0, 0, 1),
    });
    this.world.addConstraint(this._cwHinge);

    this.setCwMass(this._mechCwMass);
    this.setCocked(0);
  }

  // -------------------------------------------------------------------------
  // Physical rope (user 2026-09-30: Cannon node chain + ring collision).
  // The rope is a chain of light spheres tied with PointToPoint constraints;
  // node0 is LOCKED to the arm body at the ring anchor, the last node is LOCKED
  // to the winch anchor on the chassis.  Ring collision boxes (group 32) on the
  // arm keep the rope from passing through the ring tube while leaving the hole
  // open, so the rope threads through it.  Rope is purely decorative-mechanical:
  // the throw is still hinge-driven; this adds the visual constraint that the
  // rope cannot break or slip off.
  // -------------------------------------------------------------------------
  buildRope() {
    // 2026-09-30 user solution: no threading, no knotting.  The ring tube is
    // thicker than the rope (tube Ø 0.010 > rope Ø 0.007), so the rope end is
    // EMBEDDED in the ring and locked to the ring anchor on the arm.  The
    // visual rope terminates at the ring centre (ringWorldForRope); nothing
    // sticks out past the ring.  No physics nodes, no constraints - the rope
    // end is fixed to the ring, and the rope itself transfers no force (the
    // throw is hinge-driven).
  }

  // World position of the ring hole for the long visual rope (winch -> ring).
  ringWorldForRope(out) {
    const r = this._ringLocalCoM;
    const w = this.mechArmBody.pointToWorldFrame(r);
    out.x = w.x; out.y = w.y; out.z = w.z;
    return out;
  }

  // Set the z-axis inertia by hand. cannon-es approximates inertia from shape
  // AABBs and recomputes it on updateMassProperties(); we must re-assert the
  // exact values every time mass changes (physics-pitfalls.md entry #12).
  _applyInertia(body, Iz) {
    body.inertia.set(0.05, 0.05, Iz);
    body.invInertia.set(20, 20, 1 / Iz);
    body.updateInertiaWorld(true);
  }

  setCwMass(kg) {
    if (!this.mechCwBody) return;
    this._mechCwMass = kg;
    this.mechCwBody.mass = kg; // mass setter triggers updateMassProperties()
    this._applyInertia(this.mechCwBody, kg * this._mechCwBox ** 2 / 6);
  }

  // Projectile slider: mass 0.30–0.60 kg; DIAMETER follows the bowl opening
  // (100 mm) by ratio — 0.45 kg -> 60% (r 30 mm), 0.60 kg -> 80% (r 40 mm),
  // linear between.  Mass and size are independent parameters per user spec.
  // Real colliders for the desk props (pencil & blue-white eraser) so the
  // iron ball and the block tower collide with them instead of passing
  // through.  The props are visual meshes in the environment; the colliders
  // are static boxes whose size/pose mirror the meshes (drawn in the scene
  // at 1 unit = 1 m).
  addPropColliders(pencilGroup, eraserGroup) {
    const addStatic = (halfExtents, pos, quat, mat, hitKind) => {
      const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: mat });
      body.addShape(new CANNON.Box(new CANNON.Vec3(halfExtents[0], halfExtents[1], halfExtents[2])));
      body.position.set(pos.x, pos.y, pos.z);
      if (quat) body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
      body.collisionFilterGroup = 1;  // default group: collides with ball & blocks
      body.collisionFilterMask = 0xffffffff;
      body.userData = { hit: hitKind }; // ball hit-sound dispatch (2026-10-01)
      this.world.addBody(body);
      return body;
    };
    this.propBodies = [];
    if (pencilGroup) {
      const pos = pencilGroup.getWorldPosition(new THREE.Vector3());
      const quat = pencilGroup.getWorldQuaternion(new THREE.Quaternion());
      // pencil ≈ 1.33 long (body 1.0 + tip + ferrule + pink eraser), r≈0.036
      this.propBodies.push(addStatic([0.665, 0.036, 0.036], pos, quat, this.materials.woodMaterial, 'pencil'));
    }
    if (eraserGroup) {
      const pos = eraserGroup.getWorldPosition(new THREE.Vector3());
      const quat = eraserGroup.getWorldQuaternion(new THREE.Quaternion());
      // blue-white block eraser: 0.50 x 0.109 x 0.20
      this.propBodies.push(addStatic([0.25, 0.0545, 0.10], pos, quat, this.materials.woodMaterial, 'eraser'));
    }
    return this.propBodies;
  }

  setBall(kg) {
    this.ballKg = kg;
    const bMin = SPEC.physics.ballKg.min, bMax = SPEC.physics.ballKg.max;
    const ratio = 0.60 + ((kg - bMin) / (bMax - bMin)) * 0.20; // 60%..80% across range
    this.ballRadius = MECH.cup_ri * ratio; // bowl inner radius
    if (this.ballBody) {
      this.ballBody.removeShape(this.ballShape);
      this.ballShape = new CANNON.Sphere(this.ballRadius);
      this.ballBody.addShape(this.ballShape);
      this.ballBody.mass = kg;
      this.ballBody.updateMassProperties();
    }
    if (this.ballMesh) {
      const oldGeom = this.ballMesh.geometry;
      this.ballMesh.geometry = new THREE.SphereGeometry(this.ballRadius, 32, 32);
      oldGeom.dispose();
    }
    this.rebuildMechanism();
  }

  rebuildMechanism() {
    // cannon-es: removeBody() also drops the bodies' attached constraints.
    if (this.mechArmBody) this.world.removeBody(this.mechArmBody);
    if (this.mechCwBody) this.world.removeBody(this.mechCwBody);
    if (this._mechAnchor) this.world.removeBody(this._mechAnchor);
    this.mechArmBody = null; this.mechCwBody = null; this._mechAnchor = null;
    this.createMechanism(this._mechPivot.x, this._mechPivot.y, this._mechRestAngle);
  }

  // Drive the locked (pre-fire) mechanism pose from the 3D model.  Because the
  // arm body origin is the CoM, rotating it about the pivot also moves the body
  // origin along the rotated rCom — the arm must be cocked AROUND the pivot
  // (pitfall #13), otherwise the hinge is misaligned and injects energy.
  setCocked(pullDeg) {
    if (!this.mechArmBody) return;
    this.mechArmBody.type = CANNON.Body.KINEMATIC;
    this.mechCwBody.type = CANNON.Body.KINEMATIC;
    const ang = this._mechRestAngle + (pullDeg * Math.PI) / 180;
    this.mechArmBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), ang);
    const rot = this.mechArmBody.quaternion.vmult(this._mechRCom);
    this.mechArmBody.position.set(this._mechPivot.x + rot.x, this._mechPivot.y + rot.y, 0);
    this.mechArmBody.velocity.set(0, 0, 0);
    this.mechArmBody.angularVelocity.set(0, 0, 0);
    this._syncCw();
    // HOVER: the box hangs straight down from the pin — with apexY=0.5964 its
    // bottom sits 20 mm above the deck top (0.10), so the old deck clamp is
    // deleted.  It must never be pushed down onto the deck.
    this._cwSettle = false; // kinematic drag: never settle-ease during cocking
  }

  // Place the counterweight hanging straight down (world-vertical) from the
  // arm pin — the same initial pose the cross-check solver uses.
  _syncCw() {
    const pin = this.mechArmBody.pointToWorldFrame(this._mechPinLocal);
    this.mechCwBody.position.set(pin.x, pin.y - this._mechLc, 0);
    this.mechCwBody.quaternion.set(0, 0, 0, 1);
    this.mechCwBody.velocity.set(0, 0, 0);
    this.mechCwBody.angularVelocity.set(0, 0, 0);
  }

  // Fire: let gravity and the two hinges drive the arm (KINEMATIC -> DYNAMIC).
  // The counterweight is collision-free during the swing (mask 0) so the throw
  // matches the cross-validated reference exactly — no table contact mid-swing.
  releaseMechanism() {
    if (!this.mechArmBody) return;
    this.mechArmBody.type = CANNON.Body.DYNAMIC;
    this.mechCwBody.type = CANNON.Body.DYNAMIC;
    // setCocked left both bodies KINEMATIC (asleep, zero velocity).  Switching
    // type to DYNAMIC does NOT wake them, and cannon-es auto-sleep ignores
    // gravity torque -- a sleeping DYNAMIC arm would hang motionless at cock.
    this.mechArmBody.wakeUp();
    this.mechCwBody.wakeUp();
    this.mechCwBody.collisionFilterMask = 0; // free swing until the stop
    this._cwSettle = false; // never settle-ease while the arm swings
    this._releaseFreeMs = 400; // free-swing window: throw AND reverse both swing freely first
    // Re-hang the counterweight: the box stays on the live hinge throughout
    // (hover mode never slacks the hanger), but the next shot must still
    // re-assert the hinge equations — DO NOT call this._cwHinge.enable()
    // blindly: the Constraint class has NO top-level `enabled` flag (only
    // per-equation), so that guard was always true AND enable() re-enables ALL
    // equations -- including the RotationalMotorEquation (targetVelocity=0,
    // maxForce=1e6) which LOCKS the relative arm angle and rigidifies the box
    // (this was the hidden cause of speed collapsing 3.31 -> 1.66 m/s).
    // Re-enable only the first 5 equations (3 point + 2 rotational) and force
    // the motor off.
    if (this._cwHinge) {
      for (let i = 0; i < 5; i++) this._cwHinge.equations[i].enabled = true;
      this._cwHinge.motorEquation.enabled = false; // never drive the hinge
    }
    // Restore launch-phase damping (0.05 linear / 0.30 angular, cross-checked
    // with mech2d).  lockMechanism raised angularDamping to 0.95 for the
    // residual post-stop swing; it must be reset here or the next launch would
    // carry 0.95, damping the whipping rel-growth and rigidifying the box
    // (measured: speed collapsed 3.31 -> 1.61 m/s).
    this.mechCwBody.linearDamping = 0.05;
    this.mechCwBody.angularDamping = 0.30;
    this._applyInertia(this.mechArmBody, this._mechIcm);
    this._applyInertia(this.mechCwBody, this._mechCwMass * this._mechCwBox ** 2 / 6);
  }

  // Loaded-ball balance (ball-stand feature): after the player clicks the
  // ball into the cup the beam must swing freely under the REAL torque
  // balance — a seesaw, not a pinned arm.  Same as releaseMechanism but the
  // counterweight keeps its deck/table mask (4|2) so a heavy counterweight
  // settles onto the chassis naturally, and a heavy ball tips the beam
  // cup-down until step()'s logical ~45° stop ("left-tilted, cannot throw").
  unlockBalance() {
    if (!this.mechArmBody) return;
    this.mechArmBody.type = CANNON.Body.DYNAMIC;
    this.mechCwBody.type = CANNON.Body.DYNAMIC;
    this.mechArmBody.wakeUp();
    this.mechCwBody.wakeUp();
    this.mechCwBody.collisionFilterMask = 4 | 2 | 1; // settles on deck (2) / table (4)
    this._cwSettle = false;
    if (this._cwHinge) {
      for (let i = 0; i < 5; i++) this._cwHinge.equations[i].enabled = true;
      this._cwHinge.motorEquation.enabled = false;
    }
    this.mechCwBody.linearDamping = 0.05;
    this.mechCwBody.angularDamping = 0.30;
    this._applyInertia(this.mechArmBody, this._mechIcm);
    this._applyInertia(this.mechCwBody, this._mechCwMass * this._mechCwBox ** 2 / 6);
  }

  // After release: pin the arm at the stop angle.  The counterweight is NOT
  // teleported back to vertical — it stays dynamic, keeps swinging on the
  // hinge and falls onto the chassis deck (collision group 2) or the table
  // (group 4), coming to rest by its own contact + damping.  Natural, not
  // scripted.  Mask 4|2: the landing base ("0 point") is the chassis deck.
  lockMechanism() {
    if (!this.mechArmBody) return;
        this._releaseFreeMs = 0; // balance stops engage immediately
    this.mechArmBody.type = CANNON.Body.KINEMATIC;
    this.mechArmBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), this._mechRestAngle);
    const rot = this.mechArmBody.quaternion.vmult(this._mechRCom);
    this.mechArmBody.position.set(this._mechPivot.x + rot.x, this._mechPivot.y + rot.y, 0);
    this.mechArmBody.velocity.set(0, 0, 0);
    this.mechArmBody.angularVelocity.set(0, 0, 0);
    this.mechCwBody.type = CANNON.Body.DYNAMIC;
    this.mechCwBody.collisionFilterMask = 4 | 2 | 1; // table (4) + chassis deck (2) — safety net only
    this._cwSettle = true; // settle-ease the box back to its vertical hang
    // Post-lock angular damping: kills the residual +/-51 deg pendulum swing
    // that survives the stop.  cannon-es uses angularVelocity *= (1-d)^dt, so d
    // MUST be <1 (d=1.5 gives NaN).  0.95 leaves ~5%/s, fast enough.  This is
    // set AFTER release so it cannot touch the release-speed baseline.  The
    // hinge stays LIVE in hover mode: the box pendulum-decays on the pin and
    // step() eases it to the vertical hang (rel → +REST_ANGLE), floating
    // 20 mm above the deck — it is never slacked onto the deck.
    this.mechCwBody.angularDamping = 0.95;
  }

  getArmAngle() {
    if (!this.mechArmBody) return this._mechRestAngle;
    return 2 * Math.atan2(this.mechArmBody.quaternion.z, this.mechArmBody.quaternion.w);
  }

  getArmOmega() {
    return this.mechArmBody ? this.mechArmBody.angularVelocity.z : 0;
  }

  // Counterweight angle relative to the arm (for cwGroup.rotation.z).
  getCwRelAngle() {
    if (!this.mechArmBody || !this.mechCwBody) return 0;
    const rel = this.mechCwBody.quaternion.clone().mult(this.mechArmBody.quaternion.clone().inverse());
    return 2 * Math.atan2(rel.z, rel.w);
  }

  getPivotWorld() {
    return this._mechPivot;
  }

  createBlocks(scene, woodTexture) {
    this.blocks.forEach(b => this.world.removeBody(b));
    this.blockMeshes.forEach(m => scene.remove(m));
    this.blocks = [];
    this.blockMeshes = [];
    this.initialBlockPositions = [];
    this.blocksActivated = false;

    // 10 wooden toy blocks (4-3-2-1 pyramid)
    // Sized to the new projectile (0.45–0.60 kg, 60–80 mm ball): 0.11 m cubes
    // (~0.30 kg each, balsa) give a "real hit" instead of tiny lightweight bits.
    const blockSize = 0.11;
    const bw = blockSize;
    const bh = blockSize;
    const bd = blockSize;
    const halfExtents = new CANNON.Vec3(bw / 2, bh / 2, bd / 2);
    const blockGeom = new THREE.BoxGeometry(bw, bh, bd);
    this._blockTexture = woodTexture || null;
    // Two-state block look: IDLE = same wood as the trebuchet (0xe6cdab, balsa
    // texture), HIT = the previous natural wood tint once struck by the projectile.
    this.idleBlockMat = new THREE.MeshStandardMaterial({
      color: 0xe6cdab,   // matches trebuchet woodMat (trebuchet.js)
      roughness: 0.65,
      metalness: 0.05,
      map: woodTexture || null,
    });
    this.hitBlockMat = new THREE.MeshStandardMaterial({
      color: 0xf5eedc,   // knocked-down style = the current block look (morph final)
      roughness: 0.65,
      metalness: 0.05,
      map: woodTexture || null,
    });
    const blockMat = this.idleBlockMat;

    // 0.84 puts the pyramid front edge at x=0.664: the 31° flat release reaches
    // it at ~0.135 m height — below the 2nd-layer block's top edge, so the ball
    // strikes the 2nd-layer block's lower corner sideways (eccentric) and topples
    // it, instead of crushing the top of the pressed-down base layer.
    const targetCenterX = 0.84;
    const rows = [4, 3, 2, 1];

    let blockIndex = 0;
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      const y = 0.006 + bh / 2 + r * bh;
      const rowStartX = targetCenterX - ((count - 1) * bw) / 2;

      for (let c = 0; c < count; c++) {
        const currentBlockIndex = blockIndex;
        const x = rowStartX + c * bw;
        const z = 0;

        const body = new CANNON.Body({
          type: CANNON.Body.KINEMATIC,
          mass: 0.30,
          material: this.materials.woodMaterial,
          shape: new CANNON.Box(halfExtents),
          position: new CANNON.Vec3(x, y, z),
          linearDamping: 0.30,   // wood blocks settle, don't slide away
          angularDamping: 0.35,
        });

        body.addEventListener('collide', (e) => {
          const relativeVel = e.contact.getImpactVelocityAlongNormal();
          if (Math.abs(relativeVel) > 0.20) {
            sound.playBlockHit(Math.min(1.0, Math.abs(relativeVel) / 2.5));
            // Report whether this was the projectile itself, rather than a
            // secondary block-on-block collision during the collapse.
            if (this.onBlockHit) {
              this.onBlockHit(currentBlockIndex, relativeVel, e.body === this.ballBody);
            }
          }
        });
        body.userData = { hit: 'block' };

        this.world.addBody(body);
        this.blocks.push(body);

        const mesh = new THREE.Mesh(blockGeom, blockMat.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(x, y, z);

        // Pencil edge line around blocks matching hand-drawn craft aesthetic
        const edges = new THREE.EdgesGeometry(blockGeom);
        const edgeLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x826442, transparent: true, opacity: 0.60 })
        );
        mesh.add(edgeLine);

        scene.add(mesh);
        this.blockMeshes.push(mesh);
        this.initialBlockPositions.push({ x, y, z });
        blockIndex++;
      }
    }
  }

  activateBlocks() {
    this.blocksActivated = true;
    this._settled = false;
    this._wakeTime = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.type !== CANNON.Body.DYNAMIC) {
        b.type = CANNON.Body.DYNAMIC;
        b.mass = 0.14;
        b.updateMassProperties();
      }
      b.wakeUp();
    }
  }

  // Drop the projectile from the world/scene.  Called before every launch:
  // a stale ball body resting among the blocks would shove the woken pile on
  // the next fire (the "invisible impact" bug) — the fresh shot rebuilds it.
  removeProjectile(scene) {
    if (this.ballBody) {
      this.world.removeBody(this.ballBody);
      this.ballBody = null;
    }
    if (this.ballMesh) {
      if (scene) scene.remove(this.ballMesh);
      this.ballMesh = null;
    }
  }

  createProjectile(scene) {
    this.removeProjectile(scene);

    // Projectile — radius from the bowl-opening ratio (see setBall): default
    // 0.45 kg -> r 30 mm = 60% of the 0.05 m bowl inner radius; max 0.60 kg
    // -> r 40 mm = 80%.  Metal render stays consistent across the slider.
    const radius = this.ballRadius;
    const ballShape = new CANNON.Sphere(radius);

    this.ballBody = new CANNON.Body({
      type: CANNON.Body.DYNAMIC,
      mass: this.ballKg,
      material: this.materials.metalMaterial,
      shape: ballShape,
      linearDamping: 0.01,
      angularDamping: 0.05,
    });

    this.world.addBody(this.ballBody);
    // Ball is collision-free while seated (pinned in cup / on stand): it only
    // starts colliding the moment releaseBall() flips the mask (2026-09-30).
    // Otherwise the seated ball overlaps the new chassis body at the release
    // pose (cup swings down over the deck) and the solver spits it out.
    this.ballBody.collisionFilterGroup = 1;
    this.ballBody.collisionFilterMask = 0;
    this.ballShape = ballShape;

    // Play the material-appropriate hit sound whenever the ball (in flight)
    // strikes anything: blocks keep playBlockHit; the pencil, eraser, whole
    // trebuchet and ball stand get their own timbre via playHit (2026-10-01).
    this.ballBody.addEventListener('collide', (e) => {
      if (!this.ballReleased) return;
      const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (relVel > 0.3) {
        const kind = (e.body && e.body.userData && e.body.userData.hit) || 'block';
        const intensity = Math.min(1.0, relVel / 3);
        if (kind === 'block') {
          sound.playBlockHit(intensity);
        } else {
          sound.playHit(kind, intensity);
        }
        this._impactMomentum = Math.max(this._impactMomentum, this.ballKg * relVel);
      }
    });

    const geom = new THREE.SphereGeometry(radius, 32, 32);
    // Polished steel look — now physically consistent (0.10 kg solid steel).
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcfd6e0,
      metalness: 0.90,
      roughness: 0.15,
    });
    this.ballMesh = new THREE.Mesh(geom, mat);
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    if (this.envMapTexture) {
      mat.envMap = this.envMapTexture;
      mat.envMapIntensity = 1.0;
    }
    scene.add(this.ballMesh);

    this.ballReleased = false;
    this._impactMomentum = 0; // kg·m/s, max over the flight (POWER readout)
    this.ballBody.sleep();
  }

  resetImpact() {
    this._impactMomentum = 0;
  }

  isBlockDowned(i) {
    const b = this.blocks[i];
    const initPos = this.initialBlockPositions[i];
    if (!initPos || !b) return false;
    const dx = b.position.x - initPos.x;
    const dy = b.position.y - initPos.y;
    const dz = b.position.z - initPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const up = new CANNON.Vec3(0, 1, 0);
    const currentUp = b.quaternion.vmult(up);
    const isUpright = currentUp.y > 0.85;
    return !isUpright || dist > 0.045 || Math.abs(dy) > 0.030;
  }

  getDownedBlocksCount() {
    let count = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.isBlockDowned(i)) count++;
    }
    return count;
  }

  // KNOCKED-DOWN visual: a block keeps the trebuchet wood while standing and
  // switches to the hit style only while it is actually downed — the SAME live
  // verdict as the DOWN counter, so the colored count always equals DOWN x/10
  // (a block that recovers upright switches back to the idle wood).
  updateBlockHitVisuals() {
    for (let i = 0; i < this.blocks.length; i++) {
      const mesh = this.blockMeshes[i];
      if (!mesh) continue;
      if (this.isBlockDowned(i)) {
        if (!mesh.userData.hitMarked) {
          mesh.userData.hitMarked = true;
          mesh.material.dispose();
          mesh.material = this.hitBlockMat.clone();
        }
      } else if (mesh.userData.hitMarked) {
        mesh.userData.hitMarked = false;
        mesh.material.dispose();
        mesh.material = this.idleBlockMat.clone();
      }
    }
  }

  step(delta) {
    // Fixed timestep for stable physics.  1/240 Hz matches the cross-validated
    // cannon_trebuchet.mjs reference (release within ~1° of the ideal 39.8°);
    // 1/60 Hz overdrew ~2% speed and landed ~0.2 m short of the pyramid.
    const fixedDt = 1/240;
    this._acc = (this._acc || 0) + Math.min(delta, 0.1);
    while (this._acc >= fixedDt) {
      this.world.step(fixedDt);
      this._acc -= fixedDt;
    }

    // Seesaw-inversion limit: when the ball outweighs the counterweight the arm
    // naturally rotates cup-up (no slider clamp — real seesaw physics), but its
    // arc sweeps over the chassis right end, so past ~45° the cup would sink
    // into the deck.  A physical stopper cannot separate this from the normal
    // throw arc (both pass the same space), so the limit is logical: past
    // +0.78 rad the arm is pinned KINEMATIC in place (cup bottom still ~30 mm
    // above the deck top — visually "held by the chassis", never embedded).
    // Normal throws never get here: release fires at REST_ANGLE and
    // lockMechanism pins the arm.  The counterweight stays dynamic (mask 4|2)
    // and settles naturally.
    const armAng = this.getArmAngle();
    const armSpin = this.mechArmBody ? this.mechArmBody.angularVelocity.z : 0;
    // A throw releases at +85 deg and swings back (armSpin < 0) — never lock that.
    // The reverse case (ball outweighs cw after release) spins cup-ward (armSpin > 0)
    // and must be stopped before the cup sweeps into the chassis, but only AFTER a
    // short free-swing window so the arm is actually moving when the stop engages
    // (locking at the release angle reads as "stuck", not "held by the chassis").
    if (this._releaseFreeMs > 0) {
      this._releaseFreeMs -= fixedDt * 1000;
    } else if (this.mechArmBody && this.mechArmBody.type === CANNON.Body.DYNAMIC && armAng > 0.75 && armSpin > 0.05) {
      this.mechArmBody.type = CANNON.Body.KINEMATIC;
      this.mechArmBody.velocity.set(0, 0, 0);
      this.mechArmBody.angularVelocity.set(0, 0, 0);
      this.mechCwBody.collisionFilterMask = 4 | 2 | 1; // box may swing back onto the deck
      this._cwSettle = true;
    }

    // Counterweight hover-settle (post-lock only; _cwSettle is false during the
    // whole launch swing, so this never steals energy from the throw).
    //
    // HOVER MODEL (user directive 1, 2026-09-28 — replaces the deck-rest model):
    //  - During launch the box is a true free 2-DOF pendulum on the live hinge
    //    (mask 0); release speed comes from the unclamped whip.
    //  - After the arm hits the stop it is pinned KINEMATIC; the box keeps its
    //    residual swing on the live hinge (mask 4|2 = table + chassis deck — a
    //    safety net only; with the 20 mm rest gap and ≥10 mm transient
    //    clearance it should never actually contact).
    //  - The hanger NEVER goes slack: the box pendulum-decays under the 0.95
    //    angularDamping set in lockMechanism and naturally seeks the vertical
    //    hang (minimum potential).  Once slow we ease the world roll ph to 0 —
    //    the box hangs straight down from the pin (rel → +REST_ANGLE, box
    //    centre at pin − Lc), floating above the deck.  No position clamp, no
    //    deck contact, no teleport.
    if (this._cwSettle && this.mechCwBody) {
      const cw = this.mechCwBody;
      const Z = new CANNON.Vec3(0, 0, 1);
      const ph = 2 * Math.atan2(cw.quaternion.z, cw.quaternion.w); // world roll
      const slow = Math.hypot(cw.velocity.x, cw.velocity.y) < 0.15
                && Math.abs(cw.angularVelocity.z) < 0.6;
      if (slow && Math.abs(ph) > 0.02 && Math.abs(ph) < 0.6) {
        // Near equilibrium: gently ease the world roll to vertical AND damp the
        // residual spin in the same step (a bare quaternion nudge would inject
        // energy into a still-moving pendulum).  Large swings (|ph|>=0.6) are
        // left to the hinge + 0.95 angularDamping alone.
        cw.quaternion.setFromAxisAngle(Z, ph * 0.88);
        cw.angularVelocity.z *= 0.92;
      } else if (slow && Math.abs(ph) <= 0.02) {
        cw.quaternion.setFromAxisAngle(Z, 0);
        cw.velocity.set(0, 0, 0);
        cw.angularVelocity.set(0, 0, 0);
      }
    }

    for (let i = 0; i < this.blocks.length; i++) {
      this.blockMeshes[i].position.copy(this.blocks[i].position);
      this.blockMeshes[i].quaternion.copy(this.blocks[i].quaternion);
    }

    // Auto-sleep blocks once they settle after a collision (with grace period)
    if (this.blocksActivated && !this._settled) {
      if (this._wakeTime === undefined) this._wakeTime = 0;
      this._wakeTime += delta;
      // Wait at least 2 seconds after activation before checking stillness
      if (this._wakeTime > 2.0) {
        let allStill = true;
        for (const b of this.blocks) {
          if (b.type !== CANNON.Body.DYNAMIC) continue;
          const v = Math.abs(b.velocity.x) + Math.abs(b.velocity.y) + Math.abs(b.velocity.z);
          const w = Math.abs(b.angularVelocity.x) + Math.abs(b.angularVelocity.y) + Math.abs(b.angularVelocity.z);
          if (v > 0.02 || w > 0.02) { allStill = false; break; }
        }
        if (allStill) {
          this._settled = true;
          this.settleBlocks();
        }
      }
    }

    if (this.ballReleased && this.ballBody && this.ballMesh) {
      this.ballMesh.position.copy(this.ballBody.position);
      this.ballMesh.quaternion.copy(this.ballBody.quaternion);

      // Trigger dynamic activation well BEFORE the ball reaches the pyramid:
      // blocks start KINEMATIC, and a DYNAMIC-vs-KINEMATIC hit bounces the ball
      // off an immovable wall (measured: ball hit row-2 block at x=0.765, bounced
      // with vx reversed, blocks down=0).  Activating at x>0.58 gives blocks
      // ~0.1 s to settle as DYNAMIC before the ball arrives.
      if (!this.blocksActivated && this.ballBody.position.x > 0.58 && this.ballBody.position.x < 1.30) {
        this.activateBlocks();
        this._settled = false;
      }

      const landY = 0.006 + this.ballRadius + 0.006; // radius-aware landing threshold (bigger steel balls rest higher)
      if (this.ballBody.position.y <= landY && Math.abs(this.ballBody.velocity.y) < 0.20) {
        if (this.onBallLand) this.onBallLand(this.ballBody.position.x);
      }
    }
  }

  resetBlocks() {
    this.blocksActivated = false;
    this._settled = false;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const init = this.initialBlockPositions[i];
      b.type = CANNON.Body.KINEMATIC;
      b.position.set(init.x, init.y, init.z);
      b.quaternion.set(0, 0, 0, 1);
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      this.blockMeshes[i].position.copy(b.position);
      this.blockMeshes[i].quaternion.copy(b.quaternion);
    }
  }

  // Multi-stage morph: f=0 sketch, 0.33 paper, 0.66 white, 1.0 textured
  setMorphFactor(f) {
    // Blocks
    let blockMat;
    if (f < 0.34) {
      blockMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.85 });
    } else if (f < 0.67) {
      blockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    } else {
      // Final stage: idle blocks use the same wood as the trebuchet (0xe6cdab);
      // knocked-down blocks keep the hit style set by updateBlockHitVisuals.
      blockMat = new THREE.MeshStandardMaterial({
        color: 0xe6cdab, roughness: 0.65, metalness: 0.05,
        map: this._blockTexture || null,
      });
    }
    for (const m of this.blockMeshes) {
      m.material = blockMat;
    }

    // Ball
    if (this.ballMesh) {
      let ballMat;
      if (f < 0.34) {
        ballMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.85 });
      } else if (f < 0.67) {
        ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      } else {
        ballMat = new THREE.MeshStandardMaterial({
          color: 0xcfd6e0, metalness: 0.90, roughness: 0.15,
        });
        if (this.envMapTexture) {
          ballMat.envMap = this.envMapTexture;
          ballMat.envMapIntensity = 1.0;
        }
      }
      this.ballMesh.material = ballMat;
    }
  }

  // Put blocks to sleep after they settle — make them STATIC so window resizing
  // or idle physics steps cannot cause any jitter or collision response.
  settleBlocks() {
    for (const b of this.blocks) {
      b.type = CANNON.Body.STATIC;
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
    }
  }

  // Wake all blocks before a new shot: restore DYNAMIC so collisions register.
  wakeBlocks() {
    this._settled = false;
    this._wakeTime = 0;
    for (const b of this.blocks) {
      if (b.type !== CANNON.Body.DYNAMIC) {
        b.type = CANNON.Body.DYNAMIC;
        b.mass = 0.14;
        b.updateMassProperties();
      }
      b.wakeUp();
    }
  }
}
