import * as THREE from 'three';

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

    // Dimensions
    this.LONG_ARM = 0.62;   // long arm (throwing side, backwards/-X)
    this.SHORT_ARM = 0.20;  // short arm (counterweight side, forwards/+X)
    this.CW_HANG = 0.10;    // hanging link length

    // Pivot height at apex of A-frame
    this.apexX = 0.02;
    this.apexY = 0.44;

    // REST_ANGLE (pull 0°):
    // Short arm is angled down towards chassis floor.
    // The counterweight rests cleanly on the chassis floor between the front wheels.
    // Long arm is tilted up-left at ~50° to horizontal.
    this.REST_ANGLE = -0.85; // ~ -48.7°

    // Cup & 3D wooden cradle dimensions
    this.cupR = 0.05;
    this.cradleThick = 0.020;
    this.cradleOuterR = this.cupR + this.cradleThick;
    this.cupCenterX = -this.LONG_ARM - this.cupR + 0.02;
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

    const railY = 0.08;
    const railZ = 0.125;
    const railLen = 0.66;
    const railThickness = 0.038;
    const railHeight = 0.045;

    // 1. Two main longitudinal rails
    [-railZ, railZ].forEach(z => {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(railLen, railHeight, railThickness),
        w
      );
      rail.position.set(0, railY, z);
      rail.castShadow = true;
      rail.receiveShadow = true;
      this.chassis.add(rail);
    });

    // 2. Three crossbeams connecting the rails
    const crossWidth = railZ * 2 + railThickness;
    [-0.28, 0.02, 0.28].forEach(x => {
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, railHeight, crossWidth),
        w
      );
      cross.position.set(x, railY, 0);
      cross.castShadow = true;
      cross.receiveShadow = true;
      this.chassis.add(cross);
    });

    // 3. Four craft wooden wheels with metal hub pins
    const wheelRadius = 0.065;
    const wheelThickness = 0.028;
    const wheelGeom = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelThickness, 24);
    wheelGeom.rotateX(Math.PI / 2);

    // Keep the wheel axle inside the outer faces of the wooden wheels.  The
    // wheel hubs below provide the visible, flush metal bearing caps.
    const wheelAxleLength = railZ * 2 + wheelThickness * 2 + 0.004;
    const axleGeom = new THREE.CylinderGeometry(0.010, 0.010, wheelAxleLength, 16);
    axleGeom.rotateX(Math.PI / 2);

    [-0.22, 0.22].forEach(x => {
      // Axle through chassis
      const axle = new THREE.Mesh(axleGeom, p);
      axle.position.set(x, 0.065, 0);
      axle.castShadow = true;
      this.chassis.add(axle);

      // Wheels on both sides
      const wheelDistZ = railZ + wheelThickness / 2 + 0.012;
      [-wheelDistZ, wheelDistZ].forEach(z => {
        const wheel = new THREE.Mesh(wheelGeom, dw);
        wheel.position.set(x, 0.065, z);
        wheel.castShadow = true;
        wheel.receiveShadow = true;
        this.chassis.add(wheel);

        // Near-flush metal bearing cap: it is seated in the wooden wheel
        // instead of floating far beyond the wheel surface.
        const hubLength = 0.020;
        const hub = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, hubLength, 24).rotateX(Math.PI / 2),
          p
        );
        hub.position.copy(wheel.position);
        // A 1mm proud offset avoids coplanar z-fighting while keeping the
        // bearing cap seated almost entirely inside the wooden wheel.
        hub.position.z += Math.sign(z) * (wheelThickness / 2 - hubLength / 2 + 0.001);
        hub.castShadow = true;
        this.chassis.add(hub);
      });
    });

    // 4. Two Upright A-Frames (one on near side, one on far side)
    const legWidth = 0.038;
    const legDepth = 0.032;
    const apexPoint = new THREE.Vector3(this.apexX, this.apexY, 0);

    [-railZ, railZ].forEach(z => {
      const topP = new THREE.Vector3(this.apexX, this.apexY, z);
      const rearBottom = new THREE.Vector3(-0.20, railY + railHeight / 2, z);
      const frontBottom = new THREE.Vector3(0.24, railY + railHeight / 2, z);
      const midBottom = new THREE.Vector3(this.apexX, railY + railHeight / 2, z);

      // Rear slanted leg
      this.chassis.add(createBeamBetween(rearBottom, topP, legWidth, legDepth, w));

      // Front slanted leg
      this.chassis.add(createBeamBetween(frontBottom, topP, legWidth, legDepth, w));

      // Center vertical post
      this.chassis.add(createBeamBetween(midBottom, topP, legWidth * 0.9, legDepth, w));

      // Horizontal cross-tie halfway up
      const crossTieY = 0.23;
      const t = (crossTieY - (railY + railHeight / 2)) / (this.apexY - (railY + railHeight / 2));
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
    });

    // Pivot group positioned at the apex
    this.armPivot.position.copy(apexPoint);
  }

  buildArm() {
    const w = this.woodMat;
    const dw = this.darkWoodMat;
    const p = this.metalPinMat;

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
    armStructure.castShadow = true;
    armStructure.receiveShadow = true;
    this.armPivot.add(armStructure);

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
    const cwPivotX = this.SHORT_ARM - 0.015;
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
    });

    // Twin hanger links connect to the pin that passes through the bearing.
    // They start at the bearing faces where the pin exits, then angle outward
    // slightly to the counterweight box.
    [-1, 1].forEach(side => {
      // Connector lug at the bearing face (where pin exits)
      const lug = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12).rotateX(Math.PI / 2),
        p
      );
      lug.position.set(0, 0, side * (cwBearingDepth / 2 + 0.002));
      lug.castShadow = true;
      this.cwGroup.add(lug);

      // Hanger rod from bearing face down to counterweight box
      const link = createRodBetween(
        new THREE.Vector3(0, 0, side * (cwBearingDepth / 2 + 0.002)),
        new THREE.Vector3(0, -this.CW_HANG, side * 0.040),
        0.005,
        p,
        16
      );
      this.cwGroup.add(link);
    });

    // Transparent counterweight box.  Its dimensions stay fixed; the mass is
    // represented by the sand fill inside it (full box = 1.00 kg).
    const cwSize = 0.13;
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

    // Top metal mounting bracket on the counterweight
    const topBracket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.016, 0.08), p);
    topBracket.position.set(0, -this.CW_HANG, 0);
    this.cwGroup.add(topBracket);

    this.armPivot.add(this.cwGroup);
  }

  // Full sand box = 1.00 kg.  Only the sand level changes with the selected
  // mass; the transparent box and its hanger remain fixed in size.
  setCounterweight(kg) {
    const fullMassKg = 1.0;
    const fillRatio = THREE.MathUtils.clamp(kg / fullMassKg, 0, 1);
    if (this.sandMesh) {
      const cwSize = 0.13;
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
      // Ball (r=0.046) rests on cup interior bottom
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
