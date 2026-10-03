import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';
// import confetti from 'canvas-confetti';

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
    this.annotationCanvas = document.getElementById('annotation-canvas'); this.annotationCanvas.style.display = 'none'; // model lock

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
    this.btnView3D = document.getElementById('btn-view-3d');
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
    this.counterweightKg = UI.counterweight.value; // hover recalibration — spec.js (default 4.8 kg throws the 0.45 kg ball onto the pyramid)
    this.ballKg = UI.ball.value; // solid steel projectile — spec.js (density 7850 kg/m³, r = 60% of the 100 mm bowl opening)
    this.flightPathEnabled = false;
    // Ball-stand feature: the cannonball starts on a wooden stand at the
    // lower-left of the paper; a click loads it into the cup, where the beam
    // settles like a seesaw under the real ball-vs-counterweight torque.
    this.ballLoaded = false;
    this.ballStandPos = new THREE.Vector3(-0.90, 0, 0.52); // stand centre on the paper, in FRONT of the trebuchet (faces the camera)
    this.ballStandSeatY = 0; // ball seat height, filled by createBallStand()
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
    // 135° down-pull = 45° from the mast (max energy, 4:1 lever [user:2026-09-29]);
    // at this pose the cradle bottom stays ~8 cm above the paper, so nothing penetrates.
    this.MAX_PULL_DEG = 135;
    this.pullDeg = 0;
    this.armVelocity = 0;

    // Ball load flight: the cannonball arcs from the stand into the cup along
    // a fast parabola on every load (Fire button, rack/cup click, tour FIRE).
    this._ballFlying = false;
    this._ballFlightTween = null;
    this._ballLoadPromise = null;
    this._ballLoadResolve = null;

    // model lock: hide trebuchet, show only cradle
    this._modelLock = 'cradle';
    this._loadSeq = 0;
    this._pointerUpDuringLoad = false;

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
    // Default view = Hero; Hero/Side/Top are FIXED views — free 3D orbit is
    // only available in 3D mode (user directive 2026-10-01).
    this.currentView = 'Hero';
    this.controls.enabled = false;

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

    // 3. Trebuchet model — kept hidden (code too coupled to remove safely now)
    this.trebuchet = new TrebuchetModel(this.scene, this.balsaTexture, this.leadTexture);
    this.trebuchet.setCounterweight(this.counterweightKg);
    this.trebuchet.group.visible = false;

    // 3b. Newton's Cradle (three.js inline, Blender glb loaded async on top)
    this.cradleGroup = new THREE.Group();
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x9a8060, roughness: 0.7 });
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.12), beamMat);
    topBeam.position.set(0, 0.32, 0);
    topBeam.castShadow = true;
    this.cradleGroup.add(topBeam);
    for (const sz of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.01), beamMat);
      side.position.set(0, 0.29, sz * 0.055);
      this.cradleGroup.add(side);
    }
    const clipMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b8, metalness: 0.8, roughness: 0.3 });
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c8, metalness: 0.9, roughness: 0.15 });
    const stringMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
    const mountMat = new THREE.MeshStandardMaterial({ color: 0xd4a84b, metalness: 0.6, roughness: 0.4 });
    this.cradleBalls = [];
    this.cradleAngles = [];
    const ballR = 0.025;
    for (let i = 0; i < 5; i++) {
      const x = -0.1 + i * 0.05;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(ballR, 32, 24), ballMat.clone());
      ball.position.set(x, 0.12, 0);
      ball.castShadow = true;
      this.cradleGroup.add(ball);
      const topY = 0.30, botY = ball.position.y + ballR;
      for (const sz of [-1, 1]) {
        const topZ = sz * 0.04, botZ = sz * 0.015;
        const dy = botY - topY, dz = botZ - topZ;
        const len = Math.hypot(dy, dz);
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.001, len, 6), stringMat);
        str.position.set(x, (topY+botY)/2, (topZ+botZ)/2);
        str.rotation.x = Math.atan2(dz, dy);
        this.cradleGroup.add(str);
        const mt = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12), mountMat);
        mt.position.set(x, botY - 0.002, botZ);
        this.cradleGroup.add(mt);
      }
      this.cradleBalls.push(ball);
      this.cradleAngles.push(0);
    }
    this.cradleGroup.position.set(0.12, 0.006, 0);
    this.cradleGroup.scale.setScalar(2);
    this.cradleGroup.visible = true;   // model lock: cradle always visible
    this.scene.add(this.cradleGroup);

    // Load Blender glb to replace inline model once ready
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => {
      new GLTFLoader().load('cradle.glb', (gltf) => {
        while (this.cradleGroup.children.length) this.cradleGroup.remove(this.cradleGroup.children[0]);
        gltf.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            // balls: keep original scale (re-exported from Blender)
            // replace Wood material with trebuchet wood
            if (o.material && o.material.name === 'Wood' && this.trebuchet.woodMat) {
              o.material = this.trebuchet.woodMat;
            }
            if (this._cradleEnvMap) {
              o.material.envMap = this._cradleEnvMap;
              o.material.envMapIntensity = 1.0;
              o.material.needsUpdate = true;
            }
          }
        });
        this.cradleGroup.add(gltf.scene);
      });
    });

    // Load custom EXR for metal reflections (via PMREM)
    this._cradleEnvMap = null;
    import('three/addons/loaders/EXRLoader.js').then(({ EXRLoader }) => {
      new EXRLoader().load('env.exr', (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        const envRT = pmrem.fromEquirectangular(hdr);
        this._cradleEnvMap = envRT.texture;
        this.cradleGroup.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material.envMap = this._cradleEnvMap;
            o.material.envMapIntensity = 1.0;
            o.material.needsUpdate = true;
          }
        });
        hdr.dispose();
        pmrem.dispose();
      });
    });

    // 3c. Newton cradle 2D cutout (full sketch on cream paper, stands up)
    const cutoutCanvas = document.createElement('canvas');
    cutoutCanvas.width = 1024; cutoutCanvas.height = 768;
    const cctx = cutoutCanvas.getContext('2d');
    cctx.fillStyle = '#f7f4ea';
    cctx.fillRect(0, 0, 1024, 768);
    const cutoutTex = new THREE.CanvasTexture(cutoutCanvas);
    cutoutTex.colorSpace = THREE.SRGBColorSpace;
    const cutoutImg = new Image();
    cutoutImg.onload = () => {
      cctx.fillStyle = '#ffffff';
      cctx.fillRect(0,0,1024,768);
      const scale = Math.min(900/cutoutImg.width, 700/cutoutImg.height);
      const dw = cutoutImg.width*scale, dh = cutoutImg.height*scale;
      cctx.drawImage(cutoutImg, (1024-dw)/2, 768-dh, dw, dh);
      cutoutTex.needsUpdate = true;
    };
    cutoutImg.src = 'sketch.jpg';
    const cutoutGeom = new THREE.PlaneGeometry(1.35, 0.925);
    cutoutGeom.translate(0, 0.4625, 0);
    this.cradleCutout = new THREE.Mesh(
      cutoutGeom,
      new THREE.MeshStandardMaterial({ map: cutoutTex, side: THREE.DoubleSide, roughness: 0.9 })
    );
    this.cradleCutout.position.set(0.12, 0.007, 0.4625);
    this.cradleCutout.rotation.x = -Math.PI / 2;
    this.cradleCutout.visible = false;
    this.scene.add(this.cradleCutout);
    // Keep the UI sliders in sync with the physics-calibrated defaults (4.8 kg
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
    // Physical rope knot chain on the ring (Cannon nodes, see physics.buildRope);
    // the long winch->ring rope is a dynamic visual Tube (no force transfer).
    this.trebuchet.physics = this.physics;
    this.physics.buildRope();
    // Push the UI-default counterweight into the mechanism: createMechanism()
    // builds the cw body with the physics-constructor default (1.0 kg) and no
    // setCwMass() was called before, so the DEFAULT slider value (then 2.60 kg,
    // M6 pitfall; now 4.8 from spec.js UI.counterweight) never reached the
    // physics body — the arm hung cocked like the ball outweighed the box
    // (mechanism inversion).  Re-assert it now (and on every rebuild).
    this.physics.setCwMass(this.counterweightKg);

    // Ball stand (needs trebuchet.woodMat, so built after the model)
    this.createBallStand();

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


  // Wooden cannonball stand on the lower-left of the paper, in front of the
  // trebuchet: clear of the counterweight swing arc, the pencil and the block
  // scatter zone.  Uses the trebuchet wood material (same style family).
  createBallStand() {
    // Wooden ball rack per user reference: a two-tier stand.  Bottom layer is
    // a square base plank; top layer is a square tray with a bowl-shaped
    // centre depression that cups the cannonball.  Geometry (1 unit = 1 m):
    // base top y=0.020, tray top y=0.075, bowl mouth at y=0.075 with radius
    // 0.048 (holds ball r=0.030..0.040, centre settles in the bowl).
    const stand = new THREE.Group();
    const wood = this.trebuchet.woodMat;
    // Compact two-tier proportions so the cannonball (r=0.030..0.040) dominates
    // the rack like the reference: base 0.14 square, tray 0.11 square, bowl
    // r=0.042.  Ball sits half-sunk in the bowl and rises clearly above the rim.
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.014, 0.14), wood);
    base.position.y = 0.006 + 0.007;
    // Top tray: thin (0.024) square plank with a REAL circular hole cut all the
    // way through its top face, so the depression is visible from above (a
    // solid Box + embedded cup would be hidden by the plank face - the bug the
    // user kept seeing).  Tray bottom y=0.020, tray top y=0.044, hole
    // diameter 0.100 > the largest ball (0.080).  ExtrudeGeometry: square
    // shape minus a circular hole, extruded upward, then rotated so the
    // extrusion axis is +Y.
    const trayShape = new THREE.Shape();
    trayShape.moveTo(-0.060, -0.060);
    trayShape.lineTo(0.060, -0.060);
    trayShape.lineTo(0.060, 0.060);
    trayShape.lineTo(-0.060, 0.060);
    trayShape.closePath();
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, 0.050, 0, Math.PI * 2, true);
    trayShape.holes.push(holePath);
    const trayGeo = new THREE.ExtrudeGeometry(trayShape, { depth: 0.026, bevelEnabled: false });
    trayGeo.rotateX(-Math.PI / 2); // extrude axis +Z -> +Y (shape lies in XZ)
    const tray = new THREE.Mesh(trayGeo, wood);
    tray.position.y = 0.020; // tray bottom on the base top
    // Recess bottom: a spherical depression (lower hemisphere cap, ~1/3 sphere)
    // lathe-turned in the hole, so the cup is a real bowl, not a flat disc.
    // Sphere R=0.062, mouth r=0.050 flush with the tray top, cup depth 0.025,
    // bottom 0.001 above the tray bottom.  Double-sided + darker so the bowl
    // stays visible (the shared wood material must not be modified).
    const cupMat = wood.clone();
    cupMat.side = THREE.DoubleSide;
    cupMat.color.multiplyScalar(0.78);
    const sphereR = 0.062, rimR = 0.050, trayDepth = 0.026;
    const yc = trayDepth + Math.sqrt(sphereR * sphereR - rimR * rimR); // sphere centre (local y)
    const cupPts = [];
    const CUP_SEG = 14;
    for (let i = 0; i <= CUP_SEG; i++) {
      const t = i / CUP_SEG;
      const r = rimR * (1 - t);
      cupPts.push(new THREE.Vector2(r, yc - Math.sqrt(sphereR * sphereR - r * r)));
    }
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupPts, 24), cupMat);
    cup.position.y = 0.020; // cup base flush with the tray bottom
    [base, tray, cup].forEach((m) => { m.castShadow = true; m.receiveShadow = true; stand.add(m); });
    stand.position.set(this.ballStandPos.x, 0, this.ballStandPos.z);
    this.scene.add(stand);
    this.ballStand = stand;
    stand.visible = false; // hide trebuchet extras
    this._ballStandOrig = new Map();
    stand.traverse((obj) => { if (obj.isMesh) this._ballStandOrig.set(obj, obj.material); });
    this.ballStandSeatY = 0.020 + 0.001 - 0.005; // ball bottom beds 5mm INTO the cup, no light gap
    // Physical blocker for the rack: a landed/rolled ball must not slide
    // through the stand (user: 2026-09-30).
    this.physics.addBallStandCollider(this.ballStandPos.x, this.ballStandPos.z);
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
    if (this.physics.ballReleased) return;
    // While the ball is animating from the stand into the cup — including the
    // one-microtask seating hand-off after the tween completes — don't snap it
    // back to the rack/cup every frame: the flight tween owns the mesh until
    // the caller clears _ballFlying right before seating it in the cup.
    if (this._ballFlying) return;
    // While the ball is seated (not released) keep it collision-free: its body
    // sits inside the cup / on the stand, and the cup arc swings over the new
    // chassis body — mask 0 avoids the solver spitting it out.  releaseBall()
    // flips the mask back to 0xffffffff the moment it flies.
    this.physics.ballBody.collisionFilterMask = 0;
    const b = this.physics;
    if (!this.ballLoaded) {
      // Ball resting in the stand's arc groove (lower-left of the paper):
      // centre sits at the groove rim minus the ball radius, so the ball is
      // visibly cradled between the two side blocks.
      const sx = this.ballStandPos.x, sy = this.ballStandSeatY, sz = this.ballStandPos.z;
      const cy = sy + b.ballRadius;
      b.ballMesh.position.set(sx, cy, sz);
      b.ballBody.position.set(sx, cy, sz);
      b.ballBody.velocity.set(0, 0, 0);
      b.ballBody.angularVelocity.set(0, 0, 0);
      return;
    }
    // Ball in the cup: sits on the inner bowl floor (cup centre - (cupR - ballR))
    const cupPos = this.trebuchet.getCupWorldPosition();
    const restOffset = this.trebuchet.cupR - b.ballRadius;
    b.ballMesh.position.set(cupPos.x, cupPos.y - restOffset, cupPos.z);
    b.ballBody.position.set(cupPos.x, cupPos.y - restOffset, cupPos.z);
    b.ballBody.velocity.set(0, 0, 0);
    b.ballBody.angularVelocity.set(0, 0, 0);
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
    [this.btnViewHero, this.btnViewSide, this.btnViewTop, this.btnView3D].forEach(btn => btn?.classList.remove('active'));

    // Paper center: (0.12, 0, 0), size 2.7 x 1.85; objects up to y~0.55
    const look = new THREE.Vector3(0.12, 0.12, 0);
    let targetPos;

    if (viewName === 'Hero') {
      this.btnViewHero?.classList.add('active');
      // 3/4 angle: fit the WHOLE scene (trebuchet + block pyramid), paper
      // diagonal ~2.9 wide projected; widened to 3.4 so the pyramid's far
      // edge stays fully inside the frame.
      const d = this.getFitDistance(3.4, 1.1);
      targetPos = new THREE.Vector3(0.12 + d * 0.35, look.y + d * 0.55, look.z + d * 0.85);
    } else if (viewName === 'Side') {
      this.btnViewSide?.classList.add('active');
      // Side view: fit paper width (2.7) and object height (0.65); widened.
      const d = this.getFitDistance(3.2, 0.85);
      targetPos = new THREE.Vector3(look.x, look.y + d * 0.15, look.z + d);
    } else if (viewName === 'Top') {
      this.btnViewTop?.classList.add('active');
      // Top view: fit paper width (2.7) and depth (1.85); widened.
      const d = this.getFitDistance(3.3, 2.2);
      targetPos = new THREE.Vector3(look.x, look.y + d, look.z + 0.01);
    } else if (viewName === '3D') {
      this.btnView3D?.classList.add('active');
      // Free 3D orbit: keep the current camera pose, just hand control back
      // for mouse / trackpad / keyboard navigation.  No camera animation.
      this.isCameraTransitioning = false;
      this.controls.enabled = true;
      this.controls.update();
      this.updateDragHint();
      return;
    }

    if (duration === 0) {
      this.camera.position.copy(targetPos);
      this.camera.lookAt(look);
      this.controls.target.copy(look);
      this.controls.update();
      this.controls.enabled = false; // Hero/Side/Top are fixed views
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
          this.controls.enabled = false; // Hero/Side/Top are fixed views
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
  // Load the cannonball into the cup.  Instead of teleporting, the ball arcs
  // from the stand into the cup along a fast parabola, so its origin is always
  // visible.  The beam is freed on the live hinge so it settles like a seesaw
  // under the real torque balance: a heavy ball tips it cup-down (left-tilted,
  // cannot throw), a heavy counterweight keeps it ready to drag.
  async loadBall() {
    if (this.ballLoaded || this._ballFlying || this.physics.ballReleased || this.isFiring) return;
    if (this.isTourRunning) return; // the tour drives its own load step
    const seq = ++this._loadSeq;
    sound.playTilt(0.6);
    await this.flyBallToCup(); // ball flies stand -> cup along a parabola
    if (seq !== this._loadSeq) return; // cancelled mid-flight (e.g. Reset)
    this.ballLoaded = true;
    // Seating hand-off: the flight tween is done and the cup owns the ball
    // now.  Clear the flag BEFORE updateBallInCup() so the seat actually runs;
    // it stayed set through the await so no per-frame call could yank the
    // just-landed ball back to the rack.
    this._ballFlying = false;
    this.rebalanceLoaded(); // 4:1 lever gate: cw holds right tilt (ready) or ball seesaws down
    this.updateBallInCup();
    // No ball-weight callout / no drag instruction when loading by click:
    // only the slider-adjusted weight hint stays (user directive 2026-10-01).
  }

  // Fast parabolic flight from the stand (the ball's current rest position)
  // into the cup.  A quadratic Bézier is exactly a parabola: the control point
  // sits at the horizontal midpoint, apex above both endpoints.  Only the mesh
  // moves — the physics body stays parked on the stand (collision mask 0) until
  // the flight completes, when callers seat it via updateBallInCup().  Returns
  // a promise resolved once the ball reaches the cup.
  flyBallToCup() {
    if (this._ballFlying) return this._ballLoadPromise;
    const b = this.physics;
    if (!b.ballMesh) return Promise.resolve();
    const standPos = b.ballMesh.position.clone();
    const cupTarget = this.trebuchet.getCupWorldPosition();
    cupTarget.y -= this.trebuchet.cupR - b.ballRadius;

    // Apex ~0.17 m above the higher endpoint — clearly readable from every view
    const apex = Math.max(0.14, Math.abs(cupTarget.y - standPos.y) * 0.3 + 0.17);
    const cx = (standPos.x + cupTarget.x) / 2;
    const cz = (standPos.z + cupTarget.z) / 2;
    const cy = Math.max(standPos.y, cupTarget.y) + apex;

    this._ballFlying = true;
    sound.playLoadWhoosh();
    const self = this;
    this._ballLoadPromise = new Promise((resolve) => {
      self._ballLoadResolve = resolve;
      const tween = new TWEEN.Tween({ f: 0 })
        .to({ f: 1 }, 300) // fast, decisive toss
        .easing(TWEEN.Easing.Quadratic.InOut)
        .onUpdate((o) => {
          const f = o.f, g = 1 - f;
          // Quadratic Bézier (parabola): P(t) = g²P0 + 2gf·C + f²P2
          b.ballMesh.position.set(
            g * g * standPos.x + 2 * g * f * cx + f * f * cupTarget.x,
            g * g * standPos.y + 2 * g * f * cy + f * f * cupTarget.y,
            g * g * standPos.z + 2 * g * f * cz + f * f * cupTarget.z
          );
        })
        .onComplete(() => {
          // The flight flag stays set through the seating hand-off: the caller
          // (loadBall / tour FIRE step) clears it only after it has seated the
          // ball in the cup.  If we cleared it here, the same RAF tick's
          // per-frame updateBallInCup() would see ballLoaded still false and
          // pin the ball back to the rack for one rendered frame (the "ghost
          // ball on the stand" flash), then the microtask continuation would
          // snap it into the cup.
          self._ballFlightTween = null;
          if (self._ballLoadResolve) { self._ballLoadResolve(); self._ballLoadResolve = null; }
        })
        .start();
      self._ballFlightTween = tween;
    });
    return this._ballLoadPromise;
  }

  // Abort an in-flight load animation (Reset / entering build mid-flight).
  // Stops the tween, frees the pending promise, and bumps the load sequence so
  // any awaiting loadBall() continuation bails out without seating the ball.
  cancelBallFlight() {
    this._loadSeq++;
    if (this._ballFlightTween) { this._ballFlightTween.stop(); this._ballFlightTween = null; }
    this._ballFlying = false;
    if (this._ballLoadResolve) { this._ballLoadResolve(); this._ballLoadResolve = null; }
    this._ballLoadPromise = null;
  }

  // 4:1 lever balance gate (real-cock hold): with the short arm = 1/4 of the
  // long arm, the counterweight moment (cw × 1/4L) must beat (ball + beam) × L
  // for the beam to rest right-tilted (ready).  A heavier ball simply seesaws
  // the beam cup-down (natural physics) and firing is blocked by ballLoaded
  // gating + the seesaw stop.  Beam self-moment ~0.037 (kg·m) with arm_x1
  // -0.596 / arm_x2 0.17, balsa 160 kg/m³.
  rebalanceLoaded() {
    if (!this.ballLoaded || this.isFiring || this.isDraggingCup || this.isTourRunning) return;
    const cwKg = this.counterweightKg;
    const ballKg = this.ballKg;
    const cwTorque = cwKg * 0.155;            // short arm 1/4L
    const beamTorque = ballKg * 0.62 + 0.037; // long arm L + beam self-moment
    if (cwTorque > beamTorque) {
      this.physics.setCocked(0);   // counterweight holds the beam right-tilted
    } else {
      this.physics.unlockBalance(); // ball wins: seesaw settles cup-down
    }
  }

  // Set projectile mass (solid steel: radius follows density) and rebuild the
  // hinge mechanism so arm mass/inertia include the new ball.
  setBallMass(kg) {
    this.ballKg = kg;
    if (this.ballLabel) this.ballLabel.textContent = `${kg.toFixed(2)} kg`;
    this.physics.setBall(kg); // rebuilds the mechanism (locks at rest)
    this.rebalanceLoaded();
    this.updateBallInCup();
    if (this.annotations && this.physics.ballMesh) {
      this.annotations.setBallWeight(kg, this.physics.ballMesh.position);
      this.annotations.showBallCallout = true;
      clearTimeout(this._ballCalloutTimeout);
      this._ballCalloutTimeout = setTimeout(() => { this.annotations.showBallCallout = false; }, 2000);
    }
  }

  setWeight(kg) {
    this.counterweightKg = kg;
    if (this.weightSlider) this.weightSlider.value = kg;
    if (this.weightLabel) this.weightLabel.textContent = `${kg.toFixed(2)} kg`;
    if (this.trebuchet) {
      this.trebuchet.setCounterweight(kg);
    }
    if (this.physics) {
      this.physics.setCwMass(kg);
      this.rebalanceLoaded();
    }
    if (this.annotations && this.trebuchet) {
      this.annotations.setWeight(kg, this.trebuchet.getCounterweightWorldPosition());
    }
  }

  // Fire the trebuchet.  The arm is a real hinged rigid body now (audit F1/F2
  // fix): fire() releases the mechanism (KINEMATIC -> DYNAMIC) and gravity
  // drives it through the counterweight pendulum.  Release speed and angle are
  // read back from the physics state at the stop angle — no fitted formulas.
  async fire(fromDrag = false) {
    // If the ball is still arcing into the cup (a quick Fire right after a
    // click-to-load), wait for it to seat before releasing the mechanism.
    if (this._ballFlying && this._ballLoadPromise) await this._ballLoadPromise;
    // Reset recoil state before this launch (a previous shot may still have
    // been mid-return when the user refired).
    this.recoilVel = 0;
    this.trebuchet.group.position.x = this.recoilBaseX;
    if (this.isFiring) return;

    // Keep the existing button shortcut, but never turn a simple spoon click
    // into a launch: only a completed downward drag calls fire(true).
    if (!fromDrag && this.pullDeg < 10) {
      this.setPullAngle(this.MAX_PULL_DEG);
      // Auto-pull ratchet: the arm snaps to cocked on Fire — sound the same
      // tick the player would hear dragging the beam by hand (user directive
      // 2026-10-01: 落杯 → 摆杆声 → 弹射呼啸).
      sound.playTilt(0.5);
    }

    this.isFiring = true;
    // Ghost-impact fix (conditional): rebuild the projectile ONLY when a
    // previous shot's ball may still rest among the blocks (finishShot left it
    // in the world — waking the pile with the stale body there shoves the
    // blocks before the new launch).  When the ball was just loaded fresh
    // (tour FIRE step, or a build Fire that just loadBall()'d) the stale flag
    // is clear and we keep the ball exactly where it is, so the launch works.
    if (this._staleBall) {
      this.physics.removeProjectile(this.scene);
      this.physics.createProjectile(this.scene);
    }
    this._staleBall = false;
    this.physics.resetImpact();
    // Launch whoosh now plays at the true release instant (releaseBall) so the
    // auto-Fire sequence reads: load whoosh → arm-pull ratchet → release
    // whoosh (user directive 2026-10-01).

    this.annotations.clear(); this.annotations.visible = false; // model lock
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
    // Activate projectile collisions NOW (it was mask 0 while seated in the
    // cup).  The ball sits at the cup end of the beam, overlapping the arm and
    // chassis bodies; under slow-motion (0.25x physics dt) the solver would
    // keep pushing it for many frames and stall the launch.  So the ball first
    // collides with blocks (1) and the table (4) ONLY — machine bodies (arm
    // 2|32, chassis/frame/wheels/winch 64) join 600 ms later, once the ball
    // has left the machine, so a bounced-back ball is still stopped by it.
    this.physics.ballBody.collisionFilterMask = 0xffffffff & ~(2 | 32 | 64);
    setTimeout(() => {
      if (this.physics.ballReleased) this.physics.ballBody.collisionFilterMask = 0xffffffff;
    }, 600);
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

    // The instant the ball leaves the cup, play the same light upward whoosh
    // it flew in with (user directive 2026-10-01): the ball's arc — into the
    // cup and out of it — is one continuous airy swoosh.
    sound.playLoadWhoosh();

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
    // The shot's ball stays in the world after landing (build mode re-seats it
    // 1.5 s later).  Flag it so the NEXT fire() knows a stale body may be
    // resting among the blocks and rebuilds the projectile before waking the
    // pile.  The tour's FIRE step fires a freshly-loaded ball (no finishShot
    // before it) so it keeps the ball untouched.
    this._staleBall = true;
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

    // After the shot settles, reset arm to rest and put a fresh ball back on
    // the stand — the next throw requires loading the ball again (ball-stand
    // flow).  Build mode only: during the tour the ball must stay in the world
    // (FIRE -> REPLAY slow-mo rerun -> 3 s reset at REPLAY end, aligned with
    // fire's build reset), so the tour path resets in the REPLAY/BUILD steps.
    if (!this.isTourRunning) {
      setTimeout(() => {
        if (!this.isFiring) {
          this.ballLoaded = false; // fresh ball back on the stand
          this.setPullAngle(0);
          this.physics.ballReleased = false;
          this.updateBallInCup();
          this.updateDownCount(); // keep DOWN in sync with cascade topples
        }
      }, 3000); // ball auto-returns to its rack 3 s after the shot (user: 2026-09-30)

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
    this.cancelBallFlight(); // stop any stand->cup arc mid-flight
    this.isFiring = false;
    this._staleBall = false; // ball re-seated to the stand — nothing lingering
    this.armVelocity = 0;

    // Reset pull to 0° (or current slider value)
    this.setPullAngle(parseInt(this.pullSlider.value) || 0);

    this.ballLoaded = false; // ball back on the stand, re-load to throw
    this.physics.ballReleased = false;
    this.updateBallInCup();
    this.physics.resetBlocks();

    this.annotations.clear(); this.annotations.visible = false; // model lock
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
    // Aborting the running tour may cut a stand->cup flight short; clear the
    // flight state (flag, tween, pending promise) so the next tour run or
    // build entry cannot inherit a stale in-flight ball.
    this.cancelBallFlight();
    this.isTourRunning = true;
    this.setPlayButtonState(false);
    this.setSlowMo(false);

    // 1. Show desk paper pencil sketch; hide 3D model and 2D cutout
    this.environment.showPaperSketch();
    this.trebuchet.setMorphFactor(0);
    this.trebuchet.group.visible = false;
    if (this.cradleGroup) this.cradleGroup.visible = false;   // reset: sketch only
    if (this.environment.pencilGroup) this.environment.pencilGroup.visible = true;
    if (this.environment.eraserGroup) this.environment.eraserGroup.visible = true;
    // hide trebuchet extras
    if (this.ballStand) this.ballStand.visible = false;
    if (this.trebuchet.ropeMesh) this.trebuchet.ropeMesh.visible = false;
    this.physics.blockMeshes.forEach(m => m.visible = false);
    if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
    if (this.physics.blocksGroup) this.physics.blocksGroup.visible = false;   // model lock: blocksGroup may not exist in cradle project
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
    // 2b. Rope + ball stand belong to the 3D stages — hidden on the READ page
    // (tour directive 2026-10-01; refresh defaults to READ so they must vanish).
    if (this.trebuchet.ropeMesh) this.trebuchet.ropeMesh.visible = false;
    if (this.ballStand) this.ballStand.visible = false;

    // 3. UI and Scrubber state: initial 00:00, Play ready
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.annotations.showTrajectories = false;
    this.annotations.clear(); this.annotations.visible = false; // model lock
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
      // Pausing mid-step-6 flight abandons the run: stop the stand->cup arc so
      // the flight flag does not stay set and freeze the ball mid-air.
      this.cancelBallFlight();
      this.setPlayButtonState(false);
      this.showTourBanner('Tour paused. Click Play to resume or Rewind to restart.');
    } else {
      this.playTour();
    }
  }

  // Guided Tour sequence — 9 steps.  playTourFrom(startStep) lets the
  // scrubber seek to any step: it lands on that step's start state, then
  // replays from there to the end.
  tourSetup() {
    if (this.tourAbortController) {
      this.tourAbortController.abort();
      this.tourAbortController = null;
    }
    this.tourAbortController = new AbortController();
    this.isTourRunning = true;
    // Demo defaults: always run the tour with a configuration that actually
    // knocks blocks over, ignoring leftover build-mode slider values (e.g. a
    // 6-10 kg build leftover overshoots the tower and the demo hits nothing).
    // Tour demo config — aligned with the build Fire mechanics (user
    // directive 2026-09-30): fire() applies MAX_PULL_DEG=135 and the panel
    // counterweight, exactly like the build Fire button.  The demo uses
    // 6.0 kg counterweight + 0.60 kg ball, measured stable 9/10 blocks down
    // (2.96 m/s, range 0.34 m) — the "demo counterweight must topple blocks"
    // requirement.  (4.8/0.45 overshoots the tower at 2.99 m/s / 0.84 m.)
    this.setWeight(6.0);
    this.ballKg = 0.60;
    if (this.ballLabel) this.ballLabel.textContent = '0.60 kg';
    if (this.ballSlider) this.ballSlider.value = 0.60;
    if (this.physics) this.physics.setBall(0.60);
    this.setPlayButtonState(true);
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.annotations.showTrajectories = true;
    this.annotations.clear(); this.annotations.visible = false; // model lock
    this.updateNavButtons('tour');
  }

  async playTour() {
    this.resetToFirstFrame();
    this.tourSetup();
    // Newton's cradle: tour plays SKETCH->LIFT->MODEL->MATERIAL then stops.
    // parts/play/replay/build are silent until interaction is built.
    await this.playTourFrom(0, null, 3);
  }

  // Land the world on step i's START state (no animation), then replay i..7.
  async seekTourStep(i) {
    // Hotspot jump must also clear build-mode leftovers, not replay them.
    this.resetAll();
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
    if (i >= 4) {
      // Newton's cradle: parts/play/replay not implemented, stay at material
      return;
    }
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

    // Rope + ball stand: hidden for the blueprint/cutout stages, visible
    // from the MODEL stage onward (tour directive 2026-10-01).
    if (t.ropeMesh) t.ropeMesh.visible = false;   // model lock: trebuchet-only
    if (this.ballStand) this.ballStand.visible = false;   // model lock: trebuchet-only

    if (i >= 2) { // step 2 start: cutouts flat on paper, sketch hidden, Side view
      this.environment.hidePaperSketch();
      if (this.cutoutMesh) {
        this.cutoutMesh.visible = false;
        this.cutoutMesh.rotation.x = -Math.PI / 2;
        this.cutoutMesh.material.opacity = 1;
      }
      if (this.blocksCutoutMesh) {
        this.blocksCutoutMesh.visible = false;
        this.blocksCutoutMesh.rotation.x = -Math.PI / 2;
        this.blocksCutoutMesh.material.opacity = 1;
      }
      this.setCameraView('Side', 0);
    }
    if (i >= 3) { // step 3 start: white 3D model (morph 0.66), cutouts hidden
      t.group.visible = false;   // model lock
      t.setMorphFactor(0.66);
      this.physics.setMorphFactor(0.66);
      this.applyMorphToExtras(0.66);
      this.physics.blockMeshes.forEach(m => m.visible = false);   // model lock
      if (this.cutoutMesh) this.cutoutMesh.visible = false;
      if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
      // White-clay ball visible on the stand (consistent with morph MODEL stage)
      this.ballLoaded = false;
      if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
      this.updateBallInCup();
    }
    if (i >= 4) { // step 4 start: full material, ball on the stand, Hero view
      t.setMorphFactor(1.0);
      this.physics.setMorphFactor(1.0);
      this.applyMorphToExtras(1.0);
      this.setCameraView('Hero', 0);
      this.physics.ballReleased = false;
      this.ballLoaded = false; // ball sits on the stand until FIRE loads it
      this.setPullAngle(0);
      if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
      this.updateBallInCup();
    }
    if (i >= 5) { // step 5 (PARTS) start: full material + all part labels
      this.annotations.setPartLabels(this.getTourPartLabels(), this.getTourPartLabels().length, this.getLabelCenter());
    }
    if (i >= 6) { // step 6 (FIRE) start: ball in cup, labels off
      this.annotations.setPartLabels(null, 0);
      this.physics.resetBlocks();
      this.physics.ballReleased = false;
      this.ballLoaded = true; // loaded by the FIRE step
      this.setPullAngle(0);
      this.updateBallInCup();
    }
    if (i >= 7) { // step 7 (REPLAY) start: slow-mo replay, blocks reset, ball loaded
      this.setSlowMo(true);
      this.physics.resetBlocks();
      this.physics.ballReleased = false;
      this.ballLoaded = true;
      this.setPullAngle(0);
      this.updateBallInCup();
    }
  }

  // Morph the scene-level extras (rope + ball stand) through the same stages
  // as the trebuchet group: paper -> white clay -> full material.
  applyMorphToExtras(f) {
    const t = this.trebuchet;
    if (!t) return;
    // model lock: hide trebuchet extras
    if (t.ropeMesh) t.ropeMesh.visible = false;
    if (this.ballStand) this.ballStand.visible = false;
    t.group.visible = false;
    if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
    this.physics.blockMeshes.forEach(m => m.visible = false);
    // cradle glb: white clay during MODEL, real material during WOOD
    if (this.cradleGroup) {
      this.cradleGroup.visible = true;   // model lock: cradle always visible
      if (!this._cradleOrigMats) this._cradleOrigMats = new Map();
      this.cradleGroup.traverse((obj) => {
        if (obj.isMesh) {
          if (!this._cradleOrigMats.has(obj)) this._cradleOrigMats.set(obj, obj.material);
          if (f <= 0.66) obj.material = t.paperMat;
          else obj.material = this._cradleOrigMats.get(obj);
        }
      });
    }
  }

  // Drive the sketch->model stages exactly like tour steps 1-4:
  // 0 READ (blueprint only) / 0-33 LIFT (2D cutouts stand up, 3D hidden) /
  // 33-66 MODEL (cutouts fade, white 3D model) / 66-100 WOOD (full material).
  applyMorphToStage(v) {
    const t = this.trebuchet;
    const ph = this.physics;
    // model lock: always hide trebuchet
    t.group.visible = false;
    ph.blockMeshes.forEach(m => m.visible = false);
    if (ph.ballMesh) ph.ballMesh.visible = false;
    if (this.ballStand) this.ballStand.visible = false;
    if (v <= 0) {
      // SKETCH: blueprint on paper, everything hidden
      this.environment.showPaperSketch();
      t.group.visible = false;
      t.setMorphFactor(0);
      ph.setMorphFactor(0);
      this.applyMorphToExtras(0);
      if (this.cutoutMesh) this.cutoutMesh.visible = false;
      if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
      ph.blockMeshes.forEach(m => m.visible = false);
      if (ph.ballMesh) ph.ballMesh.visible = false;
      if (this.cradleGroup) this.cradleGroup.visible = false;
      if (this.cradleCutout) this.cradleCutout.visible = false;
      // pencil + eraser only in SKETCH
      if (this.environment.pencilGroup) this.environment.pencilGroup.visible = true;
      if (this.environment.eraserGroup) this.environment.eraserGroup.visible = true;
      return;
    }
    if (v <= 33) {
      // LIFT: cutouts lie flat -> stand up; 3D group stays hidden
      this.environment.hidePaperSketch();
      if (this.environment.pencilGroup) this.environment.pencilGroup.visible = false;
      if (this.environment.eraserGroup) this.environment.eraserGroup.visible = false;
      const k = v / 33;
      t.group.visible = false;
      t.setMorphFactor(0.01);
      ph.setMorphFactor(0.01);
      this.applyMorphToExtras(0.01);
      if (this.cradleGroup) this.cradleGroup.visible = false;
      if (this.cradleCutout) {
        this.cradleCutout.visible = k > 0.02;
        this.cradleCutout.rotation.x = -Math.PI / 2 + k * (Math.PI / 2);
        this.cradleCutout.material.opacity = 1;
      }
      ph.blockMeshes.forEach(m => m.visible = false);
      if (ph.ballMesh) ph.ballMesh.visible = false;
      if (this.environment.pencilGroup) this.environment.pencilGroup.visible = false;
      if (this.environment.eraserGroup) this.environment.eraserGroup.visible = false;
      return;
    }
    if (v <= 66) {
      // MODEL: cutouts fade out, white 3D model emerges
      const k = (v - 33) / 33;
      this.environment.hidePaperSketch();
      if (this.cradleCutout) {
        this.cradleCutout.material.opacity = 1 - k;
        if (k >= 1) this.cradleCutout.visible = false;
      }
      t.group.visible = false;
      t.setMorphFactor(0.01 + k * 0.65);
      ph.setMorphFactor(0.01 + k * 0.65);
      this.applyMorphToExtras(0.01 + k * 0.65);
      if (this.cradleGroup) {
        this.cradleGroup.visible = true;
        this.cradleGroup.scale.set(2, 2, 0.01 + k * 1.99);
      }
      ph.blockMeshes.forEach(m => m.visible = false);
      this.ballLoaded = false;
      if (ph.ballMesh) ph.ballMesh.visible = false;
      if (this.environment.pencilGroup) this.environment.pencilGroup.visible = false;
      if (this.environment.eraserGroup) this.environment.eraserGroup.visible = false;
      this.updateBallInCup();
      return;
    }
    // MATERIAL: white -> full material
    const k = (v - 66) / 34;
    this.environment.hidePaperSketch();
    t.group.visible = false;
    t.setMorphFactor(0.66 + k * 0.34);
    ph.setMorphFactor(0.66 + k * 0.34);
    this.applyMorphToExtras(0.66 + k * 0.34);
    if (this.cradleGroup) {
      this.cradleGroup.visible = true;
      this.cradleGroup.scale.set(2, 2, 2);
    }
    ph.blockMeshes.forEach(m => m.visible = false);
    if (ph.ballMesh) ph.ballMesh.visible = false;
    if (this.environment.pencilGroup) this.environment.pencilGroup.visible = false;
    if (this.environment.eraserGroup) this.environment.eraserGroup.visible = false;
    this.updateBallInCup();
  }

  updateMorphStage(v) {
    const el = document.getElementById('morph-stage');
    if (!el) return;
    let name = 'READ';
    if (v > 16 && v <= 49) name = 'LIFT';
    else if (v > 49 && v <= 83) name = 'MODEL';
    else if (v > 83) name = 'MATERIAL';
    el.textContent = name;
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
    // Ball anchor: while the tour shows PARTS the ball still sits on the stand
    // (lower-left), so point at the ball itself (physics.ballMesh).
    const ballPos = this.physics && this.physics.ballMesh
      ? wp(this.physics.ballMesh)
      : new THREE.Vector3(t.group.position.x - 0.9, 0.06, 0.52);
    // Rope anchor: midpoint of the taut rope between ring (A) and drum (B),
    // maintained every frame by trebuchet.ropeUpdate.
    const ropePos = t.ropeMidpoint && t.ropeMidpoint.lengthSq() > 0
      ? t.ropeMidpoint.clone()
      : new THREE.Vector3(t.group.position.x - 0.45, 0.30, 0);
    // Chassis anchor moved to the deck's front-right corner: the old centre
    // anchor pushed its label down-left onto the ball stand.  Front-right
    // (x+0.35, z+0.12) keeps the dot on the real deck while the label fans
    // away from the stand and the wheels.
    const chassisV = new THREE.Vector3(t.group.position.x + 0.35, 0.06, 0.12);
    return [
      { name: 'Counterweight 配重箱', pos: wp(t.counterweightMesh) },
      { name: 'Arm 摆杆', pos: armV },
      { name: 'Chassis 底座', pos: chassisV },
      { name: 'A-frame 支架', pos: wp(t.aframeMesh) },
      { name: 'Cup 投射杯', pos: wp(t.cupMesh) },
      { name: 'Ball 球', pos: ballPos },
      { name: 'Wheels 轮', pos: wheelAnchor(t.wheelMesh) },
      { name: 'Blocks 箱子', pos: blocksV },
      { name: 'Rope 拉索', pos: ropePos },
    ];
  }

  getLabelCenter() {
    // World-space centre the part labels radiate around (trebuchet body core)
    const g = this.trebuchet.group.position;
    return new THREE.Vector3(g.x, g.y + 0.34, 0);
  }

  async playTourFrom(startStep, singleStep = null, maxStep = null) {
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
        if (maxStep !== null && 0 > maxStep) return;
        this.environment.showPaperSketch();
        this.trebuchet.group.visible = false;
        if (this.cradleGroup) this.cradleGroup.visible = false;   // READ: only sketch
        this.trebuchet.setMorphFactor(0);
        if (this.cutoutMesh) this.cutoutMesh.visible = false;
        if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
        this.physics.blockMeshes.forEach(m => m.visible = false);
        if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
        if (this.trebuchet.ropeMesh) this.trebuchet.ropeMesh.visible = false;
        if (this.ballStand) this.ballStand.visible = false;

        this.setCameraView('Top', 800);
        this.showTourBanner('1/8 Blueprint — hand-drawn trebuchet sketch (rope + ball stand) on engineering paper');
        this.updateScrubber(0.06, '00:05');
        this.highlightTourStep(0);
        await sleep(1400);
      }

      // -----------------------------------------------------------------
      // Step 2: 图纸轮廓高亮 -> 2D纸片立起（平面 -> 立起）
      // -----------------------------------------------------------------
      if (startStep <= 1 && (singleStep === null || singleStep === 1)) {
        if (maxStep !== null && 1 > maxStep) return;
        this.environment.hidePaperSketch();
        this.showTourBanner('2/8 Blueprint outline highlights, then lifts off as 2D cutouts');
        this.updateScrubber(0.19, '00:16');
        this.highlightTourStep(1);

        // Outline highlight: cutouts fade in flat on the paper (contours emerge)
        if (this.cutoutMesh) {
          this.cutoutMesh.visible = false;
          this.cutoutMesh.rotation.x = -Math.PI / 2;
          this.cutoutMesh.material.opacity = 0;
        }
        if (this.blocksCutoutMesh) {
          this.blocksCutoutMesh.visible = false;
          this.blocksCutoutMesh.rotation.x = -Math.PI / 2;
          this.blocksCutoutMesh.material.opacity = 0;
        }
        this.setCameraView('Side', 1600);
        sound.playPaperSlide();
        if (this.cradleCutout) {
          this.cradleCutout.visible = true;
          this.cradleCutout.material.opacity = 0;
        }
        if (this.cutoutMesh) this.cutoutMesh.visible = false;
        if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
        await Promise.all([
          tweenPromise({ op: 0 }, { op: 1 }, 900, TWEEN.Easing.Quadratic.Out, (o) => {
            if (this.cradleCutout) this.cradleCutout.material.opacity = o.op;
            if (this.cutoutMesh) this.cutoutMesh.material.opacity = o.op;
            if (this.blocksCutoutMesh) this.blocksCutoutMesh.material.opacity = o.op;
          }),
          sleep(600)
        ]);

        // Stand up: rotate from flat (-PI/2) to vertical (0), position stays
        await tweenPromise(
          { rotX: -Math.PI / 2 },
          { rotX: 0 },
          1600,
          TWEEN.Easing.Cubic.InOut,
          (o) => {
            if (this.cradleCutout) this.cradleCutout.rotation.x = o.rotX;
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
        if (maxStep !== null && 2 > maxStep) return;
        this.showTourBanner('3/8 2D cutouts unfold into a 3D white model');
        this.updateScrubber(0.38, '00:32');
        this.highlightTourStep(2);
        this.trebuchet.group.visible = false;
        if (this.cradleGroup) {
          this.cradleGroup.visible = true;
          this.cradleGroup.scale.set(2, 2, 0.01);
        }
        if (this.cradleCutout) this.cradleCutout.visible = false;
        this.environment.hidePaperSketch();
        this.trebuchet.setMorphFactor(0.01);
        this.physics.setMorphFactor(0.33);
        this.applyMorphToExtras(0.01);
        this.physics.blockMeshes.forEach(m => m.visible = false);
        // White-clay ball on the stand with the white model (consistent with morph MODEL)
        this.ballLoaded = false;
        if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
        this.updateBallInCup();

        await Promise.all([
          tweenPromise(
            { f: 0.01, z: 0.01 },
            { f: 0.66, z: 1.0 },
            1800,
            TWEEN.Easing.Cubic.InOut,
            (o) => {
              this.trebuchet.setMorphFactor(o.f);
              this.physics.setMorphFactor(o.f);
              this.applyMorphToExtras(o.f);
              if (this.cradleGroup) this.cradleGroup.scale.set(2, 2, o.z * 2);
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
        if (maxStep !== null && 3 > maxStep) return;
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
            this.applyMorphToExtras(o.f);
            if (this.cradleGroup) this.cradleGroup.scale.set(2, 2, 2);
            this.morphSlider.value = Math.round(o.f * 100);
          }
        );
        if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
        this.physics.ballReleased = false;
        this.setPullAngle(0);
        this.updateBallInCup();
        await sleep(600);
      }

      // -----------------------------------------------------------------
      // Step 5: 渐进式显示每个主要部件名称（点线+文字）
      // -----------------------------------------------------------------
      if (startStep <= 4 && (singleStep === null || singleStep === 4)) {
        if (maxStep !== null && 4 > maxStep) return;
        this.showTourBanner('5/8 Parts — labels point to each major component');
        this.updateScrubber(0.65, '00:55');
        this.highlightTourStep(4);
        const labels = this.getTourPartLabels();
        for (let i = 1; i <= labels.length; i++) {
          this.annotations.setPartLabels(labels, i, this.getLabelCenter());
          await sleep(420);
        }
        await sleep(900);
      }

      // -----------------------------------------------------------------
      // Step 6 (index 5): 先示意，然后执行拖拽摆杆完成发射
      // (LOAD was removed: the ball flies into the cup here as a short intro)
      // -----------------------------------------------------------------
      if (startStep <= 5 && (singleStep === null || singleStep === 5)) {
        if (maxStep !== null && 5 > maxStep) return;
        this.showTourBanner('6/8 Hold the cup, pull down, let go — fire!');
        this.updateScrubber(0.78, '01:06');
        this.highlightTourStep(5);
        this.annotations.setPartLabels(null, 0);


        // Aligned with build Fire (user directive 2026-09-30): load the ball
        // into the cup, then fire().  fire() itself applies MAX_PULL_DEG=135
        // (45° from mast) when the beam is at rest, and uses the current panel
        // counterweight — exactly the build Fire button path.  No custom pull
        // tween, no tour-specific angle/counterweight.
        this.ballLoaded = false;
        this.updateBallInCup();
        sound.playTilt(0.5);
        await this.flyBallToCup(); // ball arcs from the stand into the cup (parabola)
        if (signal.aborted) throw new Error('Tour aborted');
        this.ballLoaded = true;
        // Seating hand-off (same contract as loadBall): the flight flag stays
        // set until the cup owns the ball, so the per-frame updateBallInCup()
        // can never flash a ghost ball back onto the stand.
        this._ballFlying = false;
        this.updateBallInCup();
        await sleep(300);
        await this.fire();
        // 2 s after fire the replay step takes over (user directive:
        // "改2秒后进入replay").  If FIRE's shot is still live (ball bounced
        // off the tower and hasn't "landed"), REPLAY force-finishes it before
        // its own fire(), so this is always a clean 2 s hand-off.
        await sleep(2000);
      }

      // -----------------------------------------------------------------
      // Step 8 (index 7): 慢镜回放刚才的发射
      // -----------------------------------------------------------------
      if (startStep <= 6 && (singleStep === null || singleStep === 6)) {
        if (maxStep !== null && 6 > maxStep) return;
        this.showTourBanner('7/8 Slow-motion replay at quarter speed (0.25×)');
        this.updateScrubber(0.88, '01:15');
        this.highlightTourStep(6);
        // Re-seat the ball into the cup BEFORE waking the pile: the previous
        // shot's ball still rests among the blocks and would shove them the
        // moment they wake ("invisible impact" in the replay too).
        // FIRE's shot may still be live (tower-bounce keeps y above the landing
        // threshold): force-finish it so REPLAY's fire() starts from a clean
        // mechanism state.  Ball stays in the world (tour path never
        // auto-returns it mid-replay).
        if (this.isFiring) {
          const rd = this.physics.ballMesh
            ? Math.max(0, this.physics.ballMesh.position.x - (this.launchPos ? this.launchPos.x : 0))
            : 2.15;
          this.finishShot(rd);
        }
        this.physics.ballReleased = false;
        this.ballLoaded = true; // the FIRE shot's ball rests in the world — seat it
        this.updateBallInCup();
        this.physics.resetBlocks();
        this.physics.wakeBlocks();
        this.setSlowMo(true);

        // Aligned with build Fire (user directive 2026-09-30): fire() applies
        // MAX_PULL_DEG=135 and the current panel counterweight by itself.
        // FIRE left pullDeg=135, which would make fire() skip the re-cock and
        // release from REST at omega~0 (replay instantly settles) — reset it
        // so the replay launches the full pull.
        // The slow-mo replay must show the flight path (user 2026-10-01):
        // enable it for this rerun; showBuildPanel switches it back off.
        this.flightPathEnabled = true;
        this.btnToggleFlightPath.classList.add('active');
        this.annotations.showTrajectories = true;
        this.pullDeg = 0;
        await this.fire();
        // Full slow-mo replay: keep playing until the iron ball leaves the
        // scene (flies out of view) or comes to rest after impact — never
        // pause right after it lands.  Bounded by a generous timeout.
        const ballMesh = this.physics.ballMesh;
        const ballBody = this.physics.ballBody;
        const replayStart = performance.now();
        let _replayImpactT = 0; // wall-clock of the first real impact (post slow-mo)
        await new Promise((resolve) => {
          const check = () => {
            const v = new THREE.Vector3();
            if (ballMesh && ballMesh.getWorldPosition) ballMesh.getWorldPosition(v);
            const out = Math.abs(v.x) > 2.5 || v.y < -0.3 || Math.abs(v.z) > 2.0;
            const settled = ballBody && this.physics.ballReleased && ballBody.velocity.length() < 0.06;
            // Slow-mo covers launch -> impact only.  The instant the ball
            // really hits (block tower / table, _impactMomentum set by the
            // collide listener), resume real speed for the rest of the replay
            // (user directive 2026-10-01).
            if (this.physics._impactMomentum > 0 && this.slowMotion) this.setSlowMo(false);
            if (this.physics._impactMomentum > 0 && _replayImpactT === 0) _replayImpactT = performance.now();
            // After the real impact the ball may roll at ~0.1 m/s for a very
            // long time (settled never trips) — cap the post-impact phase at
            // 5 s so the replay ends briskly after the blocks finish toppling.
            const postImpactDone = _replayImpactT > 0 && performance.now() - _replayImpactT > 5000;
            if (out || settled || postImpactDone || performance.now() - replayStart > 24000) resolve();
            else requestAnimationFrame(check);
          };
          check();
        });
        // Replay done — reset time aligned with fire (3 s ball auto-return),
        // then the BUILD step cleans the demo scene.
        await sleep(3000);
      }

      // -----------------------------------------------------------------
      // Step 9 (index 8): 切到 build it yourself
      // -----------------------------------------------------------------
      if (startStep <= 7 && (singleStep === null || singleStep === 7)) {
        if (maxStep !== null && 7 > maxStep) return;
        this.showTourBanner('8/8 Tour complete — now build it yourself');
        this.updateScrubber(1.0, '01:25');
        this.highlightTourStep(7);
        // End state: no auto fire, no leftover replay — just reset to the
        // manipulable idle state and switch to build-it-yourself mode.
        // (Full-run path: REPLAY ends -> automatically lands here -> BUILD.)
        this.setSlowMo(false);
        this.physics.resetBlocks();
        this.physics.ballReleased = false;
        this.ballLoaded = false; // clean the demo scene: ball returns to the rack
        this.setPullAngle(0);
        this.updateBallInCup();
        this.updateDownCount(); // DOWN back to 0/10 after the demo reset
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
    return;   // model lock: all tour banner/toast text hidden; code retained for later
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
    // Newton's cradle: no interaction built yet, disable steps 4-7 (parts/play/replay/build)
    this.tourSteps.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === i);
      if (idx >= 4) {
        btn.disabled = true;
        btn.style.opacity = '0.3';
      }
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
    this.trebuchet.setMorphFactor(1.0);
    this.physics.setMorphFactor(1.0);
    this.trebuchet.group.visible = false;       // model lock: re-assert AFTER setMorphFactor (which flips it on at trebuchet.js:956)
    this.morphSlider.value = 100;
    this.physics.blockMeshes.forEach(m => m.visible = false);   // model lock
    if (this.physics.ballMesh) this.physics.ballMesh.visible = false;
    // Ball stand + rope belong to the real build scene: resetToFirstFrame hid
    // them for the READ page — restore them when entering build (user 2026-10-01).
    if (this.trebuchet.ropeMesh) this.trebuchet.ropeMesh.visible = false;   // model lock
    if (this.ballStand) this.ballStand.visible = false;   // model lock
    if (this.cradleGroup) this.cradleGroup.visible = true;   // model lock: cradle always visible
    if (this.cradleCutout) this.cradleCutout.visible = false; // build: hide standing cutout

    // Build mode starts with the flight path OFF (user directive 2026-10-01).
    this.flightPathEnabled = false;
    this.btnToggleFlightPath.classList.remove('active');
    this.annotations.clear(); this.annotations.visible = false; // model lock

    this.buildPanel.classList.add('hidden');   // model lock: cradle project has no trebuchet build/Fire/ball/weight panel
    this.showDragHintFor(2000);
    this.playerScrubber.classList.add('hidden');
    this.annotations.showTrajectories = false;
    this.updateNavButtons('build');

    // Reset arm to rest (0° pull, counterweight on floor, spoon up); the ball
    // starts on the stand — the player loads it by clicking.  Also reset any
    // scattered demo blocks (jumping into build mid-tour must clean the tour
    // scene, user 2026-10-01).
    this.cancelBallFlight(); // stop any stand->cup arc mid-flight
    this.physics.resetBlocks();
    this.ballLoaded = false;
    this.setPullAngle(0);
    this.physics.ballReleased = false;
    this.updateBallInCup();
    this.updateDownCount();
    this.updateDragHint();

    if (this.currentView === 'Top') {
      this.setCameraView('Hero', 1000);
    }
  }

  updateDragHint() {
    if (!this.dragHint || this.isTourRunning) return;
    let message;
    if (!this.ballLoaded) message = 'Click the cannonball on the stand to load it';
    else message = this.currentView === 'Top'
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
    this.btnFire.addEventListener('click', async () => {
      // Newton's cradle: fire/replay not implemented yet, silence button.
      return;
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
      if (!this.flightPathEnabled) this.annotations.clear(); this.annotations.visible = false; // model lock
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

    // Morph slider (Sketch to Model) — stages aligned to tour steps 1-4:
    // READ(0) -> LIFT(33, 2D cutouts stand up) -> MODEL(66, white 3D) -> WOOD(100, material)
    this.morphSlider.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      this.applyMorphToStage(v);
      this.updateMorphStage(v);
    });

    // Snap to the nearest tour stage on release
    this.morphSlider.addEventListener('change', () => {
      const snaps = [0, 33, 66, 100];
      const v = parseInt(this.morphSlider.value);
      let best = snaps[0];
      for (const sn of snaps) if (Math.abs(v - sn) < Math.abs(v - best)) best = sn;
      this.morphSlider.value = best;
      this.applyMorphToStage(best);
      this.updateMorphStage(best);
    });

    // Camera view buttons
    this.btnViewHero.addEventListener('click', () => this.setCameraView('Hero'));
    this.btnViewSide.addEventListener('click', () => this.setCameraView('Side'));
    this.btnViewTop.addEventListener('click', () => this.setCameraView('Top'));
    this.btnView3D.addEventListener('click', () => this.setCameraView('3D', 0));

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
        // BUILD (step 7) exits the tour straight into build mode: the ball
        // stays on the stand (NOT auto-loaded) and no slow-mo replay runs.
        // Seeking it through applyTourStepStart(7) would pre-load the ball
        // and enable slow-mo for the build panel.
        if (step === 7) {
          this.showBuildPanel();
          return;
        }
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
        const t = Math.round(p * 85);
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

    const finishDrag = async (launch) => {
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
      if (launch && this.dragMoved && this.pullDeg > 8) await this.fire(true);
      this.controls.enabled = true;
    };

    const onPointerDown = async (e) => {
      // Hero and Side show the throwing arc clearly enough for direct
      // manipulation.  Top is deliberately panel-only: its almost parallel
      // camera ray makes a spoon drag ambiguous, while Fire still works.
      if (
        e.button !== 0 ||
        this.isFiring ||
        this.isTourRunning ||
        this.isCameraTransitioning
      ) return;
      const bounds = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - bounds.left) / bounds.width) * 2 - 1;
      this.mouse.y = -((e.clientY - bounds.top) / bounds.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const standMeshes = this.ballStand ? Array.from(this.ballStand.children) : [];
      const objectsToTest = [this.trebuchet.cupMesh, this.physics.ballMesh, ...standMeshes].filter(Boolean);
      const intersects = this.raycaster.intersectObjects(objectsToTest, true);

      if (intersects.length > 0) {
        const hitBall = intersects.some((h) => h.object === this.physics.ballMesh);
        const hitStand = intersects.some((h) => standMeshes.includes(h.object));
        const hitCup = intersects.some((h) => h.object === this.trebuchet.cupMesh);
        // Load the cannonball: clicking the ball, its stand, OR the bowl/arm
        // itself places the ball into the cup (pick-up, not drag — any view).
        if (!this.ballLoaded && (hitBall || hitStand || hitCup)) {
          // If the pointer is released while the ball is arcing into the cup
          // (a click-to-load, not a press-and-drag), skip the spoon grab.
          this._pointerUpDuringLoad = false;
          const onRelease = (ev) => { if (ev.pointerId === e.pointerId) this._pointerUpDuringLoad = true; };
          window.addEventListener('pointerup', onRelease, { once: true });
          window.addEventListener('pointercancel', onRelease, { once: true });
          await this.loadBall(); // ball arcs from the stand into the cup (parabola)
          if (this._pointerUpDuringLoad) {
            this._pointerUpDuringLoad = false;
            return; // click-to-load only — no drag grab
          }
          // Fall through into the drag grab: the ball lands in the cup and
          // the spoon is already held — pull down without releasing the mouse
          // (user directive 2026-10-01).  Top view still drops out below.
        }
        // Empty cup / released ball → nothing to drag.
        if (this.currentView === 'Top' || !this.ballLoaded || this.physics.ballReleased) return;
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
    if (this.isTourRunning || this.isCameraTransitioning || this.isDraggingCup || this.currentView !== '3D') {
      this.controls.enabled = false;
    } else {
      this.controls.enabled = true;
    }
    this.controls.update();

    // Step physics
    this.physics.step(delta);
    this.physics.updateBlockHitVisuals();
    // Rope follows the beam ring every frame (shortens while cocking, lengthens
    // while the arm rebounds after release)
    this.trebuchet.ropeUpdate();
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
      this.physics.syncChassis(trebGroup.position.x);
      this.recoilVel += ((this.recoilBaseX - trebGroup.position.x) * 90 - this.recoilVel * 12) * delta;
      if (Math.abs(this.recoilVel) < 1e-4 && Math.abs(trebGroup.position.x - this.recoilBaseX) < 1e-4) {
        trebGroup.position.x = this.recoilBaseX;
        this.recoilVel = 0;
      }
    }

    // Real hinge mechanism: sync the 3D arm from the physics bodies, detect
    // release at the stop angle, or finish the shot when the ball lands.
    this.updateMechanism();

    // Loaded-ball balance: while the ball sits in the cup and the user is not
    // dragging or firing, the beam swings freely under the real torque — sync
    // the 3D arm + counterweight from the physics bodies every frame.
    if (this.ballLoaded && !this.isFiring && !this.isDraggingCup && !this.isTourRunning) {
      this.trebuchet.armPivot.rotation.z = this.physics.getArmAngle();
      this.trebuchet.cwGroup.rotation.z = this.physics.getCwRelAngle();
    }

    // Keep ball in cup / on stand if resting
    if (!this.physics.ballReleased) {
      this.updateBallInCup();
    }
    // Ball weight callout follows the ball (stand or cup)
    if (this.annotations && this.physics.ballMesh) {
      this.annotations.setBallWeight(this.ballKg, this.physics.ballMesh.position);
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
