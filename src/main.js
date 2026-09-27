import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
    this.zoomFactor = 1.6;

    // Simulation settings
    this.slowMotion = false;
    this.timeScale = 1.0;
    this.counterweightKg = 0.68;
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

    // 2. Create polished steel projectile
    this.physics.createProjectile(this.scene);

    // 3. Create Trebuchet wooden model on the left
    this.trebuchet = new TrebuchetModel(this.scene, this.balsaTexture, this.leadTexture);
    this.trebuchet.setCounterweight(this.counterweightKg);

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
  updateBallInCup() {
    if (!this.physics.ballReleased) {
      const cupPos = this.trebuchet.getCupWorldPosition();
      this.physics.ballMesh.position.copy(cupPos);
      this.physics.ballBody.position.set(cupPos.x, cupPos.y, cupPos.z);
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
      this.isCameraTransitioning = false;
      this.updateDragHint();
      return;
    }

    new TWEEN.Tween(this.camera.position)
      .to(targetPos, duration)
      .easing(TWEEN.Easing.Cubic.Out)
      .onComplete(() => {
        if (transitionId === this.cameraTransitionId) {
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
      if (this.annotations && this.trebuchet) {
        this.annotations.setWeight(this.counterweightKg, this.trebuchet.getCounterweightWorldPosition());
      }
    }
  }

  // Set counterweight mass
  setWeight(kg) {
    this.counterweightKg = kg;
    if (this.weightSlider) this.weightSlider.value = kg;
    if (this.weightLabel) this.weightLabel.textContent = `${kg.toFixed(2)} kg`;
    if (this.trebuchet) {
      this.trebuchet.setCounterweight(kg);
    }
    if (this.annotations && this.trebuchet) {
      this.annotations.setWeight(kg, this.trebuchet.getCounterweightWorldPosition());
    }
  }

  // Fire trebuchet physics.  Button firing can auto-cock for the guided tour;
  // drag firing always uses the exact pull held by the user.
  fire(fromDrag = false) {
    if (this.isFiring) return;

    // Keep the existing button shortcut, but never turn a simple spoon click
    // into a launch: only a completed downward drag calls fire(true).
    if (!fromDrag && this.pullDeg < 10) {
      this.setPullAngle(45);
    }

    this.isFiring = true;
    sound.playLaunch();

    this.annotations.clear();
    this.physics.ballReleased = false;
    this.physics.wakeBlocks();

    // Current angle: cocked angle
    let currentArmAngle = this.trebuchet.REST_ANGLE + THREE.MathUtils.degToRad(this.pullDeg);
    const stopAngle = this.trebuchet.REST_ANGLE; // Black counterweight strikes chassis floor & STOPS!

    // Gravitational acceleration downwards:
    // Torque = m_cw * g * L_short
    // Heavier counterweight = faster downward plunge = greater launch force & speed!
    const cwMass = this.counterweightKg;
    const pullRatio = THREE.MathUtils.clamp(this.pullDeg / this.MAX_PULL_DEG, 0, 1);
    const accelMultiplier = 34.0 * (cwMass / 0.68) * (0.75 + pullRatio * 0.85);

    this.armVelocity = 0;
    const startTime = performance.now();
    let released = false;
    // Pendulum + recoil state
    let cwSwingT = 0;       // time since cw started moving
    let recoilX = 0;
    let recoilVel = 0;
    let cwRestAngle = stopAngle;

    const launchLoop = () => {
      if (!this.isFiring) return;

      const dt = 0.016 * this.timeScale;

      if (!released) {
        cwSwingT += dt;
        // Counterweight plunges DOWNWARDS under gravity
        this.armVelocity += accelMultiplier * dt;
        currentArmAngle -= this.armVelocity * dt;

        // Small pendulum during arm motion: proportional to arm angular velocity
        const pendulumAngle = 0.09 * Math.sin(cwSwingT * 9) * Math.min(1, this.armVelocity * 0.3);

        // Has counterweight reached the ground/chassis stop?
        if (currentArmAngle <= stopAngle) {
          currentArmAngle = stopAngle;
          this.trebuchet.armPivot.rotation.z = currentArmAngle;
          // Cw lands: pendulum settles to rest angle (no more swinging)
          this.trebuchet.cwGroup.rotation.z = -stopAngle;

          // FLING THE BALL!
          released = true;
          this.physics.ballReleased = true;
          cwSwingT = 0; // reset for recoil phase

          const weightRatio = this.counterweightKg / 0.68;
          const launchSpeed = 3.55 * Math.sqrt(weightRatio) * (0.80 + 0.40 * pullRatio);
          const launchAngleRad = THREE.MathUtils.degToRad(32.0);

          const vx = launchSpeed * Math.cos(launchAngleRad);
          const vy = launchSpeed * Math.sin(launchAngleRad);
          const vz = (Math.random() - 0.5) * 0.015;

          const cupPos = this.trebuchet.getCupWorldPosition();
          this.physics.ballMesh.position.copy(cupPos);
          this.physics.ballBody.position.set(cupPos.x, cupPos.y, cupPos.z);
          this.physics.ballBody.velocity.set(vx, vy, vz);
          this.physics.ballBody.wakeUp();

          this.statSpeed.textContent = `${launchSpeed.toFixed(2)} m/s`;
          this.statAngle.textContent = `32°`;
          this.launchPos = cupPos.clone();
          this.launchSpeedVal = launchSpeed;
          this.launchAngleVal = 32;
          sound.playBlockHit(0.5);
        } else {
          this.trebuchet.armPivot.rotation.z = currentArmAngle;
          this.trebuchet.cwGroup.rotation.z = -currentArmAngle + pendulumAngle;
          this.updateBallInCup();
        }
      }

      if (released) {
        cwSwingT += dt;
        // Recoil: brief backward push, spring-damper returns to rest
        if (cwSwingT < 0.06) recoilVel = -0.08 * (cwMass / 0.68);
        recoilVel += (-recoilX * 40 - recoilVel * 6) * dt;
        recoilX += recoilVel * dt;
        this.trebuchet.group.position.x = -0.72 + recoilX;

        // Record trajectory arc
        if (this.flightPathEnabled && this.physics.ballMesh) {
          this.annotations.addPoint(this.physics.ballMesh.position);
        }

        // Check if ball landed on table or flew past target
        if (this.physics.ballBody.position.y <= 0.055 || this.physics.ballBody.position.x > 2.2) {
          const rangeDist = Math.max(0, this.physics.ballMesh.position.x - this.launchPos.x);
          this.finishShot(rangeDist);
          return;
        }
      }

      // Safety timeout
      if (performance.now() - startTime > 6500) {
        this.finishShot(2.15);
        return;
      }

      requestAnimationFrame(launchLoop);
    };

    launchLoop();
  }

  finishShot(rangeDist) {
    if (!this.isFiring) return;
    this.isFiring = false;
    // Reset recoil position
    this.trebuchet.group.position.x = -0.72;
    // Reset arm to rest angle (properly sets cwGroup to hang vertical)
    this.trebuchet.setArmAngle(this.trebuchet.REST_ANGLE);
    this._dragPendulum = 0;
    this._lastDragPull = undefined;

    const actualRange = typeof rangeDist === 'number' ? rangeDist : 2.15;
    this.statRange.textContent = `${Math.round(actualRange * 1000)} mm`;

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
        }
      }, 1500);

      // After blocks have finished toppling, sleep them so window resizing or
      // idle frames don't cause micro-jitter.
      setTimeout(() => {
        if (!this.isFiring) {
          this.physics.settleBlocks();
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
    this.statRange.textContent = '— mm';
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

  // Guided Tour sequence (8-step smooth progression)
  async playTour() {
    if (this.tourAbortController) {
      this.tourAbortController.abort();
    }
    this.tourAbortController = new AbortController();
    const signal = this.tourAbortController.signal;

    this.isTourRunning = true;
    this.setPlayButtonState(true);
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.annotations.showTrajectories = true;
    this.annotations.clear();
    this.updateNavButtons('tour');

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
      // Step 1: 显示草图 (Display sketch on engineer paper)
      // -----------------------------------------------------------------
      this.environment.showPaperSketch();
      this.trebuchet.setMorphFactor(0);
      this.trebuchet.group.visible = false;
      if (this.cutoutMesh) this.cutoutMesh.visible = false;
      if (this.blocksCutoutMesh) this.blocksCutoutMesh.visible = false;
      this.physics.blockMeshes.forEach(m => m.visible = false);
      if (this.physics.ballMesh) this.physics.ballMesh.visible = false;

      this.setCameraView('Top', 800);
      this.showTourBanner('1/8 Hand-drawn catapult sketch on engineering paper');
      this.updateScrubber(0.02, '00:02');

      await sleep(1200);

      // -----------------------------------------------------------------
      // Step 2: 草图变2D纸片，垂直立起（投石机与方块纸片同步立起）
      // 注意：2-8图纸上的投石机与方块铅笔画草图隐藏
      // -----------------------------------------------------------------
      this.showTourBanner('2/8 Sketch lifts off paper as 2D cutouts and stands upright');
      this.updateScrubber(0.14, '00:12');

      // Hide the pencil sketches drawn on desk paper (kept hidden through steps 2-8)
      this.environment.hidePaperSketch();

      // Show the 2D cutout planes lying flat on paper
      if (this.cutoutMesh) {
        this.cutoutMesh.visible = true;
        this.cutoutMesh.rotation.x = -Math.PI / 2;
        this.cutoutMesh.material.opacity = 1.0;
      }
      if (this.blocksCutoutMesh) {
        this.blocksCutoutMesh.visible = true;
        this.blocksCutoutMesh.rotation.x = -Math.PI / 2;
        this.blocksCutoutMesh.material.opacity = 1.0;
      }

      // Smoothly swing camera to Side view (matching Image 1) while 2D paper cutouts stand up
      this.setCameraView('Side', 1800);
      sound.playPaperSlide();

      // Animate rotation.x from -PI/2 (flat on paper) to 0 (standing vertical)
      await tweenPromise(
        { rotX: -Math.PI / 2 },
        { rotX: 0 },
        1800,
        TWEEN.Easing.Cubic.InOut,
        (o) => {
          if (this.cutoutMesh) this.cutoutMesh.rotation.x = o.rotX;
          if (this.blocksCutoutMesh) this.blocksCutoutMesh.rotation.x = o.rotX;
        }
      );

      await sleep(350);

      // -----------------------------------------------------------------
      // Step 3: 2D纸片变为纸3D模型 (2D cutouts unfold into 3D folded paper model)
      // -----------------------------------------------------------------
      this.showTourBanner('3/8 Paper cutouts unfold thickness into folded 3D paper models');
      this.updateScrubber(0.28, '00:24');

      // Make 3D paper model visible
      this.trebuchet.group.visible = true;
      this.trebuchet.setMorphFactor(0.01);
      this.physics.setMorphFactor(0.33);
      this.physics.blockMeshes.forEach(m => m.visible = true);

      // Concurrently unfold 3D model thickness and fade out 2D cutouts
      await Promise.all([
        tweenPromise(
          { f: 0.01 },
          { f: 0.33 },
          1500,
          TWEEN.Easing.Cubic.InOut,
          (o) => {
            this.trebuchet.setMorphFactor(o.f);
            this.morphSlider.value = Math.round(o.f * 100);
          }
        ),
        (this.cutoutMesh || this.blocksCutoutMesh) ? tweenPromise(
          { op: 1.0 },
          { op: 0.0 },
          1000,
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

      // -----------------------------------------------------------------
      // Step 4: 纸3D模型变为灰度白模型（没有其他颜色）
      // -----------------------------------------------------------------
      this.showTourBanner('4/8 Transforming into a pure clay monochrome white model');
      this.updateScrubber(0.44, '00:38');

      await tweenPromise(
        { f: 0.33 },
        { f: 0.66 },
        1600,
        TWEEN.Easing.Cubic.InOut,
        (o) => {
          this.trebuchet.setMorphFactor(o.f);
          this.physics.setMorphFactor(o.f);
          this.morphSlider.value = Math.round(o.f * 100);
        }
      );

      await sleep(400);

      // -----------------------------------------------------------------
      // Step 5: 灰度白模型转为目前有材质颜色的3D模型
      // -----------------------------------------------------------------
      this.showTourBanner('5/8 Applying balsa wood grain, metal pins, and cast-lead counterweight');
      this.updateScrubber(0.60, '00:52');
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

      // Reveal ball in cup
      if (this.physics.ballMesh) this.physics.ballMesh.visible = true;
      this.setPullAngle(0);
      this.updateBallInCup();

      await sleep(600);

      // -----------------------------------------------------------------
      // Step 6: 发射1次 (Fire projectile once)
      // -----------------------------------------------------------------
      this.showTourBanner('6/8 Pulling arm and launching projectile: direct hit on target pyramid!');
      this.updateScrubber(0.72, '01:02');

      // Cock arm smoothly to 45 deg with continuous tilt clicks
      let lastPullSoundAngle = 0;
      await tweenPromise(
        { pull: 0 },
        { pull: 45 },
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

      // Launch ball!
      this.fire();

      // Wait for ball to land and blocks to topple
      await sleep(2400);

      // -----------------------------------------------------------------
      // Step 7: slow motion重播刚才的发射
      // -----------------------------------------------------------------
      this.showTourBanner('7/8 Slow-motion replay at quarter speed (0.25×)');
      this.updateScrubber(0.86, '01:14');

      // Reset physics blocks & ball for replay
      this.physics.resetBlocks();
      this.physics.wakeBlocks();
      this.physics.ballReleased = false;
      this.updateBallInCup();

      // Enable slow motion
      this.setSlowMo(true);

      // Cock arm to 45 deg again with continuous tilt clicks
      let lastReplayPullSound = 0;
      await tweenPromise(
        { pull: 0 },
        { pull: 45 },
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

      // Launch slow motion
      this.fire();

      // Wait for slow motion shot to finish (runs at 0.25x so ~4.5s)
      await sleep(4500);

      // -----------------------------------------------------------------
      // Step 8: 切到自定义界面状态
      // 注意：2-8图纸上的投石机铅笔画草图隐藏
      // -----------------------------------------------------------------
      this.showTourBanner('8/8 Tour complete! Customize weight, pull angle, and launch it yourself.');
      this.updateScrubber(1.0, '01:24');
      this.setSlowMo(false);
      this.setPlayButtonState(false);

      await sleep(1600);

      this.hideTourBanner();
      this.showBuildPanel(); // Switches interface to custom "Build it yourself" mode
      this.updateNavButtons('build');

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
    this.dragHint.classList.remove('hidden');
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

    if (this.scrubberContainer) {
      this.scrubberContainer.addEventListener('click', (e) => {
        const rect = this.scrubberContainer.getBoundingClientRect();
        const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        if (clickRatio > 0.85) {
          this.showBuildPanel();
        } else if (clickRatio < 0.15) {
          this.resetToFirstFrame();
        } else {
          this.playTour();
        }
      });
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

    // Step physics
    this.physics.step(delta);

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
