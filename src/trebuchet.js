import * as THREE from 'three';
import { GEOM } from './spec.js';

// Helper to construct a clean wooden beam between two points
function createBeamBetween(p1, p2, width, depth, material) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const length = dir.length();
  const geom = new THREE.BoxGeometry(width, length, depth);
  const mesh = new THREE.Mesh(geom, material);

  // Position at midpoint
  mesh.position.addVectors(p1, p2).multiplyScalar(0.5);

  // Default BoxGeometry is vertical along Y (0, 1, 0)
  const yAxis = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion().setFromUnitVectors(yAxis, dir.clone().normalize());
  mesh.quaternion.copy(quat);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Construct a round metal link between two arbitrary points.  The
// counterweight hangers use this instead of vertical cylinders so both rods
// visibly meet the same bearing pin at the arm end.
function createRodBetween(p1, p2, radius, material, segments = 12) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, dir.length(), segments),
    material
  );
  mesh.position.addVectors(p1, p2).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class TrebuchetModel {
  constructor(scene, woodTexture, leadTexture) {
    this.scene = scene;

    this.group = new THREE.Group();
    // Position on the sheet of paper (left side)
    this.group.position.set(-0.72, 0.006, 0);

    // Materials
    this.woodMat = new THREE.MeshStandardMaterial({
      color: 0xe6cdab,
      roughness: 0.65,
      metalness: 0.05,
      map: woodTexture || null,
    });
    this.darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x8a6745,
      roughness: 0.75,
      metalness: 0.05,
      map: woodTexture || null,
    });
    this.metalPinMat = new THREE.MeshStandardMaterial({
      color: 0xc8cdd4,
      metalness: 0.9,
      roughness: 0.15,
    });
    // Light metal = axles, bolts, hanger rods. Dark metal = bearing bushings
    // and hex nuts — the fixed hardware reads as a distinct darker tone.
    this.darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x767c83, // steel grey: darker than the light pins but not near-black
      metalness: 0.85,
      roughness: 0.35,
    });
    this.clearBoxMat = new THREE.MeshPhysicalMaterial({
      color: 0xb8c5d1,
      transparent: true,
      opacity: 0.22,
      transmission: 0.20,
      roughness: 0.18,
      metalness: 0.05,
      ior: 1.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sandMat = new THREE.MeshStandardMaterial({
      color: 0xc49a5c,
      roughness: 0.95,
      metalness: 0.0,
    });
    // Paper-craft stage: flat white paper
    this.paperMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e8, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide,
    });
    // White model stage: matte white
    this.whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.5, metalness: 0.0, side: THREE.DoubleSide,
    });

    this.chassis = new THREE.Group();
    this.armPivot = new THREE.Group();
    this.cwGroup = null;
    this.counterweightMesh = null;
    this.sandMesh = null;
    this.cupMesh = null;
    this.cupWorldPos = new THREE.Vector3();
    this.cwWorldPos = new THREE.Vector3();

    // Dimensions (scale anchor: 1 scene unit = 1 m)
    this.LONG_ARM = GEOM.LONG_ARM; // long arm (throwing side, backwards/-X) — spec.js
    // SHORT_ARM 0.20 -> 0.315 implements audit fix plan A (pin 0.185 -> 0.30):
    // the counterweight hanger pin sits at SHORT_ARM - 0.015 = 0.30, making the
    // 3.5:1 lever ratio workable with a light projectile. Verified by mech2d
    // (3.588 m/s, 39.8°, land x = 0.870) and Cannon-es cross-check (V2).
    this.SHORT_ARM = GEOM.SHORT_ARM; // short arm (counterweight side) — spec.js
    this.CW_HANG = GEOM.CW_HANG; // hanging link length — spec.js

    // Pivot height at apex of A-frame
    this.apexX = GEOM.apexX; // spec.js
    // HOVER calibration (user directive 1, 2026-09-28): the counterweight box
    // must STAY OFF the chassis deck.  In the rest pose setArmAngle() gives
    // cwGroup.rotation.z = -REST_ANGLE = +1.00, so the box hangs vertical below
    // the short-arm pin: box centre world y = cwGroupY - 0.165, where
    // cwGroupY = apexY + chassisY(0.006) - 0.30·sin(1.00) = apexY - 0.246.
    // Box bottom = apexY - 0.411 - 0.065 = apexY - 0.476.
    // Deck top = 0.10; hover gap g = 0.020 chosen so the box floats visibly
    // (gap ≈ 15% of the 0.13 box) AND the transient pendulum swing (worst dip
    // ~9 mm below the vertical-hang bottom at ~16° tilt, static geometry) still
    // clears the deck by ≥10 mm.  => apexY - 0.476 = 0.10 + 0.020 => 0.5964.
    this.apexY = GEOM.apexY; // spec.js (hover: box bottom 20 mm above deck top)

    // REST_ANGLE (pull 0°):
    // Short arm is angled down towards chassis floor.
    // The counterweight rests cleanly on the chassis floor between the front wheels.
    // Long arm is tilted up-left at ~50° to horizontal.
    this.REST_ANGLE = GEOM.REST_ANGLE; // ~ -57.3° stop; releases the ball at ~31° (flatter,
    // side-ways hit on the pyramid — physics-calibrated, see mech2d sweep)

    // Cup & 3D wooden cradle dimensions
    this.cupR = GEOM.cupR; // == MECH.cup_ri — spec.js
    this.cradleThick = 0.020;
    this.cradleOuterR = this.cupR + this.cradleThick;
    this.cupCenterX = GEOM.cupCenterX; // derived -LONG_ARM - cupR + 0.02 — spec.js
    this.cupCenterY = 0.021;

    // Physical ground limit: cradle bottom touches paper surface at Y = 0.006.
    // Analytical solution: ~84.58°. Capped at 84.5° so the spoon rests on paper without penetration.
    this.maxPullDeg = 84.5;

    this.buildChassis();
    this.buildArm();

    this.group.add(this.chassis);
    this.group.add(this.armPivot);
    this.scene.add(this.group);

    // Save original materials for smooth morph transitions
    this.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.userData.origMaterial = obj.material;
      }
    });

    // Dynamic blend material for seamless transitions
    this.blendMat = new THREE.MeshStandardMaterial({
      color: 0xf5f0e8,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    this.setPullAngle(0);
  }

  buildChassis() {
    const w = this.woodMat;
    const dw = this.darkWoodMat;
    const p = this.metalPinMat;

    // Chassis: a single thickened deck box (the counterweight landing and the
    // A-frame foot).  The box is deep enough for the wheel axles to pass
    // through it — the axles run inside the box, wheels stay exposed outside
    // (z ±0.15) and the crossbeam sits inside the box flush with the deck top.
    const dm = this.darkMetalMat; // dark metal: bushings + hex nuts
    const railY = 0.08;       // kept as the A-frame foot reference (deck top)
    const railZ = 0.125;      // A-frame legs stand at z ±0.125 on the deck
    const railLen = 0.76;     // chassis x ∈ [-0.38, 0.38] (world -1.10 .. -0.34)
    const railHeight = 0.045;
    const deckTopY = 0.10;    // box top surface (unchanged: cw hover / A-frame / physics)
    const boxDepthY = 0.07;   // thickened deck box: y ∈ [0.03, 0.10] — encloses the
                              // wheel axles (axle y=0.065, r=0.010 -> 0.055..0.075)
    const boxHalfZ = 0.145;   // deck widened to carry the A-frame feet (legs at
                              // z ±0.125, depth 0.032 -> outer edge 0.141); wheels
                              // moved outward so the deck never touches them

    // 2. Single crossbeam at the centre main-post (apex x=0.02), embedded in
    // the deck box with its top face FLUSH with the deck top (was proud 2.5 mm).
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, railHeight, boxHalfZ * 2),
      w
    );
    cross.position.set(0.02, deckTopY - railHeight / 2, 0);
    cross.castShadow = true;
    cross.receiveShadow = true;
    this.chassis.add(cross);

    // 2b. Thickened deck box (counterweight landing / A-frame foot).  Same top
    // surface as before; the extra depth wraps the wheel axles so they pass
    // THROUGH the box instead of the box sitting on top of them.
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(railLen, boxDepthY, boxHalfZ * 2),
      w
    );
    deck.position.set(0.0, deckTopY - boxDepthY / 2, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.chassis.add(deck);
    this.chassisMesh = deck; // tour label anchor

    // 2c. (side/end walls removed per user: open platform, wheels visible)

    // 2d. Foot sills (wood joinery): a ground beam sits on the widened deck
    // under each A-frame leg row (z ±0.125).  The three leg feet (rear -0.20,
    // centre apex 0.02, front 0.24) stand INTO the sill — a plinth joint that
    // visibly roots the uprights to the chassis (no floating legs).  Two
    // draw-bore metal pins per sill make the fastening explicit.
    const sillLen = 0.52;    // x -0.24 .. 0.28, covers all three feet
    const sillDepth = 0.040; // wider than the 0.032-deep legs, outer edge flush
                             // with the deck edge (±0.145) — never overhangs
    const sillThick = 0.02;  // proud of the deck top; legs insert into it
    [-railZ, railZ].forEach(z => {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(sillLen, sillThick, sillDepth), w);
      sill.position.set(0.02, deckTopY + sillThick / 2, z);
      sill.castShadow = true;
      sill.receiveShadow = true;
      this.chassis.add(sill);
      [-0.13, 0.17].forEach(sx => {
        // Bolt + hex nut: the shank is driven vertically INTO the sill, and a
        // hexagonal nut sits on top (visible fastener, woodworking convention).
        const nail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.004, 0.004, 0.018, 12),
          p
        );
        nail.position.set(sx, deckTopY + sillThick - 0.004, z); // 13mm embedded
        nail.castShadow = true;
        this.chassis.add(nail);
        const nut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.007, 0.007, 0.006, 6), // hexagon
          dm
        );
        nut.rotation.y = Math.PI / 6; // flat face to the viewer
        // Nut wound fully down: its bottom face sits FLUSH with the sill top.
        nut.position.set(sx, deckTopY + sillThick + 0.003, z);
        nut.castShadow = true;
        this.chassis.add(nut);
      });
    });

    // 3. Four craft wooden wheels with metal hub pins
    const wheelRadius = 0.065;
    const wheelThickness = 0.028;
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 24);
    wheelGeom.rotateX(Math.PI / 2);

    // Wheels move OUTWARD (axles lengthened) so the widened chassis never
    // touches them: inner wheel face z=±0.191 clears the deck edge ±0.145
    // by 46 mm, leaving the A-frame feet room to stand firmly on the deck.
    const wheelDistZ = railZ + 0.08; // ±0.205 (was ±0.151)
    const wheelAxleLength = wheelDistZ * 2 + wheelThickness * 2 + 0.004;
    const axleGeom = new THREE.CylinderGeometry(0.010, 0.010, wheelAxleLength, 16);
    axleGeom.rotateX(Math.PI / 2);

    [-0.22, 0.22].forEach(x => {
      // Axle through chassis
      const axle = new THREE.Mesh(axleGeom, p);
      axle.position.set(x, 0.065, 0);
      axle.castShadow = true;
      this.chassis.add(axle);

      // Metal bearing bushings where the axle pierces the deck walls: the
      // axle rotates INSIDE a bushing, never directly against the wood
      // (a wooden journal would bind).  One bushing on each deck side.
      [-1, 1].forEach(side => {
        const bushing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16).rotateX(Math.PI / 2),
          dm
        );
        bushing.position.set(x, 0.065, side * (boxHalfZ + 0.004));
        bushing.castShadow = true;
        this.chassis.add(bushing);
      });

      // Wheels on both sides (wheelDistZ defined above)
      [-wheelDistZ, wheelDistZ].forEach(z => {
        const wheel = new THREE.Mesh(wheelGeom, dw);
        wheel.position.set(x, 0.065, z);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        this.chassis.add(wheel);
        if (!this.wheelMesh && z > 0) this.wheelMesh = wheel; // tour label anchor

        // Near-flush metal bearing cap: it is seated in the wooden wheel
        // instead of floating far beyond the wheel surface.
        const hubLength = 0.020;
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, hubLength, 24).rotateX(Math.PI / 2),
          dm
        );
        hub.position.copy(wheel.position);
        // A 1mm proud offset avoids coplanar z-fighting while keeping the
        // bearing cap seated almost entirely inside the wooden wheel.
        hub.position.z += Math.sign(z) * (wheelThickness / 2 - hubLength / 2 + 0.001);
        hub.castShadow = true;
        this.chassis.add(hub);

        // Inner bushing: dark metal ring where the axle enters the wheel on
        // the chassis side — mirrors the deck-wall bushing on the other end of
        // the exposed axle span, so the axle turns in metal at both supports.
        const innerBushing = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16).rotateX(Math.PI / 2),
          dm
        );
        innerBushing.position.set(x, 0.065, z - Math.sign(z) * 0.010);
        innerBushing.castShadow = true;
        this.chassis.add(innerBushing);
      });
    });

    // 4. Two Upright A-Frames (one on near side, one on far side)
    const legWidth = 0.038;
    const legDepth = 0.032;
    const apexPoint = new THREE.Vector3(this.apexX, this.apexY, 0);

    [-railZ, railZ].forEach(z => {
      const topP = new THREE.Vector3(this.apexX, this.apexY, z);
      const rearBottom = new THREE.Vector3(-0.20, deckTopY, z);
      const frontBottom = new THREE.Vector3(0.24, deckTopY, z);
      const midBottom = new THREE.Vector3(this.apexX, deckTopY, z);

      // Rear slanted leg
      this.chassis.add(createBeamBetween(rearBottom, topP, legWidth, legDepth, w));

      // Front slanted leg
      const frontLeg = createBeamBetween(frontBottom, topP, legWidth, legDepth, w);
      this.chassis.add(frontLeg);
      if (!this.aframeMesh) this.aframeMesh = frontLeg; // tour label anchor

      // Center vertical post
      this.chassis.add(createBeamBetween(midBottom, topP, legWidth * 0.9, legDepth, w));

      // Horizontal cross-tie halfway up
      const crossTieY = 0.23;
      const t = (crossTieY - deckTopY) / (this.apexY - deckTopY);
      const crossTieRearX = THREE.MathUtils.lerp(-0.20, this.apexX, t);
      const crossTieFrontX = THREE.MathUtils.lerp(0.24, this.apexX, t);
      this.chassis.add(createBeamBetween(
        new THREE.Vector3(crossTieRearX, crossTieY, z),
        new THREE.Vector3(crossTieFrontX, crossTieY, z),
        0.030, legDepth, w
      ));
    });

    // 5. Wooden bearing housings and the single main axle at the apex.
    // The housings give the shaft a solid wooden seat and cover the angled
    // leg ends, so no metal shaft can spill outside the triangular frame.
    const bearingWidth = 0.084;
    const bearingHeight = 0.074;
    const bearingDepth = 0.046;
    [-railZ, railZ].forEach(z => {
      const bearingBlock = new THREE.Mesh(
        new THREE.BoxGeometry(bearingWidth, bearingHeight, bearingDepth),
        w
      );
      bearingBlock.position.set(this.apexX, this.apexY, z);
      bearingBlock.castShadow = true;
      bearingBlock.receiveShadow = true;
      this.chassis.add(bearingBlock);
    });

    // The main shaft ends 3mm inside each wooden bearing housing.  There is
    // only one shaft now; the old duplicate pin on armPivot caused the dark
    // ghosting seen around the collar.
    const axleLen = railZ * 2 + bearingDepth - 0.006;
    const apexAxle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, axleLen, 16).rotateX(Math.PI / 2),
      p
    );
    apexAxle.position.set(this.apexX, this.apexY, 0);
    apexAxle.castShadow = true;
    this.chassis.add(apexAxle);
    this.pivotMesh = apexAxle; // tour label anchor

    // Silver bearing caps are flush with the outside of the wooden housings.
    const bearingCapThickness = 0.006;
    [-railZ, railZ].forEach(z => {
      const side = Math.sign(z);
      const bearingCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, bearingCapThickness, 24).rotateX(Math.PI / 2),
        p
      );
      bearingCap.position.set(
        this.apexX,
        this.apexY,
        z + side * (bearingDepth / 2 - bearingCapThickness / 2 + 0.001)
      );
      bearingCap.castShadow = true;
      this.chassis.add(bearingCap);

      // Dark metal bushing where the main shaft passes through the housing:
      // the arm pivot turns in the bushing, never directly in the wood.
      // Sized proud of the housing face so it is clearly visible next to the
      // light shaft and silver end cap.
      const apexBushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.014, 20).rotateX(Math.PI / 2),
        dm
      );
      apexBushing.position.set(
        this.apexX,
        this.apexY,
        z + side * (bearingDepth / 2 + 0.001)
      );
      apexBushing.castShadow = true;
      this.chassis.add(apexBushing);

      // Inner bushing on the housing's chassis-side face (mirror of the outer
      // one) — the shaft is bushed at BOTH ends of its passage through wood.
      const innerApexBushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.014, 20).rotateX(Math.PI / 2),
        dm
      );
      innerApexBushing.position.set(
        this.apexX,
        this.apexY,
        z - side * (bearingDepth / 2 + 0.001)
      );
      innerApexBushing.castShadow = true;
      this.chassis.add(innerApexBushing);
    });

    // Pivot group positioned at the apex
    this.armPivot.position.copy(apexPoint);
  }

  buildArm() {
    const w = this.woodMat;
    const dw = this.darkWoodMat;
    const p = this.metalPinMat;
    const dm = this.darkMetalMat;

    // 1. Main beam and spoon joint — one continuous wooden profile.  The
    // previous version used a separate diagonal block; its inner edge could
    // still show through the bowl.  This profile follows the outside of the
    // lower bowl, so the lever is fused to the spoon without entering the
    // ball cavity.
    const cupR = 0.05;
    const cupCenterX = -this.LONG_ARM - cupR + 0.02;
    const cupTilt = 0;
    const cupRimX = cupCenterX + cupR;
    const armEndX = cupRimX + 0.004;
    const armShape = new THREE.Shape();
    armShape.moveTo(armEndX, 0.021);
    armShape.lineTo(this.SHORT_ARM, 0.021);
    armShape.lineTo(this.SHORT_ARM, -0.021);
    armShape.lineTo(armEndX, -0.021);
    armShape.closePath();

    const armGeom = new THREE.ExtrudeGeometry(armShape, {
      depth: 0.034,
      bevelEnabled: false,
      curveSegments: 2,
    });
    armGeom.translate(0, 0, -0.017);
    const armStructure = new THREE.Mesh(armGeom, w);

    // Bearings on the lever itself: dark metal rings where the pivot shaft
    // passes through the arm sides (arm depth 0.034 -> z ±0.017).  The lever
    // rotates on the shaft through these bushings, not wood against metal.
    const armDepth = 0.034;
    [-1, 1].forEach(side => {
      const armBushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.010, 20).rotateX(Math.PI / 2),
        dm
      );
      armBushing.position.set(0, 0, side * (armDepth / 2 + 0.002));
      armBushing.castShadow = true;
      this.armPivot.add(armBushing);
    });
    armStructure.castShadow = true;
    armStructure.receiveShadow = true;
    this.armPivot.add(armStructure);
    this.armMesh = armStructure; // tour label anchor

    // Wooden reinforcement collar around pivot
    const pivotCollar = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.052, 0.040),
      dw
    );
    pivotCollar.castShadow = true;
    this.armPivot.add(pivotCollar);

    // The single chassis axle passes through this wooden collar.  Do not add
    // a second coincident pin here: duplicate cylinders were the source of
    // the residual/ghosting around the pivot.

    // 2. Wooden cup/bowl (3D 半球木托) — single solid closed manifold mesh with real physical thickness.
    // Seamlessly integrates the inner ball cavity and the outer wooden shell into one solid piece.
    // Outward-facing normals everywhere prevent hollow/transparent culling artifacts from any viewing angle.
    const cradleThick = 0.020;
    const cradleOuterR = cupR + cradleThick;

    const bowlPoints = [];
    const arcSegs = 20;
    // Outer profile: from bottom center (0, -cradleOuterR) up to outer rim (cradleOuterR, 0)
    for (let i = 0; i <= arcSegs; i++) {
      const a = -Math.PI / 2 + (Math.PI / 2) * (i / arcSegs);
      bowlPoints.push(new THREE.Vector2(
        Math.max(0, cradleOuterR * Math.cos(a)),
        cradleOuterR * Math.sin(a)
      ));
    }
    // Inner profile: from inner rim (cupR, 0) down to inner bowl floor (0, -cupR)
    for (let i = arcSegs; i >= 0; i--) {
      const a = -Math.PI / 2 + (Math.PI / 2) * (i / arcSegs);
      bowlPoints.push(new THREE.Vector2(
        Math.max(0, cupR * Math.cos(a)),
        cupR * Math.sin(a)
      ));
    }

    const cupGeom = new THREE.LatheGeometry(bowlPoints, 36);
    this.cupMesh = new THREE.Mesh(cupGeom, w);
    this.cupMesh.position.set(cupCenterX, 0.021, 0);
    this.cupMesh.rotation.z = cupTilt;
    this.cupMesh.castShadow = true;
    this.cupMesh.receiveShadow = true;
    this.armPivot.add(this.cupMesh);

    // 3. Counterweight assembly — a wooden bearing seat at the arm end
    // carries one transverse pin shared by both hanger links.
    const cwPivotX = GEOM.cwPivotX; // SHORT_ARM - 0.015 — spec.js
    const cwBearingWidth = 0.074;
    const cwBearingHeight = 0.055;
    const cwBearingDepth = 0.054;
    const cwBearingBlock = new THREE.Mesh(
      new THREE.BoxGeometry(cwBearingWidth, cwBearingHeight, cwBearingDepth),
      w
    );
    cwBearingBlock.position.set(cwPivotX, 0, 0);
    cwBearingBlock.castShadow = true;
    cwBearingBlock.receiveShadow = true;
    this.armPivot.add(cwBearingBlock);

    this.cwGroup = new THREE.Group();
    this.cwGroup.position.set(cwPivotX, 0, 0);

    // One shared bearing pin passes through the wooden seat.  The pin is
    // recessed; only its two small silver end caps remain visible.
    const cwPinLength = cwBearingDepth - 0.008;
    const tipPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, cwPinLength, 20).rotateX(Math.PI / 2),
      p
    );
    tipPin.castShadow = true;
    this.armPivot.add(tipPin);

    const cwCapThickness = 0.005;
    [-1, 1].forEach(side => {
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.010, cwCapThickness, 20).rotateX(Math.PI / 2),
        p
      );
      cap.position.set(
        cwPivotX,
        0,
        side * (cwBearingDepth / 2 - cwCapThickness / 2 + 0.001)
      );
      cap.castShadow = true;
      this.armPivot.add(cap);

      // Dark metal bushing where the bearing pin exits the wooden seat — the
      // hanger links pivot in these bushings, not directly in the wood.
      const cwBushing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, 0.010, 16).rotateX(Math.PI / 2),
        dm
      );
      cwBushing.position.set(
        cwPivotX,
        0,
        side * (cwBearingDepth / 2 + 0.001)
      );
      cwBushing.castShadow = true;
      this.armPivot.add(cwBushing);
    });

    // Twin hanger links connect to the pin that passes through the bearing.
    // The lug sits OUTSIDE the dark bushing (clear gap), so the hanger pivots
    // on the bushing rather than being fused into it.
    [-1, 1].forEach(side => {
      // Connector lug beyond the bushing face
      const lug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12).rotateX(Math.PI / 2),
        p
      );
      lug.position.set(0, 0, side * (cwBearingDepth / 2 + 0.013));
      lug.castShadow = true;
      this.cwGroup.add(lug);

      // Hanger rod from the lug down to the mounting bracket on the box
      const link = createRodBetween(
        new THREE.Vector3(0, 0, side * (cwBearingDepth / 2 + 0.013)),
        new THREE.Vector3(0, -this.CW_HANG, side * 0.045),
        0.005,
        p,
        16
      );
      this.cwGroup.add(link);
      if (!this.hangerMesh) this.hangerMesh = link; // tour label anchor

      // Hexagonal fixing nut under the bracket where the rod passes through
      // it.  Flat-shaded hex prism so the six faces read clearly even at this
      // small size; axis vertical (same convention as the sill nuts).
      const hexNutMat = new THREE.MeshStandardMaterial({
        color: 0x767c83,
        metalness: 0.85,
        roughness: 0.35,
        flatShading: true,
      });
      const nut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.011, 0.012, 6),
        hexNutMat
      );
      nut.rotation.y = Math.PI / 6; // flat face to the viewer
      nut.position.set(0, -this.CW_HANG - 0.008 - 0.006, side * 0.045);
      nut.castShadow = true;
      this.cwGroup.add(nut);
    });

    // Transparent counterweight box.  Its dimensions stay fixed; the mass is
    // represented by the sand fill inside it (full box = 3.0 kg, spec.js UI.counterweight.max).
    const cwSize = GEOM.cwSize;
    const cwGeom = new THREE.BoxGeometry(cwSize, cwSize, cwSize);
    this.counterweightMesh = new THREE.Mesh(cwGeom, this.clearBoxMat);
    this.counterweightMesh.position.set(0, -this.CW_HANG - cwSize / 2, 0);
    this.counterweightMesh.renderOrder = 3;
    this.cwGroup.add(this.counterweightMesh);

    // A subtle outline makes the clear box readable against the background.
    const boxEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(cwGeom),
      new THREE.LineBasicMaterial({
        color: 0xbcc8d3,
        transparent: true,
        opacity: 0.70,
        depthWrite: false,
      })
    );
    boxEdges.renderOrder = 4;
    this.counterweightMesh.add(boxEdges);

    // Keep a small wall thickness around the sand so the fill remains inside
    // the transparent container.  setCounterweight() changes only its height.
    const sandSize = cwSize - 0.012;
    this.sandMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sandSize, sandSize, sandSize),
      this.sandMat
    );
    this.sandMesh.castShadow = true;
    this.sandMesh.receiveShadow = true;
    this.sandMesh.renderOrder = 2;
    this.cwGroup.add(this.sandMesh);

    // Top metal mounting bracket on the counterweight — widened so both
    // hanger rods land on the plate, not at its edge.
    const topBracket = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.016, 0.11), dm);
    topBracket.position.set(0, -this.CW_HANG, 0);
    this.cwGroup.add(topBracket);

    // 4 countersunk bolts fixing the plate to the transparent box: heads sunk
    // flush with the plate surface (no nuts — countersunk, flush).
    const boltR = 0.005, boltH = 0.006;
    [-1, 1].forEach(bx => {
      [-1, 1].forEach(bz => {
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(boltR, boltR, boltH, 12),
          dm
        );
        bolt.position.set(
          bx * 0.045,
          -this.CW_HANG + 0.008 - boltH / 2, // top face flush with plate
          bz * 0.050
        );
        bolt.castShadow = true;
        this.cwGroup.add(bolt);
      });
    });

    this.armPivot.add(this.cwGroup);
  }

  // Full sand box = slider max (3.0 kg).  Only the sand level changes with
  // the selected mass; the transparent box and its hanger remain fixed.
  setCounterweight(kg) {
    const fullMassKg = 3.0;
    const fillRatio = THREE.MathUtils.clamp(kg / fullMassKg, 0, 1);
    if (this.sandMesh) {
      const cwSize = GEOM.cwSize;
      const sandSize = cwSize - 0.012;
      const sandBottom = -this.CW_HANG - cwSize + 0.006;
      const fillHeight = sandSize * fillRatio;

      this.sandMesh.scale.set(1, Math.max(fillRatio, 0.0001), 1);
      this.sandMesh.position.set(0, sandBottom + fillHeight / 2, 0);
    }
  }

  // Set arm angle (radians)
  setArmAngle(rad) {
    this.armAngle = rad;
    this.armPivot.rotation.z = rad;
    // Counterweight always hangs vertically under gravity (counter-rotate)
    if (this.cwGroup) {
      this.cwGroup.rotation.z = -rad;
    }
  }

  // pull 0° = rest (counterweight on chassis floor, spoon up)
  // pull > 0° = pulled down (counterweight lifted up, spoon pulled down)
  // Physical stop: capped at maxPullDeg so cradle bottom never penetrates paper/table
  setPullAngle(pullDeg) {
    const clampedDeg = Math.min(this.maxPullDeg, Math.max(0, pullDeg));
    const pullRad = THREE.MathUtils.degToRad(clampedDeg);
    this.setArmAngle(this.REST_ANGLE + pullRad);
  }

  // Get world position of the cup
  getCupWorldPosition() {
    if (this.cupMesh) {
      this.cupMesh.getWorldPosition(this.cupWorldPos);
      // Ball (r=0.0145) rests on cup interior bottom
      this.cupWorldPos.y -= 0.004;
    }
    return this.cupWorldPos;
  }

  // Get world position of the counterweight
  getCounterweightWorldPosition() {
    if (this.counterweightMesh) {
      this.counterweightMesh.getWorldPosition(this.cwWorldPos);
    }
    return this.cwWorldPos;
  }

  // Multi-stage morph:
  // f = 0: hidden
  // f in (0, 0.33]: Paper 3D model
  // f in (0.33, 0.66]: Paper -> Pure Gray-White clay model (smooth color & roughness interpolation)
  // f in (0.66, 1.0]: Gray-White -> Full Textured 3D model (gradual texture & color reveal)
  setMorphFactor(f) {
    f = Math.max(0.0, Math.min(1.0, f));
    this.group.visible = f > 0.02;

    const paperColor = new THREE.Color(0xf5f0e8);
    const whiteColor = new THREE.Color(0xebebeb);
    const woodBaseColor = new THREE.Color(0xe6cdab);

    if (f <= 0.33) {
      // Stage: Pure Paper Model
      const scaleZ = Math.min(1.0, 0.2 + (f / 0.33) * 0.8);
      this.group.scale.set(1, 1, scaleZ);
      this.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.material = this.paperMat;
        }
      });
    } else if (f <= 0.66) {
      // Stage: Paper -> Gray-White Model (smooth blend)
      this.group.scale.set(1, 1, 1);
      const t = (f - 0.33) / (0.66 - 0.33);
      this.blendMat.color.copy(paperColor).lerp(whiteColor, t);
      this.blendMat.roughness = THREE.MathUtils.lerp(0.85, 0.70, t);
      this.blendMat.metalness = 0.0;
      this.blendMat.map = null;
      this.blendMat.needsUpdate = true;

      this.group.traverse((obj) => {
        if (obj.isMesh) {
          obj.material = this.blendMat;
        }
      });
    } else {
      // Stage: Gray-White -> Full Textured 3D Model
      this.group.scale.set(1, 1, 1);
      const t = (f - 0.66) / (1.0 - 0.66);
      if (t >= 0.96) {
        // Fully restore original materials with wood textures, metallic pins, clear box
        this.group.traverse((obj) => {
          if (obj.isMesh && obj.userData.origMaterial) {
            obj.material = obj.userData.origMaterial;
          }
        });
      } else {
        // Smoothly blend color towards wood tone before full texture restore
        this.blendMat.color.copy(whiteColor).lerp(woodBaseColor, t);
        this.blendMat.roughness = THREE.MathUtils.lerp(0.70, 0.65, t);
        this.blendMat.metalness = t * 0.05;
        this.blendMat.map = null;
        this.blendMat.needsUpdate = true;
        this.group.traverse((obj) => {
          if (obj.isMesh) {
            obj.material = this.blendMat;
          }
        });
      }
    }
  }
}
