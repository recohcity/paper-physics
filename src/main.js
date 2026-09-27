import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as TWEEN from '@tweenjs/tween.js';
import confetti from 'canvas-confetti';

import { createWoodTableTexture, createPaperWithSketchTexture, createBalsaTexture, createLeadTexture } from './textures.js';
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
    this.zoomSlider = document.getElementById('zoom-slider');
    this.zoomFactor = 1.6;

    // Simulation settings
    this.slowMotion = false;
    this.timeScale = 1.0;
    this.counterweightKg = 0.68;
    this.flightPathEnabled = true;
    // The opening presentation is playback-only until the user chooses
    // "Build it yourself".  The same guard is reused while a tour runs.
    this.isTourRunning = true;
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

    // Start with Hero camera view
    this.setCameraView('Hero', 0);
    this.updateNavButtons('tour');
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
    this.paperSketchTexture = createPaperWithSketchTexture();
    this.environment = new Environment(this.scene, this.woodTableTexture, this.paperSketchTexture);
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
    sound.playRelease();

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

  // Guided Tour sequence (matching YouTube demo script)
  playTour() {
    this.isTourRunning = true;
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.annotations.showTrajectories = true;
    this.updateNavButtons('tour');

    // Step 0: Top view showing pencil sketch on paper (3D model hidden)
    this.setCameraView('Top', 0);
    this.trebuchet.setMorphFactor(0);
    this.morphSlider.value = 0;
    this.resetAll();
    this.physics.blockMeshes.forEach(m => m.visible = false);
    if (this.physics.ballMesh) this.physics.ballMesh.visible = false;

    this.showTourBanner('Hand-drawn catapult design: 40 mm blocks, lead counterweight.');
    this.updateScrubber(0.05, '00:04');

    // Smooth chained morph: 0 → 0.33 → 0.66 → 1.0 as one continuous motion
    const applyMorph = (o) => {
      this.trebuchet.setMorphFactor(o.f);
      this.physics.setMorphFactor(o.f);
      this.morphSlider.value = Math.round(o.f * 100);
    };

    setTimeout(() => {
      this.showTourBanner('Folding the sketch up...');
      this.environment.hidePaperSketch();
      this.physics.blockMeshes.forEach(m => m.visible = true);
      if (this.physics.ballMesh) this.physics.ballMesh.visible = true;
      this.setCameraView('Hero', 2500);
      this.updateScrubber(0.20, '00:18');

      new TWEEN.Tween({ f: 0 })
        .to({ f: 0.33 }, 1500)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate(applyMorph)
        .onComplete(() => {
          this.showTourBanner('Rising into 3D...');
          new TWEEN.Tween({ f: 0.33 })
            .to({ f: 0.66 }, 1500)
            .easing(TWEEN.Easing.Cubic.InOut)
            .onUpdate(applyMorph)
            .onComplete(() => {
              this.showTourBanner('Adding wood grain...');
              new TWEEN.Tween({ f: 0.66 })
                .to({ f: 1.0 }, 1500)
                .easing(TWEEN.Easing.Cubic.InOut)
                .onUpdate(applyMorph)
                .start();
            })
            .start();
        })
        .start();
    }, 2500);

    // Step 4 (at 7.5s): First throw with 0.48 kg lead counterweight (falls short!)
    setTimeout(() => {
      this.showTourBanner('First throw: lead counterweight at 0.48 kg (simulated physics, not scripted).');
      this.setWeight(0.48);
      this.setPullAngle(45);
      this.updateScrubber(0.40, '00:36');
      this.fire();
    }, 7500);

    // Step 5 (at 10.5s): Fall short -> Add more lead (0.48 kg -> 0.68 kg)!
    setTimeout(() => {
      this.showTourBanner('The first throw falls short, so the sketch gets more lead (0.48 kg → 0.68 kg)...');
      this.updateScrubber(0.60, '00:54');
      this.resetAll();

      setTimeout(() => {
        this.setWeight(0.68);
        this.setPullAngle(45);
      }, 800);
    }, 10500);

    // Step 6 (at 13.5s): Second throw replayed in Slow Motion (0.25x), knocks down blocks!
    setTimeout(() => {
      this.showTourBanner('Second throw: 0.68 kg counterweight, replayed at quarter speed (0.25×).');
      this.setSlowMo(true);
      this.updateScrubber(0.85, '01:12');
      this.fire();
    }, 13500);

    // Step 5 (at 17.0s): Complete tour & switch to "Build it yourself"
    setTimeout(() => {
      this.showTourBanner('Blocks knocked down! Tour complete — now build and launch it yourself.');
      this.setSlowMo(false);
      this.updateScrubber(1.0, '01:24');

      setTimeout(() => {
        this.hideTourBanner();
        this.showBuildPanel();
      }, 2500);
    }, 17000);
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
    // The tour can also arrive here automatically.  It must explicitly leave
    // tour state so the next custom launch uses the normal reset behavior.
    this.isTourRunning = false;
    this.buildPanel.classList.remove('hidden');
    this.dragHint.classList.remove('hidden');
    this.playerScrubber.classList.add('hidden');
    this.annotations.showTrajectories = false;
    this.updateNavButtons('build');
    // Entering build mode: reset to natural rest (counterweight on floor, spoon up)
    this.setPullAngle(0);
    this.physics.ballReleased = false;
    this.updateBallInCup();
    this.updateDragHint();
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
      sound.playCreak();
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

      // Release sound only after a real drag (not a simple click)
      if (this.dragMoved) sound.playRestore();

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
