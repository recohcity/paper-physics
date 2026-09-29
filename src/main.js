import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
import confetti from 'canvas-confetti';

import {
  createWoodTableTexture,
  createPaperWithSketchTexture,
  createTrebuchetCutoutTexture,
  createBlocksCutoutTexture,
  createBalsaTexture,
  createLeadTexture
} from './textures.js';
import { GEOM, UI } from './spec.js';
import { PhysicsWorld } from './physics.js';
import { TrebuchetModel } from './trebuchet.js';
import { Environment } from './environment.js';
import { TrajectoryAnnotations } from './annotations.js';
import { sound } from './audio.js';

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.annotationCanvas = document.getElementById('annotation-canvas');

    // UI Elements
    this.tourBanner = document.getElementById('tour-banner');
    this.tourBannerText = document.getElementById('tour-banner-text');
    this.buildPanel = document.getElementById('build-panel');
    this.slowMoBadge = document.getElementById('slow-mo-badge');
    this.dragHint = document.getElementById('drag-hint');

    this.scrubberProgress = document.getElementById('scrubber-progress');
    this.scrubberThumb = document.getElementById('scrubber-thumb');
    this.scrubberCurrentTime = document.getElementById('scrubber-current-time');
    this.btnPlayTour = document.getElementById('btn-play-tour');
    this.btnBuildYourself = document.getElementById('btn-build-yourself');

    // Panel controls
    this.statSpeed = document.getElementById('stat-speed');
    this.statAngle = document.getElementById('stat-angle');
    this.statRange = document.getElementById('stat-range');
    this.statDownCount = document.getElementById('stat-down-count');
    this.pullSlider = document.getElementById('pull-slider');
    this.pullAngleLabel = document.getElementById('pull-angle-label');
    this.btnFire = document.getElementById('btn-fire');
    this.btnToggleSlowMo = document.getElementById('btn-toggle-slowmo');
    this.btnToggleFlightPath = document.getElementById('btn-toggle-flightpath');
    this.weightSlider = document.getElementById('weight-slider');
    this.weightLabel = document.getElementById('weight-label');
    this.ballSlider = document.getElementById('ball-slider');
    this.ballLabel = document.getElementById('ball-label');
    this.morphSlider = document.getElementById('morph-slider');
    this.btnViewHero = document.getElementById('btn-view-hero');
    this.btnViewSide = document.getElementById('btn-view-side');
    this.btnViewTop = document.getElementById('btn-view-top');
    this.btnReset = document.getElementById('btn-reset');
    this.soundBtn = document.getElementById('panel-sound-btn');
    this.scrubberMute = document.getElementById('scrubber-mute');
    this.playerScrubber = document.getElementById('player-scrubber');
    this.scrubberPlay = document.getElementById('scrubber-play');
    this.scrubberRw = document.getElementById('scrubber-rw');
    this.scrubberFf = document.getElementById('scrubber-ff');
    this.scrubberContainer = document.getElementById('scrubber-container');
    this.zoomSlider = document.getElementById('zoom-slider');
    this.zoomFactor = 1;

    // Simulation settings
    this.slowMotion = false;
    this.timeScale = 1.0;
    this.counterweightKg = UI.counterweight.value; // hover recalibration — spec.js (2.6 kg throws the 0.45 kg ball onto the pyramid)
    this.ballKg = UI.ball.value; // solid steel projectile — spec.js (density 7850 kg/m³, r = 60% of the 100 mm bowl opening)
    this.flightPathEnabled = true;
    this.isTourRunning = true;
    this.isTourPlaying = false;
    this.tourAbortController = null;
    this.isFiring = false;
    this.isCameraTransitioning = false;
    this.cameraTransitionId = 0;
    this.lastImpactEffectAt = 0;

    // Pull angle in degrees:
    // 0° = rest (counterweight sitting on chassis floor, spoon up)
    // > 0° = pulled down (counterweight hoisted in the air, spoon down)
    // 84.5° is the exact physical limit where the cradle bottom rests on the paper (Y=0.006)
    this.MAX_PULL_DEG = 84.5;
    this.pullDeg = 0;
    this.armVelocity = 0;

    // Mouse drag interaction state
    this.isDraggingCup = false;
    this.dragStartY = 0;
    this.initialPullVal = 0;
    this.activePointerId = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragPlane = new THREE.Plane();
    this.dragPointerWorld = new THREE.Vector3();
    this.dragPivotWorld = new THREE.Vector3();
    this.dragGrabOffsetY = 0;

    // Recoil: the chassis kicks back on release (momentum conservation) and
    // returns on a damped spring.  baseX = group.position.x (-0.72).
    this.recoilVel = 0;
    this.recoilBaseX = -0.72;

    this.initThree();
    this.initPhysics();
    this.initEnvironment();
    this.initAnnotations();
    this.initEvents();

    // Start render loop
    this.clock = new THREE.Clock();
    this.animate();

    // Boot into default state: First frame showing pencil sketch on engineering paper
    this.resetToFirstFrame();
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2e251d');

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 50);
    this.camera.position.set(0.2, 1.4, 2.5);
    this.camera.lookAt(0.15, 0.35, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    // Environment map for metallic reflections only (after renderer exists)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMapTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0; // 0 = only materials with own envMapIntensity get reflections

    this.container.appendChild(this.renderer.domElement);

    // Free 360° navigation with the standard controls: mouse LEFT-drag orbits,
    // wheel zooms, middle/right-drag pans; trackpad pinch zooms; WASD / arrow
    // keys pan, +/- zoom once the canvas has focus. Left-click on the spoon is
    // still the cup drag — OrbitControls is disabled for that grab below.
    this.renderer.domElement.tabIndex = 1;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0.15, 0.35, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 8;
    this.controls.update();

    // Warm natural afternoon lighting
    const ambientLight = new THREE.AmbientLight(0xffeed9, 0.95);
    this.scene.add(ambientLight);

    // Sunlight through window
    this.sunLight = new THREE.DirectionalLight(0xfffaec, 2.3);
    this.sunLight.position.set(-2.5, 4.5, 3.2);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 15;
    this.sunLight.shadow.camera.left = -2.8;
    this.sunLight.shadow.camera.right = 2.8;
    this.sunLight.shadow.camera.top = 2.8;
    this.sunLight.shadow.camera.bottom = -2.8;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.radius = 3.0;
    this.scene.add(this.sunLight);

    // Fill light
    const fillLight = new THREE.DirectionalLight(0xdce7f6, 0.6);
    fillLight.position.set(3, 2, -1);
    this.scene.add(fillLight);
  }

  initPhysics() {
    this.physics = new PhysicsWorld();
    this.physics.envMapTexture = this.envMapTexture;
    this.balsaTexture = createBalsaTexture();
    this.leadTexture = createLeadTexture();

    // 1. Create target 10 wooden cube pyramid on the right
    this.physics.createBlocks(this.scene, this.balsaTexture);

    // 2. Create the 0.45 kg projectile (r=30 mm, 60% of bowl opening, metal)
    this.physics.createProjectile(this.scene);

    // 3. Create Trebuchet wooden model on the left
    this.trebuchet = new TrebuchetModel(this.scene, this.balsaTexture, this.leadTexture);
    this.trebuchet.setCounterweight(this.counterweightKg);
    // Keep the UI sliders in sync with the physics-calibrated defaults (2.60 kg
    // counterweight, 0.45 kg steel ball — hover recalibration, see CHANGELOG).
    if (this.weightSlider) this.weightSlider.value = this.counterweightKg;
    if (this.weightLabel) this.weightLabel.textContent = `${this.counterweightKg.toFixed(2)} kg`;
    if (this.ballSlider) this.ballSlider.value = this.ballKg;
    if (this.ballLabel) this.ballLabel.textContent = `${this.ballKg.toFixed(2)} kg`;

    // 4. Real hinge mechanism (audit fix plan A): the arm and the hanging
    //    counterweight become Cannon bodies joined by two hinge constraints,
    //    driven purely by gravity when fired. This replaces the fitted
    //    acceleration/launch formulas that previously animated the arm.
    const pivot = new THREE.Vector3();
    this.trebuchet.armPivot.getWorldPosition(pivot);
    this.physics.createMechanism(pivot.x, pivot.y, this.trebuchet.REST_ANGLE);
    // Push the UI-default counterweight into the mechanism: createMechanism()
    // builds the cw body with the physics-constructor default (1.0 kg) and no
    // setCwMass() was called before, so the DEFAULT slider value 2.60 never
    // reached the physics body — the arm hung cocked like the ball outweighed
    // the box (mechanism inversion).  Re-assert it now (and on every rebuild).
    this.physics.setCwMass(this.counterweightKg);

    // Apply env map only to metal materials
    if (this.envMapTexture) {
      this.trebuchet.metalPinMat.envMap = this.envMapTexture;
      this.trebuchet.metalPinMat.envMapIntensity = 1.0;
    }

    // Initial state: resting (0° pull, counterweight on chassis)
    this.setPullAngle(0);

    // Place ball inside cup
    this.updateBallInCup();

    // Collision callback
    this.physics.onBlockHit = (blockIndex, relativeVel, hitByProjectile) => {
      this.updateDownCount();
      if (hitByProjectile) this.showImpactBurst(blockIndex, Math.abs(relativeVel));
    };

    this.physics.onBallLand = (landX) => {
      if (this.isFiring) {
        this.finishShot(landX);
      }
    };
  }

  initEnvironment() {
    this.woodTableTexture = createWoodTableTexture();
    this.paperSketchTexture = createPaperWithSketchTexture(true);
    this.paperCleanTexture = createPaperWithSketchTexture(false);
    this.environment = new Environment(
      this.scene,
      this.woodTableTexture,
      this.paperSketchTexture,
      this.paperCleanTexture
    );
    this.initSketchCutout();
    // Desk props (pencil & eraser) get real static colliders so the iron ball
    // and blocks collide with them instead of passing through.
    this.physics.addPropColliders(this.environment.pencilGroup, this.environment.eraserGroup);
  }

  initSketchCutout() {
    this.cutoutTexture = createTrebuchetCutoutTexture();
    const geom = new THREE.PlaneGeometry(0.85, 0.68);
    geom.translate(0, 0.68 / 2, 0); // Bottom edge rests on table surface at Y = 0
    this.cutoutMat = new THREE.MeshStandardMaterial({
      map: this.cutoutTexture,
      transparent: true,
      alphaTest: 0.08, // Enable accurate alpha-clipped shadow casting
      side: THREE.DoubleSide,
      roughness: 0.90,
      metalness: 0.0,
      depthWrite: false,
    });
    this.cutoutMesh = new THREE.Mesh(geom, this.cutoutMat);
    this.cutoutMesh.castShadow = true;
    this.cutoutMesh.receiveShadow = true;
    this.cutoutMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: this.cutoutTexture,
      alphaTest: 0.08,
    });
    // Align with trebuchet position (-0.72) and ground line Z = 0
    this.cutoutMesh.position.set(-0.72, 0.007, 0);
    this.cutoutMesh.rotation.x = -Math.PI / 2; // Flat on paper
    this.cutoutMesh.visible = false;
    this.scene.add(this.cutoutMesh);

    // --- Blocks pyramid 2D cutout ---
    // Pyramid: 4 blocks wide × 4 blocks tall, each 0.088 → 0.352 × 0.352
    // Canvas texture has 440px pyramid in 512px canvas (0.352 * 512/440 ≈ 0.41)
    const bGeom = new THREE.PlaneGeometry(0.41, 0.41);
    bGeom.translate(0, 0.41 / 2, 0); // pivot at bottom edge (ground)
    this.blocksCutoutTexture = createBlocksCutoutTexture();
    this.blocksCutoutMat = new THREE.MeshStandardMaterial({
      map: this.blocksCutoutTexture,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      roughness: 0.90,
      metalness: 0.0,
      depthWrite: false,
    });
    this.blocksCutoutMesh = new THREE.Mesh(bGeom, this.blocksCutoutMat);
    this.blocksCutoutMesh.castShadow = true;
    this.blocksCutoutMesh.receiveShadow = true;
    this.blocksCutoutMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: this.blocksCutoutTexture,
      alphaTest: 0.08,
    });
    // Align with pyramid center X=0.92, ground Y=0.007, Z=0
    this.blocksCutoutMesh.position.set(0.92, 0.007, 0);
    this.blocksCutoutMesh.rotation.x = -Math.PI / 2; // Flat on paper
    this.blocksCutoutMesh.visible = false;
    this.scene.add(this.blocksCutoutMesh);
  }


  initAnnotations() {
    this.annotations = new TrajectoryAnnotations(this.annotationCanvas, this.camera);
    this.annotations.setWeight(this.counterweightKg, this.trebuchet.getCounterweightWorldPosition());
  }

  // Update projectile position while resting in the wooden cup
  // Update projectile position while resting in the wooden cup.  The ball sits
  // on the inner bowl floor (cup centre - (cupR - ballR) along world -y) so it
  // is visibly inside the bowl; while the arm is dragged the cup tilts and the
  // ball settles to the low side (the "back" bowl wall), like a real ball in a
  // spoon.  A simple position-driven roll — free-contact rolling inside a
  // concave bowl is not available in cannon-es and has negligible effect on
  // release speed for a 0.05 m shallow bowl.
  updateBallInCup() {
    if (!this.physics.ballReleased) {
      const cupPos = this.trebuchet.getCupWorldPosition();
      const restOffset = this.trebuchet.cupR - this.physics.ballRadius;
      this.physics.ballMesh.position.set(cupPos.x, cupPos.y - restOffset, cupPos.z);
      this.physics.ballBody.position.set(cupPos.x, cupPos.y - restOffset, cupPos.z);
      this.physics.ballBody.velocity.set(0, 0, 0);
      this.physics.ballBody.angularVelocity.set(0, 0, 0);
    }
  }

  // Camera presets — auto-fit entire paper + all objects
  getFitDistance(neededWidth, neededHeight) {
    const aspect = window.innerWidth / window.innerHeight;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    // visible height at distance d: 2*d*tan(vFov/2)
    const tanHalf = Math.tan(vFov / 2);
    const dForHeight = neededHeight / (2 * tanHalf);
    const dForWidth = neededWidth / (2 * tanHalf * aspect);
    return (Math.max(dForHeight, dForWidth) + 0.15) * this.zoomFactor;
  }

  setCameraView(viewName, duration = 1000) {
    this.currentView = viewName;
    const transitionId = ++this.cameraTransitionId;
    this.isCameraTransitioning = duration > 0;
    [this.btnViewHero, this.btnViewSide, this.btnViewTop].forEach(btn => btn?.classList.remove('active'));

    // Paper center: (0.12, 0, 0), size 2.7 x 1.85; objects up to y~0.55
    const look = new THREE.Vector3(0.12, 0.12, 0);
    let targetPos;

    if (viewName === 'Hero') {
      this.btnViewHero?.classList.add('active');
      // 3/4 angle: fit paper diagonal (~2.9 wide projected) and height
      const d = this.getFitDistance(3.0, 1.0);
      targetPos = new THREE.Vector3(0.12 + d * 0.35, look.y + d * 0.55, look.z + d * 0.85);
    } else if (viewName === 'Side') {
      this.btnViewSide?.classList.add('active');
      // Side view: fit paper width (2.7) and object height (0.65)
      const d = this.getFitDistance(2.9, 0.75);
      targetPos = new THREE.Vector3(look.x, look.y + d * 0.15, look.z + d);
    } else if (viewName === 'Top') {
      this.btnViewTop?.classList.add('active');
      // Top view: fit paper width (2.7) and depth (1.85)
      const d = this.getFitDistance(2.9, 2.0);
      targetPos = new THREE.Vector3(look.x, look.y + d, look.z + 0.01);
    }

    if (duration === 0) {
      this.camera.position.copy(targetPos);
      this.camera.lookAt(look);
      this.controls.target.copy(look);
      this.controls.update();
      this.isCameraTransitioning = false;
      this.updateDragHint();
      return;
    }

    this.controls.enabled = false; // camera animation owns the view
    new TWEEN.Tween(this.camera.position)
      .to(targetPos, duration)
      .easing(TWEEN.Easing.Cubic.Out)
      .onComplete(() => {
        if (transitionId === this.cameraTransitionId) {
          this.controls.target.copy(look);
          this.controls.enabled = true;
          this.controls.update();
          this.isCameraTransitioning = false;
          this.updateDragHint();
        }
      })
      .start();

    const currentLook = new THREE.Vector3();
    this.camera.getWorldDirection(currentLook).add(this.camera.position);

    new TWEEN.Tween(currentLook)
      .to(look, duration)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate(() => this.camera.lookAt(currentLook))
      .start();
  }

  // Set pull angle (0° = resting; max pull brings the cup just above the table)
  setPullAngle(deg) {
    deg = Math.min(this.MAX_PULL_DEG, Math.max(0, deg));
    this.pullDeg = deg;
    if (this.pullSlider) this.pullSlider.value = deg;
    if (this.pullAngleLabel) this.pullAngleLabel.textContent = `pull ${Math.round(deg)}°`;

    if (!this.isFiring) {
      if (this.trebuchet) {
        this.trebuchet.setPullAngle(deg);
        this.updateBallInCup();
      }
      // Keep the locked (pre-fire) mechanism pose in sync with the 3D model.
      if (this.physics) this.physics.setCocked(deg);
      if (this.annotations && this.trebuchet) {
        this.annotations.setWeight(this.counterweightKg, this.trebuchet.getCounterweightWorldPosition());
      }
    }
  }

  // Set counterweight mass
  // Set projectile mass (solid steel: radius follows density) and rebuild the
  // hinge mechanism so arm mass/inertia include the new ball.
  setBallMass(kg) {
    this.ballKg = kg;
    if (this.ballLabel) this.ballLabel.textContent = `${kg.toFixed(2)} kg`;
    this.physics.setBall(kg);
    this.updateBallInCup();
  }

  setWeight(kg) {
    this.counterweightKg = kg;
    if (this.weightSlider) this.weightSlider.value = kg;
    if (this.weightLabel) this.weightLabel.textContent = `${kg.toFixed(2)} kg`;
    if (this.trebuchet) {
      this.trebuchet.setCounterweight(kg);
    }
    if (this.physics) this.physics.setCwMass(kg);
    if (this.annotations && this.trebuchet) {
      this.annotations.setWeight(kg, this.trebuchet.getCounterweightWorldPosition());
    }
  }

  // Fire the trebuchet.  The arm is a real hinged rigid body now (audit F1/F2
  // fix): fire() releases the mechanism (KINEMATIC -> DYNAMIC) and gravity
  // drives it through the counterweight pendulum.  Release speed and angle are
  // read back from the physics state at the stop angle — no fitted formulas.
  fire(fromDrag = false) {
    // Reset recoil state before this launch (a previous shot may still have
    // been mid-return when the user refired).
    this.recoilVel = 0;
    this.trebuchet.group.position.x = this.recoilBaseX;
    if (this.isFiring) return;

    // Keep the existing button shortcut, but never turn a simple spoon click
    // into a launch: only a completed downward drag calls fire(true).
    if (!fromDrag && this.pullDeg < 10) {
      this.setPullAngle(84.5);
    }

    this.isFiring = true;
    this.physics.resetImpact();
    sound.playLaunch();

    this.annotations.clear();
    this.physics.ballReleased = false;
    this.physics.wakeBlocks();
    this.physics.releaseMechanism(); // let gravity + hinges drive the arm

    this.fireStartTime = performance.now();
    const cupPos = this.trebuchet.getCupWorldPosition();
    this.launchPos = cupPos.clone();
    this.launchSpeedVal = 0;
    this.launchAngleVal = 0;
  }

  // Per-frame update while firing: sync the 3D arm/counterweight from the
  // physics bodies and detect the release moment (arm reaches REST_ANGLE).
  updateMechanism() {
    if (!this.isFiring) return;

    if (!this.physics.ballReleased) {
      // Sync 3D pose from the real hinge dynamics
      const ang = this.physics.getArmAngle();
      const omega = this.physics.getArmOmega();
      this.trebuchet.armPivot.rotation.z = ang;
      this.trebuchet.cwGroup.rotation.z = this.physics.getCwRelAngle();
      this.updateBallInCup();

      // Release the instant the arm hits the stop angle.  The arm sweeps
      // ~5° per RAF frame at release speed, so sampling would over-shoot by
      // up to several degrees and bias speed/angle.  Interpolate to the exact
      // stop angle: omega at REST = omega + (domega/dt)*(dt) — linear over one
      // frame is accurate to well under 1% at these accelerations.
      if (ang <= this.trebuchet.REST_ANGLE && this._lastArmAng !== undefined) {
        const span = this._lastArmAng - ang;
        const frac = span > 1e-9 ? (this._lastArmAng - this.trebuchet.REST_ANGLE) / span : 1;
        const omegaRelease = this._lastArmOmega + (omega - this._lastArmOmega) * Math.min(1, Math.max(0, frac));
        this._lastArmAng = undefined;
        this.releaseBall(omegaRelease);
        return;
      }
      if (ang <= this.trebuchet.REST_ANGLE) {
        this.releaseBall(omega);
        return;
      }
      this._lastArmAng = ang;
      this._lastArmOmega = omega;

      // Safety timeout: counterweight too light / pull too small to reach the
      // stop angle at all (mirrors the previous launch-loop timeout).
      if (performance.now() - this.fireStartTime > 6500) {
        this.finishShot(2.15);
      }
      return;
    }

    // Ball is in flight.  The arm stays pinned at REST; the counterweight keeps
    // its residual swing on the live hinge and then settles back to its
    // vertical hang (HOVER: it floats 20 mm above the deck — never touches).
    // Keep syncing the 3D cwGroup to the physics rel angle every frame so the
    // box visibly whips up, pendulum-decays and settles vertical in the air.
    this.trebuchet.armPivot.rotation.z = this.trebuchet.REST_ANGLE;
    this.trebuchet.cwGroup.rotation.z = this.physics.getCwRelAngle();
    // The 3D box hangs Lc below the arm pin by construction (cwGroup local
    // offset -0.165), matching the physics hinge — no deck-gap offset needed;
    // the old -0.006 "paste onto deck" correction is deleted (hover mode).

    // Record the trajectory arc and finish on landing.
    if (this.flightPathEnabled && this.physics.ballMesh) {
      this.annotations.addPoint(this.physics.ballMesh.position);
    }
    const landY = 0.006 + this.physics.ballRadius + 0.006; // radius-aware landing threshold (ball radius follows the BALL slider)
    if (this.physics.ballBody.position.y <= landY || this.physics.ballBody.position.x > 2.2) {
      const rangeDist = Math.max(0, this.physics.ballMesh.position.x - this.launchPos.x);
      this.finishShot(rangeDist);
      return;
    }
    if (performance.now() - this.fireStartTime > 6500) {
      this.finishShot(2.15);
    }
  }

  // Ball leaves the cup with the arm's tangential velocity at the stop angle
  // (v = ω × r).  Speed and angle come from physics, not formulas (audit F4:
  // the geometry-derived release angle is ~40°, not the fitted 32°).
  releaseBall(omegaInterp) {
    const m = this.physics;
    const ang = m.getArmAngle();
    const omega = omegaInterp !== undefined ? omegaInterp : m.getArmOmega();

    // Sync the 3D arm to the EXACT stop angle (not the over-shot sample) so
    // the cup world position and the release direction match the reference
    // geometry (~31°, a flatter hit that knocks blocks sideways).
    this.trebuchet.armPivot.rotation.z = this.trebuchet.REST_ANGLE;
    const cupPos = this.trebuchet.getCupWorldPosition();

    const pivot = m.getPivotWorld();
    const rx = cupPos.x - pivot.x;
    const ry = cupPos.y - pivot.y;
    const vx = -omega * ry;
    const vy = omega * rx;
    const speed = Math.hypot(vx, vy);
    const angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI;
    const vz = (Math.random() - 0.5) * 0.015;

    // Pin the arm at the stop angle (the arm has reached the hard stop).
    m.lockMechanism();
    this.physics.ballReleased = true;
    this.trebuchet.armPivot.rotation.z = this.trebuchet.REST_ANGLE;
    // Do NOT teleport the box to rotation.z=0: at release the box is at rel
    // ~+98 deg (world ~+41 deg lean).  Hand the 3D group to updateMechanism
    // which keeps syncing rel every frame, so the box visibly whips up, then
    // pendulum-decays and settles vertical in mid-air (HOVER — it floats
    // 20 mm above the deck and never touches it).
    this.trebuchet.cwGroup.rotation.z = m.getCwRelAngle();

    this.physics.ballMesh.position.copy(cupPos);
    this.physics.ballBody.position.set(cupPos.x, cupPos.y, cupPos.z);
    this.physics.ballBody.velocity.set(vx, vy, vz);
    this.physics.ballBody.wakeUp();

    // Recoil kick: the ball (~0.45 kg @ ~3.5 m/s) carries ~1.6 kg·m/s; against
    // the full machine (~8 kg incl. the counterweight) that is ~0.2 m/s of
    // carriage recoil.  Slightly exaggerated so the kick reads on screen while
    // staying within plausible carriage motion.  The damped spring in animate()
    // returns the chassis to its base position.
    this.recoilVel = -0.55;

    this.statSpeed.textContent = `${speed.toFixed(2)} m/s`;
    this.statAngle.textContent = '—'; // POWER filled at finishShot
    this.launchPos = cupPos.clone();
    this.launchSpeedVal = speed;
    this.launchAngleVal = angleDeg;
    sound.playBlockHit(0.5);
  }

  finishShot(rangeDist) {
    if (!this.isFiring) return;
    this.isFiring = false;
    // Safety: if the shot ended before release (e.g. counterweight too light),
    // lock the mechanism bodies back onto the 3D model.
    if (this.physics && this.physics.mechArmBody) {
      this.physics.lockMechanism();
    }
    // Reset recoil position
    this.trebuchet.group.position.x = -0.72;
    this.recoilVel = 0;
    // Reset arm to rest angle (properly sets cwGroup to hang vertical)
    this.trebuchet.setArmAngle(this.trebuchet.REST_ANGLE);
    this._dragPendulum = 0;
    this._lastDragPull = undefined;

    const actualRange = typeof rangeDist === 'number' ? rangeDist : 2.15;
    this.statRange.textContent = `${actualRange.toFixed(2)} m`;
    const imp = this.physics._impactMomentum || 0;
    this.statAngle.textContent = imp > 0 ? `${imp.toFixed(2)} kg·m/s` : '0.00 kg·m/s';

    this.annotations.finishFlight(
      this.launchSpeedVal || 3.55,
      this.launchAngleVal || 32,
      actualRange,
      this.physics.ballMesh ? this.physics.ballMesh.position : null
    );

    // Let the pile settle before its final count is shown.  Visual impact
    // feedback is emitted immediately by the real ball-to-block contact.
    setTimeout(() => {
      this.updateDownCount();
    }, 450);

    // In custom (build-it-yourself) mode: after the shot settles, reset arm to rest
    // and place a fresh ball in the cup so the next throw requires pulling again.
    if (!this.isTourRunning) {
      setTimeout(() => {
        if (!this.isFiring) {
          this.setPullAngle(0);
          this.physics.ballReleased = false;
          this.updateBallInCup();
          this.updateDownCount(); // keep DOWN in sync with cascade topples
        }
      }, 1500);

      // After blocks have finished toppling, sleep them so window resizing or
      // idle frames don't cause micro-jitter.
      setTimeout(() => {
        if (!this.isFiring) {
          this.physics.settleBlocks();
          this.updateDownCount(); // final DOWN after the pile has settled
        }
      }, 3000);
    }
  }

  updateDownCount() {
    const down = this.physics.getDownedBlocksCount();
    this.statDownCount.textContent = `${down}`;
  }

  // A compact burst at the actual struck block, not a delayed, screen-centred
  // celebration once the entire throw has already completed.
  showImpactBurst(blockIndex, impactSpeed) {
    const now = performance.now();
    if (now - this.lastImpactEffectAt < 110) return;

    const blockMesh = this.physics.blockMeshes[blockIndex];
    if (!blockMesh) return;

    const impactPosition = blockMesh.getWorldPosition(new THREE.Vector3()).project(this.camera);
    if (impactPosition.z < -1 || impactPosition.z > 1) return;

    this.lastImpactEffectAt = now;
    confetti({
      particleCount: Math.round(18 + Math.min(impactSpeed, 3) * 7),
      spread: 72,
      startVelocity: 14 + Math.min(impactSpeed, 3) * 4,
      gravity: 0.82,
      scalar: 0.62,
      ticks: 72,
      origin: {
        x: THREE.MathUtils.clamp((impactPosition.x + 1) / 2, 0.03, 0.97),
        y: THREE.MathUtils.clamp((1 - impactPosition.y) / 2, 0.03, 0.97),
      },
      // Wood-toned chips read as an impact, not a delayed victory effect.
      colors: ['#d9b878', '#bf8345', '#80502f', '#f5e7c9'],
    });
  }

  resetAll() {
    this.isFiring = false;
    this.armVelocity = 0;

    // Reset pull to 0° (or current slider value)
    this.setPullAngle(parseInt(this.pullSlider.value) || 0);

    this.physics.ballReleased = false;
    this.updateBallInCup();
    this.physics.resetBlocks();

    this.annotations.clear();
    this.statDownCount.textContent = '0';
    this.statSpeed.textContent = '— m/s';
    this.statAngle.textContent = '— °';
    this.statRange.textContent = '— m';
  }

  resetToFirstFrame() {
    if (this.tourAbortController) {
      this.tourAbortController.abort();
      this.tourAbortController = null;
    }
    this.isTourRunning = true;
    this.setPlayButtonState(false);
    this.setSlowMo(false);

    // 1. Show desk paper pencil sketch; hide 3D model and 2D cutout
    this.environment.showPaperSketch();
    this.trebuchet.setMorphFactor(0);
    this.trebuchet.group.visible = false;
    if (this.cutoutMesh) {
      this.cutoutMesh.visible = false;
      this.cutoutMesh.rotation.x = -Math.PI / 2;
      this.cutoutMesh.material.opacity = 1.0;
    }
    if (this.blocksCutoutMesh) {
      this.blocksCutoutMesh.visible = false;
      this.blocksCutoutMesh.rotation.x = -Math.PI / 2;
      this.blocksCutoutMesh.material.opacity = 1.0;
    }
    this.morphSlider.value = 0;


    // 2. Hide blocks & projectile in sketch blueprint phase
    this.resetAll();
    this.physics.blockMeshes.forEach(m => m.visible = false);
    if (this.physics.ballMesh) this.physics.ballMesh.visible = false;

    // 3. UI and Scrubber state: initial 00:00, Play ready
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.annotations.showTrajectories = false;
    this.annotations.clear();
    this.updateScrubber(0, '00:00');
    this.updateNavButtons('tour');
    this.showTourBanner('Pencil Blueprint: Hand-drawn trebuchet sketch on engineer paper. Click Play to start the tour.');

    // 4. Default camera view: looking down at the hand-drawn sketch
    this.setCameraView('Top', 0);
  }

  setPlayButtonState(isPlaying) {
    this.isTourPlaying = isPlaying;
    if (!this.scrubberPlay) return;
    if (isPlaying) {
      this.scrubberPlay.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5">
          <rect x="6" y="4" width="4" height="16" fill="rgba(37, 99, 235, 0.25)"></rect>
          <rect x="14" y="4" width="4" height="16" fill="rgba(37, 99, 235, 0.25)"></rect>
        </svg>
      `;
      this.scrubberPlay.title = 'Pause Tour';
    } else {
      this.scrubberPlay.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5">
          <polygon points="6 4 20 12 6 20 6 4" fill="rgba(37, 99, 235, 0.15)"></polygon>
        </svg>
      `;
      this.scrubberPlay.title = 'Play Tour';
    }
  }

  toggleTourPlay() {
    if (this.isTourPlaying) {
      if (this.tourAbortController) {
        this.tourAbortController.abort();
        this.tourAbortController = null;
      }
      this.setPlayButtonState(false);
      this.showTourBanner('Tour paused. Click Play to resume or Rewind to restart.');
    } else {
      this.playTour();
    }
  }

  // Guided Tour sequence — 8 steps.  playTourFrom(startStep) lets the
  // scrubber seek to any step: it lands on that step's start state, then
  // replays from there to the end.
  tourSetup() {
    if (this.tourAbortController) {
      this.tourAbortController.abort();
      this.tourAbortController = null;
    }
    this.tourAbortController = new AbortController();
    this.isTourRunning = true;
    this.setPlayButtonState(true);
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.annotations.showTrajectories = true;
    this.annotations.clear();
    this.updateNavButtons('tour');
  }

  async playTour() {
    this.tourSetup();
    await this.playTourFrom(0);
  }

  // Land the world on step i's START state (no animation), then replay i..7.
  async seekTourStep(i) {
    this.tourSetup();
    this.applyTourStepStart(i);
    // Play ONLY this step (hotspot view mode): it runs once and pauses at its
    // end state, so the user can inspect each stage in isolation.  Full replay
    // (Play the tour) still runs all eight steps in sequence.
    await this.playTourFrom(i, i);
  }

  // Step start-state snapshots.  Step i's start = the state after step i-1
  // finished.  Keep in sync with the step bodies below.
  applyTourStepStart(i) {
    const t = this.trebuchet;
    // Common base (step 1 start): blueprint visible, model hidden
    this.environment.showPaperSketch();
    t.group.visible = false;
    t.setMorphFactor(0);
    if (this.cutoutMesh) this.cutoutMesh.visible = false;
    if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
    this.physics.blockMeshes.forEach(m => m.visible = false);
    if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
    this.annotations.setPartLabels(null, 0);
    this.annotations.hideDragHint();
    this.setSlowMo(false);
    this.physics.lockMechanism();
    this.setPullAngle(0);

    if (i >= 2) { // step 2 start: cutouts flat on paper, sketch hidden, Side view
      this.environment.hidePaperSketch();
      if (this.cutoutMesh) {
        this.cutoutMesh.visible = true;
        this.cutoutMesh.rotation.x = -Math.PI / 2;
        this.cutoutMesh.material.opacity = 1;
      }
      if (this.blocksCutoutMesh) {
        this.blocksCutoutMesh.visible = true;
        this.blocksCutoutMesh.rotation.x = -Math.PI / 2;
        this.blocksCutoutMesh.material.opacity = 1;
      }
      this.setCameraView('Side', 0);
    }
    if (i >= 3) { // step 3 start: white 3D model (morph 0.66), cutouts hidden
      t.group.visible = true;
      t.setMorphFactor(0.66);
      this.physics.setMorphFactor(0.66);
      this.physics.blockMeshes.forEach(m => m.visible = true);
      if (this.cutoutMesh) this.cutoutMesh.visible = false;
      if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
    }
    if (i >= 4) { // step 4 start: full material, ball in cup, Hero view
      t.setMorphFactor(1.0);
      this.physics.setMorphFactor(1.0);
      this.setCameraView('Hero', 0);
      this.physics.ballReleased = false;
      this.setPullAngle(0);
      if (this.physics.ballMesh) this.physics.ballMesh.visible = true;
      this.updateBallInCup();
    }
    if (i >= 5) { // step 5 start: full material + all part labels
      this.annotations.setPartLabels(this.getTourPartLabels(), this.getTourPartLabels().length, this.getLabelCenter());
    }
    if (i >= 6) { // step 6 start: labels off, blocks standing, ball in cup
      this.annotations.setPartLabels(null, 0);
      this.physics.resetBlocks();
      this.physics.ballReleased = false;
      this.setPullAngle(0);
      this.updateBallInCup();
    }
    if (i >= 7) { // step 7 start: slow-mo replay, blocks reset, ball in cup
      this.setSlowMo(true);
      this.physics.resetBlocks();
      this.physics.ballReleased = false;
      this.setPullAngle(0);
      this.updateBallInCup();
    }
  }

  getTourPartLabels() {
    // Anchors come from the REAL rendered meshes (getWorldPosition) so the
    // label dots sit exactly on the parts as the wood3D model is framed,
    // instead of guessed local offsets that drift off-target.  The seven
    // parts follow the user-defined order: 配重箱 / 摆杆 / 底座 / 支架 /
    // 碗 / 轮 / 箱子(右侧立方体塔).
    const t = this.trebuchet;
    const wp = (m, fallback) => {
      const v = new THREE.Vector3();
      if (m && m.getWorldPosition) m.getWorldPosition(v);
      else v.set(t.group.position.x + (fallback ? fallback[0] : 0), fallback ? fallback[1] : 0.3, fallback ? fallback[2] : 0);
      return v;
    };
    // 摆杆中点 = 碗端与枢轴中点（臂梁中心）
    // 轮身锚点：轮心（轴承处）上偏到褐色轮圈顶部，让引线指向轮子本体
    const wheelAnchor = (m) => {
      const v = wp(m);
      v.y += 0.055;
      return v;
    };
    const cupV = wp(t.cupMesh);
    const pivotV = wp(t.pivotMesh);
    const armV = cupV.clone().add(pivotV).multiplyScalar(0.5);
    // 箱子 = 右侧立方体塔中心（blockMeshes 平均世界位置）
    let blocksV = new THREE.Vector3(t.group.position.x + 1.6, 0.18, 0);
    const bm = this.physics && this.physics.blockMeshes;
    if (bm && bm.length) {
      const acc = new THREE.Vector3();
      const tmp = new THREE.Vector3();
      let k = 0;
      bm.forEach((m) => { if (m && m.getWorldPosition) { m.getWorldPosition(tmp); acc.add(tmp); k++; } });
      if (k) blocksV = acc.divideScalar(k);
    }
    return [
      { name: 'Counterweight 配重箱', pos: wp(t.counterweightMesh) },
      { name: 'Arm 摆杆', pos: armV },
      { name: 'Chassis 底座', pos: wp(t.chassisMesh) },
      { name: 'A-frame 支架', pos: wp(t.aframeMesh) },
      { name: 'Ball 球', pos: wp(t.cupMesh) },
      { name: 'Wheels 轮', pos: wheelAnchor(t.wheelMesh) },
      { name: 'Blocks 箱子', pos: blocksV },
    ];
  }

  getLabelCenter() {
    // World-space centre the part labels radiate around (trebuchet body core)
    const g = this.trebuchet.group.position;
    return new THREE.Vector3(g.x, g.y + 0.34, 0);
  }

  async playTourFrom(startStep, singleStep = null) {
    const signal = this.tourAbortController.signal;

    const sleep = (ms) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Tour aborted'));
      const id = setTimeout(() => resolve(), ms);
      signal.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new Error('Tour aborted'));
      }, { once: true });
    });

    const tweenPromise = (from, to, duration, easing, onUpdate) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Tour aborted'));
      let finished = false;
      const tw = new TWEEN.Tween(from)
        .to(to, duration)
        .easing(easing || TWEEN.Easing.Cubic.InOut)
        .onUpdate(onUpdate)
        .onComplete(() => {
          if (!finished) {
            finished = true;
            resolve();
          }
        })
        .start();

      const timeoutId = setTimeout(() => {
        if (!finished) {
          finished = true;
          resolve();
        }
      }, duration + 60);

      signal.addEventListener('abort', () => {
        finished = true;
        clearTimeout(timeoutId);
        tw.stop();
        reject(new Error('Tour aborted'));
      }, { once: true });
    });

    try {
      // -----------------------------------------------------------------
      // Step 1: 图纸 Blueprint
      // -----------------------------------------------------------------
      if (startStep <= 0 && (singleStep === null || singleStep === 0)) {
        this.environment.showPaperSketch();
        this.trebuchet.group.visible = false;
        this.trebuchet.setMorphFactor(0);
        if (this.cutoutMesh) this.cutoutMesh.visible = false;
        if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
        this.physics.blockMeshes.forEach(m => m.visible = false);
        if (this.physics.ballMesh) this.physics.ballMesh.visible = false;

        this.setCameraView('Top', 800);
        this.showTourBanner('1/8 Blueprint — hand-drawn trebuchet sketch on engineering paper');
        this.updateScrubber(0.06, '00:05');
        this.highlightTourStep(0);
        await sleep(1400);
      }

      // -----------------------------------------------------------------
      // Step 2: 图纸轮廓高亮 -> 2D纸片立起（平面 -> 立起）
      // -----------------------------------------------------------------
      if (startStep <= 1 && (singleStep === null || singleStep === 1)) {
        this.environment.hidePaperSketch();
        this.showTourBanner('2/8 Blueprint outline highlights, then lifts off as 2D cutouts');
        this.updateScrubber(0.19, '00:16');
        this.highlightTourStep(1);

        // Outline highlight: cutouts fade in flat on the paper (contours emerge)
        if (this.cutoutMesh) {
          this.cutoutMesh.visible = true;
          this.cutoutMesh.rotation.x = -Math.PI / 2;
          this.cutoutMesh.material.opacity = 0;
        }
        if (this.blocksCutoutMesh) {
          this.blocksCutoutMesh.visible = true;
          this.blocksCutoutMesh.rotation.x = -Math.PI / 2;
          this.blocksCutoutMesh.material.opacity = 0;
        }
        this.setCameraView('Side', 1600);
        sound.playPaperSlide();
        await Promise.all([
          tweenPromise({ op: 0 }, { op: 1 }, 900, TWEEN.Easing.Quadratic.Out, (o) => {
            if (this.cutoutMesh) this.cutoutMesh.material.opacity = o.op;
            if (this.blocksCutoutMesh) this.blocksCutoutMesh.material.opacity = o.op;
          }),
          sleep(600)
        ]);

        // Stand up: rotate from flat (-PI/2) to vertical (0)
        await tweenPromise(
          { rotX: -Math.PI / 2 },
          { rotX: 0 },
          1600,
          TWEEN.Easing.Cubic.InOut,
          (o) => {
            if (this.cutoutMesh) this.cutoutMesh.rotation.x = o.rotX;
            if (this.blocksCutoutMesh) this.blocksCutoutMesh.rotation.x = o.rotX;
          }
        );
        await sleep(350);
      }

      // -----------------------------------------------------------------
      // Step 3: 2D纸片 -> 3D白模型（morph 0 -> 0.66）
      // -----------------------------------------------------------------
      if (startStep <= 2 && (singleStep === null || singleStep === 2)) {
        this.showTourBanner('3/8 2D cutouts unfold into a 3D white model');
        this.updateScrubber(0.38, '00:32');
        this.highlightTourStep(2);
        this.trebuchet.group.visible = true;
        this.trebuchet.setMorphFactor(0.01);
        this.physics.setMorphFactor(0.33);
        this.physics.blockMeshes.forEach(m => m.visible = true);

        await Promise.all([
          tweenPromise(
            { f: 0.01 },
            { f: 0.66 },
            1800,
            TWEEN.Easing.Cubic.InOut,
            (o) => {
              this.trebuchet.setMorphFactor(o.f);
              this.physics.setMorphFactor(o.f);
              this.morphSlider.value = Math.round(o.f * 100);
            }
          ),
          (this.cutoutMesh || this.blocksCutoutMesh) ? tweenPromise(
            { op: 1 },
            { op: 0 },
            1100,
            TWEEN.Easing.Cubic.In,
            (o) => {
              if (this.cutoutMesh) this.cutoutMesh.material.opacity = o.op;
              if (this.blocksCutoutMesh) this.blocksCutoutMesh.material.opacity = o.op;
            }
          ) : Promise.resolve()
        ]);
        if (this.cutoutMesh) this.cutoutMesh.visible = false;
        if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
        await sleep(400);
      }

      // -----------------------------------------------------------------
      // Step 4: 白模型 -> 正式的材质3D模型
      // -----------------------------------------------------------------
      if (startStep <= 3 && (singleStep === null || singleStep === 3)) {
        this.showTourBanner('4/8 White model takes on balsa wood, metal pins & lead counterweight');
        this.updateScrubber(0.53, '00:45');
        this.highlightTourStep(3);
        this.setCameraView('Hero', 1800);
        await tweenPromise(
          { f: 0.66 },
          { f: 1.0 },
          1600,
          TWEEN.Easing.Cubic.InOut,
          (o) => {
            this.trebuchet.setMorphFactor(o.f);
            this.physics.setMorphFactor(o.f);
            this.morphSlider.value = Math.round(o.f * 100);
          }
        );
        if (this.physics.ballMesh) this.physics.ballMesh.visible = true;
        this.physics.ballReleased = false;
        this.setPullAngle(0);
        this.updateBallInCup();
        await sleep(600);
      }

      // -----------------------------------------------------------------
      // Step 5: 渐进式显示每个主要部件名称（点线+文字）
      // -----------------------------------------------------------------
      if (startStep <= 4 && (singleStep === null || singleStep === 4)) {
        this.showTourBanner('5/8 Parts — labels point to each major component');
        this.updateScrubber(0.68, '00:57');
        this.highlightTourStep(4);
        const labels = this.getTourPartLabels();
        for (let i = 1; i <= labels.length; i++) {
          this.annotations.setPartLabels(labels, i, this.getLabelCenter());
          await sleep(420);
        }
        await sleep(900);
      }

      // -----------------------------------------------------------------
      // Step 6: 先示意，然后执行拖拽摆杆完成发射
      // -----------------------------------------------------------------
      if (startStep <= 5 && (singleStep === null || singleStep === 5)) {
        this.showTourBanner('6/8 Hold the cup, pull down, let go — fire!');
        this.updateScrubber(0.84, '01:11');
        this.highlightTourStep(5);
        this.annotations.setPartLabels(null, 0);

        // 示意：animated drag hint over the cup
        this.annotations.showDragHint(this.trebuchet.getCupWorldPosition());
        await sleep(2000);
        this.annotations.hideDragHint();

        // 执行拖拽（模拟按住碗下拉再松手）
        let lastPullSoundAngle = 0;
        await tweenPromise(
          { pull: 0 },
          { pull: 84.5 },
          900,
          TWEEN.Easing.Cubic.Out,
          (o) => {
            this.setPullAngle(o.pull);
            if (Math.abs(o.pull - lastPullSoundAngle) >= 5) {
              sound.playTilt(0.4);
              lastPullSoundAngle = o.pull;
            }
          }
        );
        await sleep(250);
        this.fire();
        await sleep(2400);
      }

      // -----------------------------------------------------------------
      // Step 7: 慢镜回放刚才的发射
      // -----------------------------------------------------------------
      if (startStep <= 6 && (singleStep === null || singleStep === 6)) {
        this.showTourBanner('7/8 Slow-motion replay at quarter speed (0.25×)');
        this.updateScrubber(0.94, '01:19');
        this.highlightTourStep(6);
        this.physics.resetBlocks();
        this.physics.wakeBlocks();
        this.physics.ballReleased = false;
        this.updateBallInCup();
        this.setSlowMo(true);

        let lastReplayPullSound = 0;
        await tweenPromise(
          { pull: 0 },
          { pull: 84.5 },
          700,
          TWEEN.Easing.Cubic.Out,
          (o) => {
            this.setPullAngle(o.pull);
            if (Math.abs(o.pull - lastReplayPullSound) >= 5) {
              sound.playTilt(0.4);
              lastReplayPullSound = o.pull;
            }
          }
        );
        await sleep(200);
        this.fire();
        // Full slow-mo replay: keep playing until the iron ball leaves the
        // scene (flies out of view) or comes to rest after impact — never
        // pause right after it lands.  Bounded by a generous timeout.
        const ballMesh = this.physics.ballMesh;
        const ballBody = this.physics.ballBody;
        const replayStart = performance.now();
        await new Promise((resolve) => {
          const check = () => {
            const v = new THREE.Vector3();
            if (ballMesh && ballMesh.getWorldPosition) ballMesh.getWorldPosition(v);
            const out = Math.abs(v.x) > 2.5 || v.y < -0.3 || Math.abs(v.z) > 2.0;
            const settled = ballBody && this.physics.ballReleased && ballBody.velocity.length() < 0.06;
            if (out || settled || performance.now() - replayStart > 24000) resolve();
            else requestAnimationFrame(check);
          };
          check();
        });
      }

      // -----------------------------------------------------------------
      // Step 8: 切到 build it yourself
      // -----------------------------------------------------------------
      if (startStep <= 7 && (singleStep === null || singleStep === 7)) {
        this.showTourBanner('8/8 Tour complete — now build it yourself');
        this.updateScrubber(1.0, '01:24');
        this.highlightTourStep(7);
        // End state: no auto fire, no leftover replay — just reset to the
        // manipulable idle state and switch to build-it-yourself mode.
        this.setSlowMo(false);
        this.physics.resetBlocks();
        this.physics.ballReleased = false;
        this.setPullAngle(0);
        this.updateBallInCup();
        this.setPlayButtonState(false);
        await sleep(400);
        this.hideTourBanner();
        this.showBuildPanel();
        this.updateNavButtons('build');
      }
    } catch (err) {
      if (err.message === 'Tour aborted') {
        console.log('Tour stopped or reset by user.');
      } else {
        console.error(err);
      }
    }
  }

  showTourBanner(text) {
    this.tourBannerText.textContent = text;
    this.tourBanner.classList.remove('hidden');
  }

  hideTourBanner() {
    this.tourBanner.classList.add('hidden');
  }

  updateScrubber(progress, timeStr) {
    const pct = Math.min(100, Math.max(0, progress * 100));
    this.scrubberProgress.style.width = `${pct}%`;
    this.scrubberThumb.style.left = `${pct}%`;
    this.scrubberCurrentTime.textContent = timeStr;
    this.highlightTourStep(Math.min(7, Math.max(0, Math.floor(progress * 8))));
  }

  highlightTourStep(i) {
    if (!this.tourSteps) this.tourSteps = document.querySelectorAll('.tour-step');
    this.tourSteps.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === i);
    });
  }

  setSlowMo(enabled) {
    this.slowMotion = enabled;
    this.timeScale = enabled ? 0.25 : 1.0;
    if (enabled) {
      this.slowMoBadge.classList.remove('hidden');
      this.btnToggleSlowMo.classList.add('active');
    } else {
      this.slowMoBadge.classList.add('hidden');
      this.btnToggleSlowMo.classList.remove('active');
    }
  }

  // Toggle nav button active states: 'tour' or 'build'
  updateNavButtons(mode) {
    if (mode === 'tour') {
      this.btnPlayTour.classList.remove('btn-secondary');
      this.btnPlayTour.classList.add('btn-primary');
      this.btnBuildYourself.classList.remove('btn-primary');
      this.btnBuildYourself.classList.add('btn-secondary');
    } else {
      this.btnBuildYourself.classList.remove('btn-secondary');
      this.btnBuildYourself.classList.add('btn-primary');
      this.btnPlayTour.classList.remove('btn-primary');
      this.btnPlayTour.classList.add('btn-secondary');
    }
  }

  showBuildPanel() {
    if (this.tourAbortController) {
      this.tourAbortController.abort();
      this.tourAbortController = null;
    }
    this.isTourRunning = false;
    this.setPlayButtonState(false);
    this.setSlowMo(false);
    this.tourBanner.classList.add('hidden');

    // Keep desk paper sketch hidden and 2D cutout hidden
    this.environment.hidePaperSketch();
    if (this.cutoutMesh) this.cutoutMesh.visible = false;
    if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;

    // Full 3D textured model
    this.trebuchet.group.visible = true;
    this.trebuchet.setMorphFactor(1.0);
    this.physics.setMorphFactor(1.0);
    this.morphSlider.value = 100;
    this.physics.blockMeshes.forEach(m => m.visible = true);
    if (this.physics.ballMesh) this.physics.ballMesh.visible = true;

    this.buildPanel.classList.remove('hidden');
    this.showDragHintFor(2000);
    this.playerScrubber.classList.add('hidden');
    this.annotations.showTrajectories = false;
    this.updateNavButtons('build');

    // Reset arm to rest (0° pull, counterweight on floor, spoon up)
    this.setPullAngle(0);
    this.physics.ballReleased = false;
    this.updateBallInCup();
    this.updateDragHint();

    if (this.currentView === 'Top') {
      this.setCameraView('Hero', 1000);
    }
  }

  updateDragHint() {
    if (!this.dragHint || this.isTourRunning) return;
    const message = this.currentView === 'Top'
      ? 'Top view: use the controls to launch'
      : 'Hold the cup, pull down, and let go';
    this.dragHint.innerHTML = `<span class="dot">●</span> ${message}`;
  }

  // Show the build-mode top hint for `ms`, then auto-hide. Re-showing resets
  // the timer (used on entering build mode and after Reset).
  showDragHintFor(ms = 2000) {
    if (!this.dragHint || this.isTourRunning) return;
    this.updateDragHint();
    this.dragHint.classList.remove('hidden');
    if (this._dragHintTimer) clearTimeout(this._dragHintTimer);
    this._dragHintTimer = setTimeout(() => {
      this.dragHint.classList.add('hidden');
      this._dragHintTimer = null;
    }, ms);
  }

  // Interactive mouse dragging & controls
  initEvents() {
    // Window resize — re-fit current view
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      // Re-apply current camera view instantly (no animation)
      if (this.currentView) {
        this.setCameraView(this.currentView, 0);
      }
    });

    // Tour buttons
    this.btnPlayTour.addEventListener('click', () => {
      sound.init();
      this.playTour();
    });

    this.btnBuildYourself.addEventListener('click', () => {
      sound.init();
      this.environment.hidePaperSketch();
      this.showBuildPanel();
    });

    // Fire button
    this.btnFire.addEventListener('click', () => {
      // The panel is available in custom mode, including Top view.  The tour
      // stays playback-only even if a hidden control receives a focus event.
      if (this.isTourRunning) return;
      sound.init();
      this.fire();
    });

    // Reset button
    this.btnReset.addEventListener('click', () => {
      this.resetAll();
      this.showDragHintFor(2000);
    });

    // Slow motion toggle
    this.btnToggleSlowMo.addEventListener('click', () => {
      this.setSlowMo(!this.slowMotion);
    });

    // Flight path toggle (controls live recorded trajectory only; reference arcs stay hidden)
    this.btnToggleFlightPath.addEventListener('click', () => {
      this.flightPathEnabled = !this.flightPathEnabled;
      this.btnToggleFlightPath.classList.toggle('active', this.flightPathEnabled);
      if (!this.flightPathEnabled) this.annotations.clear();
    });

    // Weight slider (changes counterweight mass)
    this.ballSlider.addEventListener('input', (e) => {
      this.setBallMass(parseFloat(e.target.value));
    });

    this.weightSlider.addEventListener('input', (e) => {
      this.setWeight(parseFloat(e.target.value));
      this.annotations.showWeightCallout = true;
      clearTimeout(this._weightCalloutTimeout);
      this._weightCalloutTimeout = setTimeout(() => {
        this.annotations.showWeightCallout = false;
      }, 2000);
    });

    // Throw / Pull slider
    this.pullSlider.addEventListener('input', (e) => {
      this.setPullAngle(parseInt(e.target.value));
      sound.playTilt(0.45);
    });

    // Morph slider (Sketch to Model)
    this.morphSlider.addEventListener('input', (e) => {
      const factor = parseInt(e.target.value) / 100;
      this.trebuchet.setMorphFactor(factor);
      this.physics.setMorphFactor(factor);
      // Blocks visible once past sketch phase
      this.physics.blockMeshes.forEach(m => m.visible = factor > 0.05);
      if (this.physics.ballMesh) this.physics.ballMesh.visible = factor > 0.05;
      // Show/hide pencil sketch on paper
      if (factor <= 0.05) this.environment.showPaperSketch();
      else this.environment.hidePaperSketch();
    });

    // Camera view buttons
    this.btnViewHero.addEventListener('click', () => this.setCameraView('Hero'));
    this.btnViewSide.addEventListener('click', () => this.setCameraView('Side'));
    this.btnViewTop.addEventListener('click', () => this.setCameraView('Top'));

    // Zoom slider
    this.zoomSlider.addEventListener('input', (e) => {
      this.zoomFactor = parseInt(e.target.value) / 100;
      if (this.currentView) this.setCameraView(this.currentView, 0);
    });

    // Sound toggle
    this.soundBtn.addEventListener('click', () => {
      const muted = sound.toggleMute();
      this.soundBtn.style.opacity = muted ? '0.4' : '1';
    });
    this.scrubberMute.addEventListener('click', () => {
      const muted = sound.toggleMute();
      this.scrubberMute.style.opacity = muted ? '0.4' : '1';
    });

    // Scrubber player controls (Play, Rewind, Fast Forward, Timeline click)
    if (this.scrubberPlay) {
      this.scrubberPlay.addEventListener('click', () => {
        sound.init();
        this.toggleTourPlay();
      });
    }

    if (this.scrubberRw) {
      this.scrubberRw.addEventListener('click', () => {
        sound.init();
        this.resetToFirstFrame();
      });
    }

    if (this.scrubberFf) {
      this.scrubberFf.addEventListener('click', () => {
        sound.init();
        this.showBuildPanel();
      });
    }

    document.querySelectorAll('.tour-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.init();
        const step = parseInt(btn.dataset.step, 10);
        this.seekTourStep(step);
      });
    });

    if (this.scrubberContainer) {
      // Drag / click the scrubber to seek to any of the 8 tour steps.
      // The track is divided into 8 equal segments; releasing seeks to that
      // step, which lands on its start state and replays from there.
      let seekDragging = false;
      const seekProgress = (clientX) => {
        const rect = this.scrubberContainer.getBoundingClientRect();
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      };
      const seekTime = (p) => {
        const t = Math.round(p * 84);
        const m = Math.floor(t / 60), s = t % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };
      this.scrubberContainer.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        seekDragging = true;
        try { this.scrubberContainer.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
        const p = seekProgress(e.clientX);
        this.updateScrubber(p, seekTime(p));
      });
      this.scrubberContainer.addEventListener('pointermove', (e) => {
        if (!seekDragging) return;
        const p = seekProgress(e.clientX);
        this.updateScrubber(p, seekTime(p));
      });
      const seekCommit = (e) => {
        if (!seekDragging) return;
        seekDragging = false;
        const p = seekProgress(e.clientX);
        const step = Math.min(7, Math.max(0, Math.floor(p * 8)));
        sound.init();
        this.seekTourStep(step);
      };
      this.scrubberContainer.addEventListener('pointerup', seekCommit);
      this.scrubberContainer.addEventListener('pointercancel', () => { seekDragging = false; });
    }

    // Mouse / Touch Dragging of the spoon downwards:
    // The pointer is projected on the arm's movement plane, then its height
    // is converted back to an arm angle.  This keeps the cup under the held
    // pointer instead of using a loose, fixed pixels-to-degrees conversion.
    const getPointerOnDragPlane = (e) => {
      const bounds = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - bounds.left) / bounds.width) * 2 - 1;
      this.mouse.y = -((e.clientY - bounds.top) / bounds.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      return this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPointerWorld);
    };

    const finishDrag = (launch) => {
      if (!this.isDraggingCup) return;

      this.isDraggingCup = false;
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragUp);
      window.removeEventListener('pointercancel', onDragCancel);
      if (this.activePointerId !== null) {
        this.renderer.domElement.releasePointerCapture?.(this.activePointerId);
      }
      this.activePointerId = null;

      // A press is only a grab.  The arm launches exclusively after a real,
      // downward pull and release, so accidental clicks cannot fire the ball.
      if (launch && this.dragMoved && this.pullDeg > 8) this.fire(true);
      this.controls.enabled = true;
    };

    const onPointerDown = (e) => {
      // Hero and Side show the throwing arc clearly enough for direct
      // manipulation.  Top is deliberately panel-only: its almost parallel
      // camera ray makes a spoon drag ambiguous, while Fire still works.
      if (
        e.button !== 0 ||
        this.isFiring ||
        this.isTourRunning ||
        this.currentView === 'Top' ||
        this.isCameraTransitioning ||
        this.physics.ballReleased  // No ball in cup → can't drag
      ) return;
      const bounds = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - bounds.left) / bounds.width) * 2 - 1;
      this.mouse.y = -((e.clientY - bounds.top) / bounds.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const objectsToTest = [this.trebuchet.cupMesh, this.physics.ballMesh].filter(Boolean);
      const intersects = this.raycaster.intersectObjects(objectsToTest, true);

      if (intersects.length > 0) {
        this.controls.enabled = false; // spoon drag takes the pointer
        // Preserve the grab height at the exact point touched.  The drag
        // plane is parallel to the arm's XY rotation plane and goes through
        // that point, so perspective does not make the cup lag behind.
        const hitPoint = intersects[0].point;
        this.dragPlane.set(new THREE.Vector3(0, 0, 1), -hitPoint.z);
        if (!getPointerOnDragPlane(e)) return;
        this.dragGrabOffsetY = this.trebuchet.getCupWorldPosition().y - this.dragPointerWorld.y;
        this.isDraggingCup = true;
        this.dragStartY = e.clientY;
        this.initialPullVal = this.pullDeg;
        this.dragMoved = false;
        this._lastDragPull = this.pullDeg;
        this._lastTiltAt = 0;
        this._dragPendulum = 0;
        this.activePointerId = e.pointerId;
        this.renderer.domElement.setPointerCapture?.(e.pointerId);
        sound.init();
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onDragUp);
        window.addEventListener('pointercancel', onDragCancel);
        e.preventDefault();
      }
    };

    const onDragMove = (e) => {
      if (!this.isDraggingCup || e.pointerId !== this.activePointerId) return;
      if (!getPointerOnDragPlane(e)) return;

      const localCup = this.trebuchet.cupMesh.position;
      const cupRadius = Math.hypot(localCup.x, localCup.y);
      const cupLocalAngle = Math.atan2(localCup.y, localCup.x);
      this.trebuchet.armPivot.getWorldPosition(this.dragPivotWorld);

      // Along the permitted pull arc, cup height falls monotonically as the
      // pull angle rises.  Inverting that arc makes the cup follow the held
      // mouse/touch position in real time.
      const desiredCupY = this.dragPointerWorld.y + this.dragGrabOffsetY;
      const normalizedY = THREE.MathUtils.clamp(
        (desiredCupY - this.dragPivotWorld.y) / cupRadius,
        -1,
        1
      );
      const armAngle = Math.PI - Math.asin(normalizedY) - cupLocalAngle;
      const calculatedPull = THREE.MathUtils.radToDeg(armAngle - this.trebuchet.REST_ANGLE);
      const pullVal = Math.min(
        this.MAX_PULL_DEG,
        Math.max(this.initialPullVal, calculatedPull)
      );
      if (pullVal - this.initialPullVal > 1) this.dragMoved = true;
      this.setPullAngle(pullVal);

      // Pendulum + continuous sound tied to drag speed
      if (this._lastDragPull === undefined) this._lastDragPull = this.pullDeg;
      const pullDelta = pullVal - this._lastDragPull;
      const dragVel = pullDelta * 0.002;
      this._lastDragPull = pullVal;
      this._dragPendulum = (this._dragPendulum || 0) * 0.90 + dragVel * 0.4;
      this.trebuchet.cwGroup.rotation.z = -(this.trebuchet.REST_ANGLE + THREE.MathUtils.degToRad(pullVal)) + this._dragPendulum;

      // Continuous tilt sound: same crisp click on every drag frame
      if (this.dragMoved && Math.abs(pullDelta) > 0.05) {
        sound.playTilt(0.5);
      }
    };

    const onDragUp = (e) => {
      if (e.pointerId === this.activePointerId) finishDrag(true);
    };

    const onDragCancel = (e) => {
      if (e.pointerId === this.activePointerId) finishDrag(false);
    };

    this.renderer.domElement.addEventListener('pointerdown', onPointerDown);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(this.clock.getDelta(), 0.05) * this.timeScale;

    TWEEN.update();

    // OrbitControls damping needs a per-frame update. During the tour and
    // camera transitions the view is scripted, so the orbit stays disabled.
    if (this.isTourRunning || this.isCameraTransitioning || this.isDraggingCup) {
      this.controls.enabled = false;
    } else {
      this.controls.enabled = true;
    }
    this.controls.update();

    // Step physics
    this.physics.step(delta);
    this.physics.updateBlockHitVisuals();
    // Keep DOWN live after a completed shot: cascading topples can continue for
    // seconds, and the counter must match the knocked-down block visuals exactly.
    if (this.showFlightAnnotations) {
      this.updateDownCount();
    }

    // Recoil dynamics: the chassis kicks back on release, then returns on a
    // lightly-damped spring (ground friction kills the kick, the rest position
    // re-asserts).  Visual only — the physics anchor stays fixed so the
    // trajectory baseline is untouched.
    const trebGroup = this.trebuchet.group;
    if (Math.abs(this.recoilVel) > 1e-4 || Math.abs(trebGroup.position.x - this.recoilBaseX) > 1e-4) {
      trebGroup.position.x += this.recoilVel * delta;
      this.recoilVel += ((this.recoilBaseX - trebGroup.position.x) * 90 - this.recoilVel * 12) * delta;
      if (Math.abs(this.recoilVel) < 1e-4 && Math.abs(trebGroup.position.x - this.recoilBaseX) < 1e-4) {
        trebGroup.position.x = this.recoilBaseX;
        this.recoilVel = 0;
      }
    }

    // Real hinge mechanism: sync the 3D arm from the physics bodies, detect
    // release at the stop angle, or finish the shot when the ball lands.
    this.updateMechanism();

    // Keep ball in cup if resting
    if (!this.physics.ballReleased) {
      this.updateBallInCup();
    }

    // Keep floating counterweight tag position updated
    this.annotations.setWeight(this.counterweightKg, this.trebuchet.getCounterweightWorldPosition());

    // Render 3D Scene
    this.renderer.render(this.scene, this.camera);

    // Render 2D Trajectory Arcs & Annotations
    this.annotations.render(this.counterweightKg);
  }
}

// Initialize on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
