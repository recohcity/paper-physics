import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';

import { createWoodTableTexture, createPaperWithSketchTexture } from './textures.js';
import { Environment } from './environment.js';
import { NewtonCradleModel } from './mechanism.js';
import { sound } from './audio.js';

/**
 * App shell for the Newton's cradle case (Workstream B: foreground shell only).
 *
 * This is the reusable sketch2sim shell — scene/camera, desk + A4 paper +
 * pencil + eraser, 8-step tour framework, tour/build mode switching, view
 * presets, slow-mo, render loop, annotation canvas, tour banner. It carries
 * all the generic pitfall fixes (dynamic step gating, LIFT bottom-edge pivot,
 * free-orbit toggle gating, bidirectional reset) but contains ZERO mechanism
 * geometry or physics — those live in mechanism.js, which is an empty skeleton
 * in this workstream.
 */
class App {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // UI elements
    this.tourBanner = document.getElementById('tour-banner');
    this.tourBannerText = document.getElementById('tour-banner-text');
    this.buildPanel = document.getElementById('build-panel');
    this.slowMoBadge = document.getElementById('slow-mo-badge');
    this.dragHint = document.getElementById('drag-hint');
    // Physics info card.
    this.physicsCard = document.createElement('div');
    this.physicsCard.style.cssText = 'position:fixed;left:30px;bottom:140px;width:300px;background:linear-gradient(135deg,#f5f0e6,#e8e0d0);border:1px solid #d4c9b0;border-radius:2px;padding:18px;z-index:20;opacity:0;transition:opacity 0.5s;box-shadow:2px 4px 16px rgba(0,0,0,0.3);pointer-events:auto;user-select:text;';
    this.physicsCard.innerHTML = '<div style="position:absolute;top:6px;right:10px;cursor:pointer;color:#8b7355;font-size:14px;" onclick="this.parentElement.style.opacity=\'0\'">×</div>'
      + '<div style="font-size:10px;color:#8b6f47;letter-spacing:2px;text-transform:uppercase;">Newton\'s Cradle</div>'
      + '<div style="font-size:14px;font-weight:700;margin-top:2px;">Physics Info</div>'
      + '<div style="margin-top:8px;font-size:10px;color:#8b6f47;">Pendulum Equation</div>'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:13px;margin:2px 0 8px 0;">θ̈ = −(g/L) sinθ</div>'
      + '<div style="font-size:10px;color:#8b6f47;">Collision (elastic, mass-weighted)</div>'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:12px;margin:2px 0 2px 0;">v₁′ = ((m₁−em₂)/(m₁+m₂))v₁ + ((1+e)m₂/(m₁+m₂))v₂</div>'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:12px;margin:2px 0 4px 0;">v₂′ = ((1+e)m₁/(m₁+m₂))v₁ + ((m₂−em₁)/(m₁+m₂))v₂</div>'
      + '<div style="font-size:10px;color:#6b5f47;margin:4px 0 8px 0;">Equal mass → velocity swap</div>'
      + '<div style="font-size:10px;color:#8b6f47;">V-Rope Constraint</div>'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:13px;margin:2px 0 8px 0;">two strings confine ball to 2D plane</div>'
      + '<div style="font-size:10px;color:#8b6f47;">Materials (density kg/m³)</div>'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:13px;margin:2px 0 8px 0;">steel 7850 · plastic 1050 (≈1/7.5 mass)</div>'
      + '<div style="font-size:10px;color:#8b6f47;">Restitution</div>'
      + '<div style="font-family:Georgia,serif;font-style:italic;font-size:13px;margin:2px 0 0 0;">e = 0.97</div>';
    document.body.appendChild(this.physicsCard);
    this._physicsCardTimer = null;
    // Click title to show card 5s.
    const brandTitle = document.getElementById('brand-title');
    if (brandTitle) brandTitle.addEventListener('click', () => this.showPhysicsCard(5000));
    const brandTag = document.getElementById('brand-tag');
    if (brandTag) brandTag.addEventListener('click', () => this.showPhysicsCard(5000));

    this.scrubberProgress = document.getElementById('scrubber-progress');
    this.scrubberThumb = document.getElementById('scrubber-thumb');
    this.scrubberCurrentTime = document.getElementById('scrubber-current-time');
    this.btnPlayTour = document.getElementById('btn-play-tour');
    this.btnBuildYourself = document.getElementById('btn-build-yourself');

    this.btnToggleSlowMo = document.getElementById('btn-toggle-slowmo');
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
    this.isTourRunning = true;
    this.isTourPlaying = false;
    this.tourAbortController = null;
    this.isCameraTransitioning = false;
    this.cameraTransitionId = 0;
    this._lastFixedView = 'Hero';

    this.initThree();
    this.initEnvironment();
    this.mechanism = new NewtonCradleModel(this.scene, this.renderer, () => {
      // glb finished loading + whitened: re-gate buttons so MODEL becomes available.
      this.updateTourStepAvailability();
    });
    this.initEvents();

    this.clock = new THREE.Clock();
    this._initDrag();
    this._initMaterialButtons();
    this.animate();

    // Fade out loading overlay after first frame renders
    setTimeout(() => {
      const l = document.getElementById('loading');
      if (l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 400); }
    }, 300);

    this.resetToFirstFrame();

    // Self-check hook: ?autoplay=1 runs the tour on load (used by the bootstrap
    // screenshots; harmless in normal use).
    if (location.search.includes('autoplay')) {
      setTimeout(() => this.playTour(), 400);
    }
    window.__app = this; // debug handle for CDP self-checks
  }

  // ------------------------------------------------------------------ three
  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2e251d');

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 50);
    this.camera.position.set(0.2, 1.4, 2.5);
    this.camera.lookAt(0.12, 0.3, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.touchAction = 'none';
    // ---------------- STANDARD LIGHTING RIG (copied verbatim from trebuchet) --
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const LIGHT = {
      exposure: 1.08,
      envIntensity: 0,
      ambient: { color: 0xffeed9, intensity: 0.95 },
      sun: { color: 0xfffaec, intensity: 2.3, position: [-2.5, 4.5, 3.2] },
      fill: { color: 0xdce7f6, intensity: 0.6, position: [3, 2, -1] },
    };
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = LIGHT.exposure;
    this.container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMapTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMapTexture;
    this.scene.environmentIntensity = LIGHT.envIntensity; // 0 = no global IBL wash

    this.renderer.domElement.tabIndex = 1;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0.12, 0.3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.4;
    this.controls.maxDistance = 8;
    this.controls.update();
    // Hero/Side/Top are FIXED views; free orbit is only on via the 3D toggle.
    this.currentView = 'Top';
    this.controls.enabled = false;

    // Weak ambient to lift shadow side off gray; sun remains the key light.
    const ambientLight = new THREE.AmbientLight(LIGHT.ambient.color, LIGHT.ambient.intensity);
    this.scene.add(ambientLight);

    this.sunLight = new THREE.DirectionalLight(LIGHT.sun.color, LIGHT.sun.intensity);
    this.sunLight.position.set(...LIGHT.sun.position);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 15;
    this.sunLight.shadow.camera.left = -2.8;
    this.sunLight.shadow.camera.right = 2.8;
    this.sunLight.shadow.camera.top = 2.8;
    this.sunLight.shadow.camera.bottom = -2.8;
    this.sunLight.shadow.bias = -0.0002;
    this.sunLight.shadow.radius = 12;
    this.sunLight.shadow.blurSamples = 16;
    this.scene.add(this.sunLight);

    const fillLight = new THREE.DirectionalLight(LIGHT.fill.color, LIGHT.fill.intensity);
    fillLight.position.set(...LIGHT.fill.position);
    this.scene.add(fillLight);
  }

  // ------------------------------------------------------------- environment
  initEnvironment() {
    this.woodTableTexture = createWoodTableTexture();
    const loader = new THREE.TextureLoader();
    // Cream paper with the composited pencil sketch (public/sketch_newton-cradle.jpg)
    this.paperSketchTexture = loader.load('sketch_newton-cradle.jpg');
    this.paperSketchTexture.colorSpace = THREE.SRGBColorSpace;
    // Clean cream paper for when the sketch lifts off.
    this.paperCleanTexture = new THREE.CanvasTexture(createPaperWithSketchTexture());
    this.paperCleanTexture.colorSpace = THREE.SRGBColorSpace;

    this.environment = new Environment(
      this.scene,
      this.woodTableTexture,
      this.paperSketchTexture,
      this.paperCleanTexture
    );
    this.initSketchCutout();
  }

  // 2D cutout that lifts off the paper and stands up (LIFT step).
  initSketchCutout() {
    // Built lazily once the transparent cutout PNG loads, so the plane aspect
    // matches the artwork exactly. Bottom edge = pivot (pitfall: bottom, not
    // center). Positioned at the future model group origin (0.12, ~0, 0) so
    // the later 3D model unfolds out of the same footprint (pitfall #29).
    this.cutoutMesh = null;
    this._cutoutLoaded = false;
    const loader = new THREE.TextureLoader();
    loader.load('cutout_newton-cradle.png', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 16;

      const img = texture.image;
      const aspect = img.width / img.height;       // w / h
      const standH = 0.35;                           // match cradle 3D height
      const standW = standH * aspect;

      const geom = new THREE.PlaneGeometry(standW, standH);
      geom.translate(0, standH / 2, 0);             // bottom edge at local y = 0
      const mat = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.06,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.0,
        depthWrite: false,
      });
      this.cutoutMesh = new THREE.Mesh(geom, mat);
      this.cutoutMesh.castShadow = true;
      this.cutoutMesh.receiveShadow = true;
      this.cutoutMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: texture,
        alphaTest: 0.06,
      });
      // Model group origin (0.12, 0, 0); bottom edge rests just above the table.
      this.cutoutMesh.position.set(0.12, 0.007, 0);
      this.cutoutMesh.rotation.x = -Math.PI / 2;    // flat on paper
      this.cutoutMesh.visible = false;
      this.scene.add(this.cutoutMesh);
      this._cutoutLoaded = true;
      // If we are already on the LIFT step when the texture arrives, reflect it.
      this.updateTourStepAvailability();
    });
  }

  // ----------------------------------------------------------------- camera
  getFitDistance(neededWidth, neededHeight) {
    const aspect = window.innerWidth / window.innerHeight;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const tanHalf = Math.tan(vFov / 2);
    const dForHeight = neededHeight / (2 * tanHalf);
    const dForWidth = neededWidth / (2 * tanHalf * aspect);
    return (Math.max(dForHeight, dForWidth) + 0.15) * this.zoomFactor;
  }

  setCameraView(viewName, duration = 1000) {
    this.currentView = viewName;
    const transitionId = ++this.cameraTransitionId;
    this.isCameraTransitioning = duration > 0;
    [this.btnViewHero, this.btnViewSide, this.btnViewTop, this.btnView3D].forEach(b => b?.classList.remove('active'));

    const look = new THREE.Vector3(0.12, 0.12, 0);
    let targetPos;

    if (viewName === 'Hero') {
      this.btnViewHero?.classList.add('active');
      const d = this.getFitDistance(1.6, 1.1);
      targetPos = new THREE.Vector3(0.12 + d * 0.35, look.y + d * 0.6, look.z + d * 0.85);
    } else if (viewName === 'Side') {
      this.btnViewSide?.classList.add('active');
      const d = this.getFitDistance(1.4, 1.05);
      targetPos = new THREE.Vector3(look.x, look.y + d * 0.12, look.z + d);
    } else if (viewName === 'Top') {
      this.btnViewTop?.classList.add('active');
      const d = this.getFitDistance(2.6, 2.0);
      targetPos = new THREE.Vector3(look.x, look.y + d, look.z + 0.01);
    } else if (viewName === '3D') {
      this._lastFixedView = (this.currentView && this.currentView !== '3D') ? this.currentView : 'Hero';
      this.isCameraTransitioning = false;
      this.controls.enabled = true;
      this.controls.update();
      return;
    }

    // Fixed view: exit free orbit.
    if (this.btnView3D) this.btnView3D.checked = false;
    this.controls.enabled = false;

    if (duration === 0) {
      this.camera.position.copy(targetPos);
      this.camera.lookAt(look);
      this.controls.target.copy(look);
      this.controls.update();
      this.controls.enabled = false;
      this.isCameraTransitioning = false;
      return;
    }

    this.controls.enabled = false;
    new TWEEN.Tween(this.camera.position)
      .to(targetPos, duration)
      .easing(TWEEN.Easing.Cubic.Out)
      .onComplete(() => {
        if (transitionId === this.cameraTransitionId) {
          this.controls.target.copy(look);
          this.controls.enabled = false;
          this.controls.update();
          this.isCameraTransitioning = false;
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

  // ------------------------------------------- tour-step readiness (dynamic)
  // The enabled/disabled state of each tour button is DERIVED from what has
  // actually been built, never hardcoded (skill step 0 gating rule).
  computeAvailableSteps() {
    const m = this.mechanism;
    return [
      true,                  // 0 SKETCH — template ships it
      true,                  // 1 LIFT — template ships it
      m.modelBuilt,          // 2 MODEL — only after white 3D loads
      m.modelBuilt,          // 3 MATERIAL — model exists, ready to assign materials
      m.interactiveReady,    // 4 PHYSICS
      m.interactiveReady,    // 5 PLAY
      m.interactiveReady,    // 6 REPLAY
      m.interactiveReady,    // 7 BUILD
    ];
  }

  updateTourStepAvailability() {
    const avail = this.computeAvailableSteps();
    document.querySelectorAll('.tour-step').forEach((btn, i) => {
      const on = !!avail[i];
      btn.classList.toggle('disabled', !on);
      btn.disabled = !on;
    });
  }

  firstUnbuiltStep() {
    const avail = this.computeAvailableSteps();
    for (let i = 0; i < avail.length; i++) if (!avail[i]) return i;
    return avail.length;
  }

  // -------------------------------------------------------------- first frame
  resetToFirstFrame() {
    if (this.tourAbortController) { this.tourAbortController.abort(); this.tourAbortController = null; }
    this.isTourRunning = true;
    this.setPlayButtonState(false);
    this.setSlowMo(false);

    // Full reset: physics + ball materials back to steel.
    if (this.mechanism && this.mechanism.modelBuilt) {
      this.mechanism.resetAll();
    }
    this._resetMaterialButtons();

    // Paper sketch on, pencil/eraser out; hide cutout + 3D model.
    this.environment.showPaperSketch();
    if (this.mechanism) {
      this.mechanism.group.visible = false;
      this.mechanism.group.scale.z = 0.0001;
    }
    if (this.cutoutMesh) {
      this.cutoutMesh.visible = false;
      this.cutoutMesh.rotation.x = -Math.PI / 2;
      this.cutoutMesh.material.opacity = 1.0;
    }

    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    if (this.physicsCard) this.physicsCard.style.opacity = '0';
    this.playerScrubber.classList.remove('hidden');
    this.updateScrubber(0, '00:00');
    this.updateNavButtons('tour');
    this.updateTourStepAvailability();
    this.showTourBanner('Hand-drawn sketch on A4 paper. Click Play to start the tour.');

    // Top view looking down at the sketch.
    this.setCameraView('Top', 0);
  }

  setPlayButtonState(isPlaying) {
    this.isTourPlaying = isPlaying;
    if (!this.scrubberPlay) return;
    this.scrubberPlay.innerHTML = isPlaying
      ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><rect x="6" y="4" width="4" height="16" fill="rgba(37,99,235,0.25)"></rect><rect x="14" y="4" width="4" height="16" fill="rgba(37,99,235,0.25)"></rect></svg>`
      : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5"><polygon points="6 4 20 12 6 20 6 4" fill="rgba(37,99,235,0.15)"></polygon></svg>`;
    this.scrubberPlay.title = isPlaying ? 'Pause Tour' : 'Play Tour';
  }

  toggleTourPlay() {
    if (this.isTourPlaying) {
      if (this.tourAbortController) { this.tourAbortController.abort(); this.tourAbortController = null; }
      this.setPlayButtonState(false);
      this.showTourBanner('Tour paused. Click Play to resume or Rewind to restart.');
    } else {
      this.playTour();
    }
  }

  // -------------------------------------------------------------------- tour
  async playTour() {
    this.resetToFirstFrame();
    this.tourSetup();
    await this.playTourFrom(0);
  }

  tourSetup() {
    if (this.tourAbortController) { this.tourAbortController.abort(); this.tourAbortController = null; }
    this.tourAbortController = new AbortController();
    this.isTourRunning = true;
    this.setPlayButtonState(true);
    this.buildPanel.classList.add('hidden');
    this.dragHint.classList.add('hidden');
    this.playerScrubber.classList.remove('hidden');
    this.updateNavButtons('tour');
  }

  async seekTourStep(i) {
    if (!this.computeAvailableSteps()[i]) return; // disabled — not built yet
    this.resetToFirstFrame();
    this.tourSetup();
    this.applyTourStepStart(i);
    await this.playTourFrom(i, i);
  }

  // Start-state snapshot for step i = the END state of step i-1, so playing
  // step i alone replays its OWN transition (e.g. LIFT replays Top->Side).
  applyTourStepStart(i) {
    this.environment.showPaperSketch();
    if (this.mechanism) this.mechanism.group.visible = false;
    this.setSlowMo(false);
    if (this.cutoutMesh) { this.cutoutMesh.visible = false; this.cutoutMesh.material.opacity = 1; }
    if (this.mechanism && i < 3) this.mechanism.resetToClay();

    if (i === 0) {
      // SKETCH: Top, paper with full sketch jpg, pencil+eraser.
      this.setCameraView('Top', 0);
    }
    if (i === 1) {
      // LIFT starts from SKETCH end: Top, paper with sketch, pencil+eraser.
      this.setCameraView('Top', 0);
    }
    if (i >= 2) {
      this.environment.clearPaperSketchOnly();
      if (this.cutoutMesh) {
        this.cutoutMesh.visible = true;
        this.cutoutMesh.rotation.x = 0;
        this.cutoutMesh.position.set(0.12, 0.007, 0);
        this.cutoutMesh.scale.set(1.6, 1.6, 1.6);
      }
      this.setCameraView('Side', 0);
    }
    if (i >= 3) {
      if (this.cutoutMesh) this.cutoutMesh.visible = false;
      if (this.mechanism) {
        this.mechanism.group.visible = true;
        this.mechanism.group.scale.z = 1.0;
        this.mechanism.setMaterialMorph(1);
        this.mechanism.materialsAssigned = true;
      }
      this.setCameraView('Hero', 0);
    }
    this.physicsCard.style.opacity = (i === 4) ? '1' : '0';
  }

  showPhysicsCard(ms = 2500) {
    this.physicsCard.style.opacity = '1';
    if (this._physicsCardTimer) clearTimeout(this._physicsCardTimer);
    if (ms > 0) {
      this._physicsCardTimer = setTimeout(() => { this.physicsCard.style.opacity = '0'; }, ms);
    }
  }

  async playTourFrom(startStep, singleStep = null) {
    const signal = this.tourAbortController.signal;
    const sleep = (ms) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Tour aborted'));
      const id = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(id); reject(new Error('Tour aborted')); }, { once: true });
    });
    const tweenPromise = (from, to, duration, easing, onUpdate) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Tour aborted'));
      let done = false;
      const tw = new TWEEN.Tween(from).to(to, duration).easing(easing || TWEEN.Easing.Cubic.InOut)
        .onUpdate(onUpdate)
        .onComplete(() => { if (!done) { done = true; resolve(); } })
        .start();
      const timeoutId = setTimeout(() => { if (!done) { done = true; resolve(); } }, duration + 60);
      signal.addEventListener('abort', () => { done = true; clearTimeout(timeoutId); tw.stop(); reject(new Error('Tour aborted')); }, { once: true });
    });

    const avail = this.computeAvailableSteps();
    const i = singleStep ?? startStep;

    try {
      // Step 0 — SKETCH: the hand drawing on cream paper.
      if (startStep <= 0 && (singleStep === null || singleStep === 0)) {
        this.environment.showPaperSketch();
        if (this.cutoutMesh) this.cutoutMesh.visible = false;
        if (this.mechanism) this.mechanism.group.visible = false;
        this.setCameraView('Top', 800);
        this.showTourBanner('1/2 Sketch: five steel balls on double strings, top beam + L-bracket.');
        this.updateScrubber(0.06, '00:04');
        this.highlightTourStep(0);
        await sleep(1500);
      }

      // Step 1 — LIFT: the flat sketch on the paper scales/moves to the cradle
      // spot (still lying on the paper), THEN stands up about its bottom edge.
      if (avail[1] && startStep <= 1 && (singleStep === null || singleStep === 1)) {
        this.showTourBanner('2/2 The sketch lifts off the paper and stands up about its bottom edge.');
        this.updateScrubber(0.19, '00:12');
        this.highlightTourStep(1);

        // Camera Top -> Side while the paper still shows the full sketch.
        this.setCameraView('Side', 1200);
        await sleep(1200);

        // Swap paper sketch -> flat cutout lying on paper at 1:1.
        this.environment.clearPaperSketchOnly();
        if (this.cutoutMesh) {
          this.cutoutMesh.visible = true;
          this.cutoutMesh.rotation.x = -Math.PI / 2;
          this.cutoutMesh.position.set(0.12, 0.007, 0);
          this.cutoutMesh.scale.set(1.6, 1.6, 1.6);
          this.cutoutMesh.material.opacity = 1;
        }
        sound.playPaperSlide();
        // Already at target size on paper; just stand up about the bottom edge.
        await tweenPromise({ rotX: -Math.PI / 2 }, { rotX: 0 }, 1600, TWEEN.Easing.Cubic.InOut, (o) => {
          if (this.cutoutMesh) this.cutoutMesh.rotation.x = o.rotX;
        });
        await sleep(400);
      }

      // Step 2 — MODEL: the standing cutout fades out and the white-clay 3D
      // model unfolds along Z (scale.z 0 -> 2). z-unfold is its OWN tween
      // variable, never shared with the material morph (pitfall #26). At the
      // end of MODEL the material is STILL white clay; MATERIAL swaps it later.
      if (avail[2] && startStep <= 2 && (singleStep === null || singleStep === 2)) {
        this.showTourBanner('White 3D model. Check the five balls read as perfect spheres. Click MATERIAL when ready.');
        this.updateScrubber(0.31, '00:15');
        this.highlightTourStep(2);
        // Camera Side -> Hero WHILE the cutout stays stood up and visible.
        this.setCameraView('Hero', 1400);
        await sleep(1400);

        // Now at Hero: quick-hide the standing sketch, fade in the white model,
        // THEN unfold along Z.
        if (this.cutoutMesh) {
          this.cutoutMesh.visible = false;
        }

        const grp = this.mechanism.group;
        grp.visible = false;
        grp.scale.z = 0.0001;
        this.mechanism.resetToClay();
        grp.traverse((obj) => {
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => { m.transparent = true; m.opacity = 0; });
          }
        });
        await sleep(500);
        grp.visible = true;
        await tweenPromise({ op: 0 }, { op: 1 }, 800, TWEEN.Easing.Quadratic.Out, (o) => {
          grp.traverse((obj) => {
            if (obj.material) {
              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              mats.forEach((m) => { m.opacity = o.op; });
            }
          });
        });
        await tweenPromise({ z: 0.0001 }, { z: 1.0 }, 1800, TWEEN.Easing.Cubic.InOut, (o) => {
          grp.scale.z = o.z;
        });
        await sleep(300);
      }

      // Step 3 — MATERIAL: swap white clay for real materials (steel balls,
      // wood frame, metal hardware, LED strip, dark cord). We NEVER touch
        // group.scale here (pitfall #26): the z-unfold is already done.
      if (avail[3] && startStep <= 3 && (singleStep === null || singleStep === 3)) {
        this.showTourBanner('Real materials: polished steel balls, wood frame, LED strip, dark cord strings.');
        this.updateScrubber(0.43, '00:18');
        this.highlightTourStep(3);
        this.setCameraView('Hero', 1000);

        // Make sure the 2D cutout is gone (direct jump to MATERIAL skips the
        // MODEL fade) and the 3D model is visible at full depth.
        if (this.cutoutMesh) this.cutoutMesh.visible = false;
        this.mechanism.group.visible = true;
        this.mechanism.group.scale.z = 1.0;
        this.mechanism.resetToClay();
        await tweenPromise({ t: 0 }, { t: 1 }, 1600, TWEEN.Easing.Quadratic.InOut, (o) => {
          this.mechanism.setMaterialMorph(o.t);
        });
        this.mechanism.materialsAssigned = true;
        this.updateTourStepAvailability();
        await sleep(300);
      }

      // Step 4 — PHYSICS: static arrangement + explanation card (stays through PLAY/REPLAY).
      if (avail[4] && startStep <= 4 && (singleStep === null || singleStep === 4)) {
        this.showTourBanner('Physics: equal-mass elastic collision swaps velocity. V-ropes constrain to 2D plane.');
        this.mechanism.reset();
        this.showPhysicsCard(0); // persistent until build
      }

      // Step 5 — PLAY: Ball_0 pulled left, released, full round-trip, then resets.
      if (avail[5] && startStep <= 5 && (singleStep === null || singleStep === 5)) {
        this.showTourBanner('PLAY: Ball_0 swings left, hits. Wave travels right, Ball_4 pops. Ball_4 rebounds, hits back, Ball_0 pops. Then settles to rest.');
        this.setCameraView('Hero', 800);
        await sleep(1000);
        this.mechanism.resetAll();
        await sleep(300);
        await this.mechanism.pullAndRelease(0, -THREE.MathUtils.degToRad(20), 0);
        await sleep(2000);
        this.mechanism.resetAll();
      }

      // Step 6 — REPLAY: 0.25× slow motion of the same round-trip.
      if (avail[6] && startStep <= 6 && (singleStep === null || singleStep === 6)) {
        this.showTourBanner('REPLAY: 0.25× slow motion. Watch the momentum wave transfer.');
        this.setSlowMo(true);
        this.mechanism.resetAll();
        await sleep(500);
        await this.mechanism.pullAndRelease(0, -THREE.MathUtils.degToRad(20), 0);
        await sleep(4000);
        this.setSlowMo(false);
        this.mechanism.resetAll();
      }

      // Step 7 — BUILD: switch to build panel, Side view.
      if (avail[7] && startStep <= 7 && (singleStep === null || singleStep === 7)) {
        if (this.physicsCard) this.physicsCard.style.opacity = '0';
        if (singleStep === null) {
          // Full tour ends: hand off to build mode.
          this.showBuildPanel();
        } else {
          this.showTourBanner('BUILD: drag any ball and release. Momentum transfers through the chain.');
          this.mechanism.reset();
          this.setCameraView('Side', 800);
        }
      }

      this.setPlayButtonState(false);
    } catch (err) {
      if (err.message === 'Tour aborted') console.log('Tour stopped.');
      else console.error(err);
    }
  }

  // ------------------------------------------------------------------- misc
  showTourBanner(/* text */) { this.tourBanner.classList.add('hidden'); }
  hideTourBanner() { this.tourBanner.classList.add('hidden'); }

  updateScrubber(progress, timeStr) {
    const pct = Math.min(100, Math.max(0, progress * 100));
    this.scrubberProgress.style.width = `${pct}%`;
    this.scrubberThumb.style.left = `${pct}%`;
    this.scrubberCurrentTime.textContent = timeStr;
    this.highlightTourStep(Math.min(7, Math.max(0, Math.floor(progress * 8))));
  }

  highlightTourStep(i) {
    document.querySelectorAll('.tour-step').forEach((btn, idx) => btn.classList.toggle('active', idx === i));
  }

  setSlowMo(enabled) {
    this.slowMotion = enabled;
    this.timeScale = enabled ? 0.25 : 1.0;
    this.slowMoBadge.classList.toggle('hidden', !enabled);
    if (this.btnToggleSlowMo) this.btnToggleSlowMo.classList.toggle('active', enabled);
  }

  updateNavButtons(mode) {
    if (mode === 'tour') {
      this.btnPlayTour.classList.replace('btn-secondary', 'btn-primary');
      this.btnBuildYourself.classList.replace('btn-primary', 'btn-secondary');
    } else {
      this.btnBuildYourself.classList.replace('btn-secondary', 'btn-primary');
      this.btnPlayTour.classList.replace('btn-primary', 'btn-secondary');
    }
  }

  showBuildPanel() {
    if (!this.mechanism.interactiveReady) return;
    if (this.tourAbortController) { this.tourAbortController.abort(); this.tourAbortController = null; }
    this.isTourRunning = false;
    this.setPlayButtonState(false);
    this.setSlowMo(false);
    this.tourBanner.classList.add('hidden');
    if (this.physicsCard) this.physicsCard.style.opacity = '0';
    this.environment.hidePaperSketch();
    if (this.cutoutMesh) this.cutoutMesh.visible = false;
    // Full reset: physics + ball materials back to steel.
    this.mechanism.resetAll();
    this._resetMaterialButtons();
    // Show the 3D cradle with real materials.
    this.mechanism.group.visible = true;
    this.mechanism.group.scale.z = 1.0;
    this.mechanism.setMaterialMorph(1);
    this.mechanism.materialsAssigned = true;
    this.setCameraView('Side', 800);
    this.buildPanel.classList.remove('hidden');
    this.playerScrubber.classList.add('hidden');
    this.updateNavButtons('build');
  }

  // ----------------------------------------------------------------- events
  initEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      if (this.currentView) this.setCameraView(this.currentView, 0);
    });

    this.btnPlayTour.addEventListener('click', () => { sound.init(); this.playTour(); });
    this.btnBuildYourself.addEventListener('click', () => { sound.init(); this.showBuildPanel(); });

    this.btnToggleSlowMo.addEventListener('click', () => this.setSlowMo(!this.slowMotion));

    // Angle sliders for bidirectional experiment.
    const sliderL = document.getElementById('slider-angle-l');
    const sliderR = document.getElementById('slider-angle-r');
    const valL = document.getElementById('val-angle-l');
    const valR = document.getElementById('val-angle-r');
    const linkChk = document.getElementById('slider-link');
    const rad = (deg) => deg * Math.PI / 180;
    sliderL.addEventListener('input', () => {
      valL.textContent = sliderL.value + '°';
      if (linkChk.checked) { sliderR.value = sliderL.value; valR.textContent = sliderR.value + '°'; }
    });
    sliderR.addEventListener('input', () => {
      valR.textContent = sliderR.value + '°';
      if (linkChk.checked) { sliderL.value = sliderR.value; valL.textContent = sliderL.value + '°'; }
    });

    this._bidirK = 1;
    const btnBidir1 = document.getElementById('btn-bidir1');
    if (btnBidir1) btnBidir1.addEventListener('click', () => {
      sound.init();
      this._bidirK = 1;
      this.mechanism.bidirectionalExperiment(rad(+sliderL.value), rad(+sliderR.value), 1);
    });
    const btnBidir2 = document.getElementById('btn-bidir2');
    if (btnBidir2) btnBidir2.addEventListener('click', () => {
      sound.init();
      this._bidirK = 2;
      this.mechanism.bidirectionalExperiment(rad(+sliderL.value), rad(+sliderR.value), 2);
    });
    const btnBidirPlay = document.getElementById('btn-bidir-play');
    if (btnBidirPlay) btnBidirPlay.addEventListener('click', () => {
      sound.init();
      this.mechanism.reset();
      this.mechanism.pullAndRelease(0, -THREE.MathUtils.degToRad(20), 0);
    });

    this.btnReset.addEventListener('click', () => {
      this.mechanism.reset();
      // Reset panel controls to defaults
      const sL = document.getElementById('slider-angle-l');
      const sR = document.getElementById('slider-angle-r');
      const link = document.getElementById('slider-link');
      if (sL) { sL.value = 34; document.getElementById('val-angle-l').textContent = '34°'; }
      if (sR) { sR.value = 34; document.getElementById('val-angle-r').textContent = '34°'; }
      if (link) link.checked = true;
      this._resetMaterialButtons();
      for (let i = 0; i < 5; i++) {
        this.mechanism.ballTypes[i] = 'steel';
        this.mechanism.setBallMaterial(i, 'steel');
      }
    });

    this.btnViewHero.addEventListener('click', () => this.setCameraView('Hero'));
    this.btnViewSide.addEventListener('click', () => this.setCameraView('Side'));
    this.btnViewTop.addEventListener('click', () => this.setCameraView('Top'));
    this.btnView3D.addEventListener('change', () => {
      if (this.btnView3D.checked) this.setCameraView('3D', 0);
      else { this.currentView = this._lastFixedView || 'Hero'; this.controls.enabled = false; }
    });

    this.zoomSlider.addEventListener('input', (e) => {
      this.zoomFactor = parseInt(e.target.value) / 100;
      if (this.currentView) this.setCameraView(this.currentView, 0);
    });

    this.soundBtn.addEventListener('click', () => {
      const muted = sound.toggleMute();
      this.soundBtn.style.opacity = muted ? '0.4' : '1';
    });
    this.scrubberMute.addEventListener('click', () => {
      const muted = sound.toggleMute();
      this.scrubberMute.style.opacity = muted ? '0.4' : '1';
    });

    this.scrubberPlay.addEventListener('click', () => { sound.init(); this.toggleTourPlay(); });
    this.scrubberRw.addEventListener('click', () => { sound.init(); this.resetToFirstFrame(); });
    this.scrubberFf.addEventListener('click', () => { sound.init(); this.showBuildPanel(); });

    // Tour-step buttons: gated by dynamic availability.
    document.querySelectorAll('.tour-step').forEach((btn) => {
      btn.addEventListener('click', () => {
        sound.init();
        const step = parseInt(btn.dataset.step, 10);
        if (btn.disabled) return;
        if (step === 7) { this.showBuildPanel(); return; }
        this.seekTourStep(step);
      });
    });
  }

  // ------------------------------------------------------------------ render
  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05) * this.timeScale;
    TWEEN.update();

    // Free orbit only while the 3D toggle is on (pitfall #31: gate controls by
    // the toggle, not by currentView, so the loop never re-enables it).
    if (this.btnView3D && this.btnView3D.checked && !this.isCameraTransitioning) {
      this.controls.enabled = true;
    } else if (!this.isCameraTransitioning) {
      this.controls.enabled = false;
    }
    this.controls.update();

    this.mechanism.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  // ------------------------------------------------------------------ drag
  _initDrag() {
    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    // Map pointerId -> ballIndex for multi-touch bidirectional dragging.
    const activePointers = new Map();
    const setPtr = (e) => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (this.buildPanel.classList.contains('hidden')) return;
      setPtr(e);
      ray.setFromCamera(ptr, this.camera);
      const balls = this.mechanism.balls;
      const hit = ray.intersectObjects(balls, false)[0];
      if (hit) {
        const idx = balls.indexOf(hit.object);
        this.mechanism.beginDrag(idx);
        activePointers.set(e.pointerId, idx);
        this.renderer.domElement.setPointerCapture(e.pointerId);
      }
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      const dragIdx = activePointers.get(e.pointerId);
      if (dragIdx === undefined) return;
      setPtr(e);
      ray.setFromCamera(ptr, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;
      this.mechanism.moveDragToX(p.x, p.y, dragIdx);
    });
    const endPointer = (e) => {
      const dragIdx = activePointers.get(e.pointerId);
      if (dragIdx !== undefined) {
        this.mechanism.endDrag(dragIdx);
        activePointers.delete(e.pointerId);
      }
    };
    this.renderer.domElement.addEventListener('pointerup', endPointer);
    this.renderer.domElement.addEventListener('pointercancel', endPointer);
  }

  _initMaterialButtons() {
    const row = document.getElementById('ball-material-row');
    if (!row) return;
    this._matBtns = [];
    for (let i = 0; i < 5; i++) {
      const btn = document.createElement('button');
      btn.textContent = i + 1;
      btn.title = `Ball ${i+1}: click to toggle metal/plastic`;
      btn.style.cssText = 'height:20px;padding:0;font-size:10px;border-radius:4px;border:1px solid rgba(180,168,150,0.4);background:#c8ccd2;cursor:pointer;color:#333;font-weight:600;display:flex;align-items:center;justify-content:center;';
      btn.addEventListener('click', () => {
        const cur = this.mechanism.ballTypes[i];
        const next = cur === 'steel' ? 'plastic' : 'steel';
        this.mechanism.setBallMaterial(i, next);
        btn.style.background = next === 'steel' ? '#c8ccd2' : '#d4a017';
        btn.title = `Ball ${i+1}: ${next === 'steel' ? 'metal' : 'plastic'}`;
      });
      row.appendChild(btn);
      this._matBtns.push(btn);
    }
  }

  _resetMaterialButtons() {
    if (!this._matBtns) return;
    for (const btn of this._matBtns) {
      btn.style.background = '#c8ccd2';
      btn.title = '';
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { new App(); });
