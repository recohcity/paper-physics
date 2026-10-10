import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import * as CANNON from 'cannon-es';
import { createWoodFrameTexture } from './textures.js';
import { sound } from './audio.js';
import { SPEC } from './spec.js';

// Physical constants for ball materials.
// Ball radius calibrated at runtime; volume derived from ballR.
const DENSITY = SPEC.densities;

// Pure function returning the exact physics values the mechanism uses at runtime.
// verify.mjs imports this to detect hard-coded drift (variant A: if someone writes
// this.L = 0.5 instead of SPEC.pendulumLength, this function must still read SPEC).
export function resolveParams() {
  return {
    L: SPEC.pendulumLength,
    g: SPEC.gravity,
    ballR: SPEC.ballRadius,
    nBalls: SPEC.ballCount,
    airDrag: SPEC.airDrag,
    restitution: SPEC.restitution,
    densities: SPEC.densities,
  };
}

/**
 * NewtonCradleModel — white clay model that morphs into real materials.
 *
 * MODEL step: every mesh is white clay (metalness=0, roughness=1, no map/env,
 * color white). MATERIAL step: the SAME meshes morph from clay to real
 * materials (color/metalness/roughness/emissive interpolated) — the user sees
 * the white model "grow" chrome / wood / cord. We never touch group.scale in
 * MATERIAL (pitfall #26).
 *
 * Readiness flags (gating tour buttons, never hardcoded):
 *   modelBuilt        — glb loaded + whitened
 *   materialsAssigned — morph has reached t=1
 *   interactiveReady  — physics (later workstream)
 */

// White clay reference values.
const CLAY = { color: new THREE.Color(0xffffff), metalness: 0, roughness: 1, emissive: new THREE.Color(0), emissiveIntensity: 0 };

function categoryFor(name) {
  if (/^Ball_/.test(name)) return 'steel';
  if (/^Hook|^HookRod|^Socket|^Cap|^LClip/.test(name)) return 'metal'; // LClip = L-bracket metal
  if (/^Rope_/.test(name)) return 'rope';
  if (/^LED/.test(name)) return 'led';
  return 'wood'; // Beam / WallF / WallB
}

export class NewtonCradleModel {
  constructor(scene, renderer, onReady = null) {
    this.scene = scene;
    this.renderer = renderer;
    this.onReady = onReady;

    this.group = new THREE.Group();
    this.group.position.set(SPEC.groupOrigin.x, 0, 0);
    this.group.visible = false;
    this.group.scale.z = 0.0001;
    scene.add(this.group);

    this.modelBuilt = false;
    this.materialsAssigned = false;
    this.interactiveReady = false;

    this.entries = [];
    this.roster = { steel: [], metal: [], wood: [], rope: [], led: [] };
    this.balls = [];
    this.ballMats = [];   // per-ball MeshStandardMaterial
    this.ballTypes = [];  // 'steel' | 'plastic' per ball, indexed by ball number
    this.ballMatByName = {}; // mesh name → material
    this.masses = [];     // per-ball mass (kg)
    this._ballOverridden = new Set(); // mesh UUIDs manually switched
    this.physicsRunning = false;
    this._woodTex = createWoodFrameTexture();
    this._envMaps = {};   // 'steel' | 'plastic' → PMREM texture

    this._loadEnvMaps();
    this._loadGlb();
  }

  _loadEnvMaps() {
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      new EXRLoader().load('metal.exr', (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        this._envMaps.steel = pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
        this._applyEnvToBalls();
        console.log('[env] metal.exr loaded OK');
      }, undefined, (e) => console.warn('metal.exr failed:', e));
    } catch(e) { console.warn('env maps disabled:', e); }
  }

  _applyEnvToBalls() {
    if (!this.ballMats.length) return;
    for (let i = 0; i < this.ballMats.length; i++) {
      const mat = this.ballMats[i];
      const type = this.ballTypes[i] || 'steel';
      if (type === 'steel') {
        mat.envMap = this._envMaps.steel || null;
        mat.envMapIntensity = 1.5;
      } else {
        mat.envMap = null;
        mat.envMapIntensity = 0.3;
        mat.color.set(0xd4a017);
        mat.roughness = SPEC.materials.plastic.roughness;
      }
      mat.needsUpdate = true;
    }
  }

  _loadGlb() {
    new GLTFLoader().load('cradle.glb', (gltf) => {
      this._whiten(gltf.scene);
      this.group.add(gltf.scene);
      this._initPhysics();
      this.modelBuilt = true;
      if (this.onReady) this.onReady();
    }, undefined, (e) => console.error('cradle.glb failed', e));
  }

  // Give every mesh a white clay material and record its real-material target.
  _whiten(root) {
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const cat = categoryFor(obj.name);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 1 });
      obj.material = mat;
      obj.castShadow = true;
      obj.receiveShadow = true;

      let real;
      if (cat === 'steel') {
        real = { color: new THREE.Color(0xc8ccd2), metalness: 0.95, roughness: SPEC.materials.steel.roughness, emissive: new THREE.Color(0), emissiveIntensity: 0, map: null };
      } else if (cat === 'metal') {
        real = { color: new THREE.Color(0x9a9da3), metalness: 0.9, roughness: 0.25, emissive: new THREE.Color(0), emissiveIntensity: 0, map: null };
      } else if (cat === 'rope') {
        real = { color: new THREE.Color(0x2a2018), metalness: 0, roughness: 0.9, emissive: new THREE.Color(0), emissiveIntensity: 0, map: null };
      } else if (cat === 'led') {
        real = { color: new THREE.Color(0x111111), metalness: 0, roughness: 0.5, emissive: new THREE.Color(0xfff2d6), emissiveIntensity: 2.0, map: null };
      } else { // wood
        real = { color: new THREE.Color(0xffffff), metalness: 0, roughness: 0.6, emissive: new THREE.Color(0), emissiveIntensity: 0, map: this._woodTex };
      }
      this.entries.push({ mesh: obj, mat, real, cat });
      this.roster[cat].push(obj.name);
      if (cat === 'steel') {
        this.ballMats.push(mat);
        this.ballMatByName[obj.name] = mat;
        // Extract ball index from name "Ball_0" → 0
        const idx = parseInt(obj.name.match(/Ball_(\d+)/)?.[1] ?? '0');
        this.ballTypes[idx] = 'steel';
      }
    });
  }

  // t=0 white clay -> t=1 real materials.
  setMaterialMorph(t) {
    for (const e of this.entries) {
      // Skip manually-overridden ball materials.
      if (e.cat === 'steel' && this._ballOverridden && this._ballOverridden.has(e.mesh.uuid)) continue;
      const m = e.mat, r = e.real;
      m.color.copy(CLAY.color).lerp(r.color, t);
      m.metalness = CLAY.metalness + (r.metalness - CLAY.metalness) * t;
      m.roughness = CLAY.roughness + (r.roughness - CLAY.roughness) * t;
      m.emissive.copy(CLAY.emissive).lerp(r.emissive, t);
      m.emissiveIntensity = CLAY.emissiveIntensity + (r.emissiveIntensity - CLAY.emissiveIntensity) * t;
      // wood texture fades in once we're past mid-morph
      if (r.map) m.map = t > 0.4 ? r.map : null;
      // steel balls pull chrome reflections from the room env (global
      // environmentIntensity is 0, so set it per-material like trebuchet)
      if (e.cat === 'steel') m.envMapIntensity = t * 1.0;
      m.needsUpdate = true;
    }
  }

  resetToClay() { this.setMaterialMorph(0); this.materialsAssigned = false; }

  // ---- PHYSICS: analytic pendulum chain (ported from archive/newton-cradle-2) ----
  _initPhysics() {
    const p = resolveParams();
    this.L = p.L;
    this.g = p.g;
    this.ballR = p.ballR;
    this.nBalls = p.nBalls;
    this.airDrag = p.airDrag;
    this.restitution = p.restitution;
    this.theta = new Array(this.nBalls).fill(0);
    this.omega = new Array(this.nBalls).fill(0);
    this.dragIndex = -1;
    this.dragIndices = new Set();
    const root = this.group.children[0];
    this.pivots = [];
    this.balls = [];
    this.pivotGroups = [];
    for (let i = 0; i < this.nBalls; i++) {
      const ball = root.getObjectByName(`Ball_${i}`);
      if (!ball) continue;
      const hook = root.getObjectByName(`Hook_${i}_1`) || root.getObjectByName(`Hook_${i}_-1`);
      const pv = new THREE.Vector3();
      if (hook) hook.getWorldPosition(pv);
      this.group.worldToLocal(pv);
      this.pivots.push(pv);
      // Create pivot group at Hook, attach ball + sockets + caps.
      const pg = new THREE.Group();
      pg.position.copy(pv);
      root.add(pg);
      for (const name of [`Ball_${i}`, `Socket_${i}_1`, `Socket_${i}_-1`, `Cap_${i}_1`, `Cap_${i}_-1`, `Rope_${i}_1`, `Rope_${i}_-1`]) {
        const o = root.getObjectByName(name);
        if (o) pg.attach(o);
      }
      this.pivotGroups.push(pg);
      this.balls.push(ball);
    }
    // Calibration runs AFTER the tour completes (delayed), when the model is
    // fully visible and at rest. Measuring at GLB-load time gives wrong values
    // because the LIFT/MATERIAL animations haven't positioned things yet.
    this.physicsRunning = false;
    this.interactiveReady = true;
    this.ropeLines = [];

    // Apply env maps if already loaded (race: GLB vs EXR).
    this._applyEnvToBalls();

    // Delayed recalibration — fires 3s after init, when the scene is settled.
    setTimeout(() => this._calibrateTouching(), 3000);
    // Also expose for manual re-calibration from the console.
    window.__recalibrate = () => this._calibrateTouching();
  }

  _calibrateTouching() {
    if (this.balls.length < 2) return;
    const n = this.balls.length;
    this.scene.updateMatrixWorld(true);

    const root = this.group.children[0];
    const box = new THREE.Box3();
    const lo = new THREE.Vector3(), hi = new THREE.Vector3();
    const leftEdge = [], rightEdge = [];
    for (let i = 0; i < n; i++) {
      box.setFromObject(this.balls[i]);
      lo.copy(box.min); root.worldToLocal(lo);
      hi.copy(box.max); root.worldToLocal(hi);
      leftEdge.push(lo.x);
      rightEdge.push(hi.x);
    }
    console.log('[recal] leftEdge  :', leftEdge.map(v => v.toFixed(4)));
    console.log('[recal] rightEdge :', rightEdge.map(v => v.toFixed(4)));

    const diam = rightEdge[0] - leftEdge[0];
    this.ballR = diam / 2;
    this._computeMasses();

    const gaps = [];
    for (let i = 0; i < n - 1; i++) gaps.push(leftEdge[i + 1] - rightEdge[i]);
    console.log('[recal] gaps:', gaps.map(v => v.toFixed(4)), 'diam:', diam.toFixed(4));

    // Target: adjacent rightEdge[i] == leftEdge[i+1].
    // Anchor middle ball, shift each pivot group to eliminate its gap.
    const centerIdx = Math.floor(n / 2);
    const centerLeft = leftEdge[centerIdx];
    for (let i = 0; i < n; i++) {
      const targetLeft = centerLeft + (i - centerIdx) * diam;
      const deltaX = targetLeft - leftEdge[i];
      if (Math.abs(deltaX) > 1e-6) {
        this.pivotGroups[i].position.x += deltaX;
        this.pivots[i].x += deltaX;
        console.log('[recal] ball', i, 'shifted by', deltaX.toFixed(4));
      }
    }
  }

  // Compute mass per ball from volume × density.
  _computeMasses() {
    const vol = (4/3) * Math.PI * Math.pow(this.ballR, 3);
    this.masses = this.ballTypes.map(t => vol * DENSITY[t]);
    console.log('[physics] masses (g):', this.masses.map(m => (m*1000).toFixed(1)));
  }

  // Switch ball i between 'steel' and 'plastic'.
  setBallMaterial(i, type) {
    if (i < 0 || i >= this.ballTypes.length) return;
    this.ballTypes[i] = type;
    this._computeMasses();
    const mat = this.ballMats[i];
    this._ballOverridden.add(mat.uuid);
    if (type === 'plastic') {
      mat.color.set(0xd4a017);  // amber yellow
      mat.metalness = 0.0;
      mat.roughness = SPEC.materials.plastic.roughness;      // matte plastic
      mat.envMap = null;
      mat.envMapIntensity = 0.3;
    } else {
      mat.color.set(0xc8ccd2);
      mat.metalness = 0.95;
      mat.roughness = SPEC.materials.steel.roughness;
      mat.envMap = this._envMaps.steel || null;
      mat.envMapIntensity = 1.5;
    }
    mat.needsUpdate = true;
  }

  // Tween pull ball i to angle a over durationMs, then release.
  async pullAndRelease(i, angle, delayMs = 0, durationMs = 1000) {
    console.log('[physics] pullAndRelease', i, angle);
    this.physicsRunning = false;
    this.omega[i] = 0;
    await new Promise((res) => setTimeout(res, delayMs));
    // Tween theta from 0 to angle.
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      const t = (performance.now() - start) / durationMs;
      this.theta[i] = angle * t;
      await new Promise((r) => requestAnimationFrame(r));
    }
    this.theta[i] = angle;
    this.omega[i] = 0;
    this.physicsRunning = true;
  }

  reset() {
    this.theta.fill(0);
    this.omega.fill(0);
    this.physicsRunning = false;
    this.dragIndices.clear();
    this._applyKinematics(1 / 60);
  }

  // Full reset: physics + all ball materials back to steel.
  resetAll() {
    this.reset();
    this._ballOverridden.clear();
    for (let i = 0; i < this.ballTypes.length; i++) {
      this.ballTypes[i] = 'steel';
    }
    this._computeMasses();
    // Let setMaterialMorph(1) re-apply steel look to all balls.
  }

  // After one round-trip, smoothly damp all balls back to center and stop.
  async settle(ms = 1500) {
    const start = performance.now();
    const from = this.theta.slice();
    this.omega.fill(0);
    while (performance.now() - start < ms) {
      const t = (performance.now() - start) / ms;
      const k = 1 - t * t * (3 - 2 * t); // smoothstep ease-out
      for (let i = 0; i < this.theta.length; i++) {
        this.theta[i] = from[i] * k;
      }
      this._applyKinematics(1 / 60);
      await new Promise(r => requestAnimationFrame(r));
    }
    this.theta.fill(0);
    this.omega.fill(0);
    this.physicsRunning = false;
    this._applyKinematics(1 / 60);
  }

  beginDrag(i) {
    if (!this.dragIndices) this.dragIndices = new Set();
    this.dragIndices.add(i);
    this.omega[i] = 0;
  }
  endDrag(i) {
    if (!this.dragIndices) return;
    if (i !== undefined) this.dragIndices.delete(i);
    else this.dragIndices.clear();
    if (this.dragIndices.size === 0) this.physicsRunning = true;
  }

  moveDragToX(worldX, worldY, dragIdx) {
    const di = dragIdx !== undefined ? dragIdx : this.dragIndex;
    if (di < 0 || di === undefined || di === null) return;
    const local = new THREE.Vector3(worldX, worldY, 0);
    this.group.worldToLocal(local);
    const p = this.pivots[di];
    const dy = p.y - local.y;
    const dx = local.x - p.x;
    const th = Math.atan2(dx, Math.max(0.02, dy));
    this.theta[di] = Math.max(-1.2, Math.min(1.2, th));
    this.omega[di] = 0;
    // Push adjacent balls if touching (only in the direction away from center).
    for (let d = di - 1; d >= 0; d--) {
      if (this.dragIndices && this.dragIndices.has(d)) break; // already being dragged
      const a = this.ballCenter(d + 1), b = this.ballCenter(d);
      if (a.x - b.x < 2 * this.ballR + 1e-4) this.theta[d] = this.theta[d + 1]; else break;
    }
    for (let d = di + 1; d < this.nBalls; d++) {
      if (this.dragIndices && this.dragIndices.has(d)) break;
      const a = this.ballCenter(d - 1), b = this.ballCenter(d);
      if (b.x - a.x < 2 * this.ballR + 1e-4) this.theta[d] = this.theta[d - 1]; else break;
    }
  }

  moveDragTo(worldX, worldY) {
    if (this.dragIndex < 0) return;
    const local = new THREE.Vector3(worldX, worldY, this.pivots[this.dragIndex].z);
    this.group.worldToLocal(local);
    const p = this.pivots[this.dragIndex];
    const dy = p.y - local.y;
    const dx = local.x - p.x;
    let th = Math.atan2(dx, Math.max(0.02, dy));
    th = Math.max(-1.2, Math.min(1.2, th));
    this.theta[this.dragIndex] = th;
    this.omega[this.dragIndex] = 0;
  }

  ballCenter(i) {
    const p = this.pivots[i];
    return new THREE.Vector3(
      p.x + this.L * Math.sin(this.theta[i]),
      p.y - this.L * Math.cos(this.theta[i]),
      p.z
    );
  }

  _applyKinematics(dt) {
    if (this.physicsRunning) {
      for (let i = 0; i < this.nBalls; i++) {
        if (this.dragIndices && this.dragIndices.has(i)) continue;
        const acc = -(this.g / this.L) * Math.sin(this.theta[i]) - this.airDrag * this.omega[i];
        this.omega[i] += acc * dt;
        this.theta[i] += this.omega[i] * dt;
      }
    }
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < this.nBalls - 1; i++) {
        const a = this.ballCenter(i), b = this.ballCenter(i + 1);
        const dx = b.x - a.x;
        const minSep = 2 * this.ballR;
        if (dx < minSep) {
          if (this.physicsRunning) {
            const vi = this.L * this.omega[i];
            const vj = this.L * this.omega[i + 1];
            if (vi - vj > 0) {
              const e = this.restitution;
              const mi = this.masses[i] || 1;
              const mj = this.masses[i + 1] || 1;
              const M = mi + mj;
              // 1D elastic collision with restitution, mass-weighted.
              this.omega[i]     = ((mi - e*mj)/M * vi + (1+e)*mj/M * vj) / this.L;
              this.omega[i + 1] = ((1+e)*mi/M * vi + (mj - e*mi)/M * vj) / this.L;
              const hasPlastic = this.ballTypes[i] === 'plastic' || this.ballTypes[i+1] === 'plastic';
              if (hasPlastic) sound.playPlasticClack(Math.abs(vi - vj) / 0.5);
              else sound.playClack(Math.abs(vi - vj) / 0.5);
            }
          }
          const overlap = minSep - dx;
          const mi = this.masses[i] || 1;
          const mj = this.masses[i + 1] || 1;
          const iDragged = this.dragIndices && this.dragIndices.has(i);
          const jDragged = this.dragIndices && this.dragIndices.has(i + 1);
          // Mass-weighted positional correction: lighter ball moves more.
          const total = mi + mj;
          if (iDragged && !jDragged) {
            this.theta[i] -= overlap / this.L;
          } else if (jDragged && !iDragged) {
            this.theta[i + 1] += overlap / this.L;
          } else if (!iDragged && !jDragged) {
            this.theta[i]     -= overlap / this.L * (mj / total);
            this.theta[i + 1] += overlap / this.L * (mi / total);
          }
        }
      }
    }
    // Ceiling collision: ball center can't go above the pivot (top beam).
    // Ball center y = pivotY - L*cos(theta). Above pivot means cos(theta) < 0.
    // Limit theta to ±90° (horizontal). Bounce velocity back.
    for (let i = 0; i < this.nBalls; i++) {
      if (this.dragIndices && this.dragIndices.has(i)) continue;
      const limit = SPEC.angleLimit; // just below horizontal
      if (this.theta[i] > limit) {
        this.theta[i] = limit;
        if (this.omega[i] > 0) this.omega[i] *= -this.restitution;
      } else if (this.theta[i] < -limit) {
        this.theta[i] = -limit;
        if (this.omega[i] < 0) this.omega[i] *= -this.restitution;
      }
    }
    // Rotate pivot groups.
    for (let i = 0; i < this.nBalls; i++) {
      this.pivotGroups[i].rotation.z = this.theta[i];
    }
  }

  // Bidirectional experiment: pull k balls from each end outward, then release
  // immediately. angleL = left-side angle (rad), angleR = right-side angle.
  async bidirectionalExperiment(angleL = 0.6, angleR = 0.6, k = 1, durationMs = 600) {
    this.reset();
    this.physicsRunning = false;
    const start = performance.now();
    while (performance.now() - start < durationMs) {
      const t = (performance.now() - start) / durationMs;
      for (let j = 0; j < k; j++) {
        this.theta[j] = -angleL * t;                    // left side
        this.theta[this.nBalls - 1 - j] = angleR * t;   // right side
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    for (let j = 0; j < k; j++) {
      this.theta[j] = -angleL;
      this.theta[this.nBalls - 1 - j] = angleR;
      this.omega[j] = 0;
      this.omega[this.nBalls - 1 - j] = 0;
    }
    this.physicsRunning = true;
  }

  setParam() {}
  readout() { return []; }
  update(dt = 1 / 60) { this._applyKinematics(dt); }
  dispose() {}
}

// ============================================================================
// Headless probe — reference implementation per
// docs/sketch2sim-multi-agent-architecture.md §3.1 / §3.3 (G3/G4) / §2.3.5.
//
// `new Mechanism(world, scene, spec)` accepts null world/scene. In headless
// mode probe() builds its own cannon-es World, assembles the real Newton's
// cradle (n balls, radius ballR, string length L, initial touching,
// restitution from spec), releases the end ball by pullAngleDeg, steps fixed
// dt, and returns the §3.1 feature pack. No DOM, no THREE rendering path is
// touched on this branch.
//
// Every physics constant below is derived from `spec` (or this.resolveParams);
// never hand-copied from spec.json. Solver knobs (iterations/substeps) are
// numerical-method settings, not physics constants.
// ============================================================================

// Tolerate both the flattened SPEC shape and the raw spec.json nested shape.
function _normalizeSpec(spec) {
  const s = spec || SPEC;
  return {
    L: s.pendulumLength ?? s.physics?.pendulumLength,
    g: s.gravity ?? s.world?.gravity,
    ballR: s.ballRadius ?? s.physics?.ballRadius,
    nBalls: s.ballCount ?? s.geometry?.ballCount,
    restitution: s.restitution ?? s.physics?.restitution,
    airDrag: s.airDrag ?? s.physics?.airDrag,
    densities: s.densities ?? {
      steel: s.materials.steel.density,
      plastic: s.materials.plastic.density,
    },
    pullAngleDeg: s.inputs?.[0]?.value ?? 34,
  };
}

// Build one headless cannon-es cradle and return its bodies/constraints.
function _buildCradle(p) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -p.g, 0) });
  world.defaultContactMaterial.friction = 0.05;
  world.defaultContactMaterial.restitution = p.restitution;
  world.solver.iterations = 100;

  const vol = (4 / 3) * Math.PI * Math.pow(p.ballR, 3);
  const pivots = [];
  const balls = [];
  for (let i = 0; i < p.nBalls; i++) {
    const xi = (i - (p.nBalls - 1) / 2) * 2 * p.ballR;
    const pivot = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Sphere(0.001),
      position: new CANNON.Vec3(xi, 0, 0),
    });
    world.addBody(pivot);
    const mat = p.ballMaterials?.[i] ?? 'steel';
    const m = vol * (p.densities[mat] ?? p.densities.steel);
    const ball = new CANNON.Body({
      mass: m,
      shape: new CANNON.Sphere(p.ballR),
      position: new CANNON.Vec3(xi, -p.L, 0),
      linearDamping: p.airDrag,
      angularDamping: p.airDrag,
    });
    world.addBody(ball);
    // Hinge: pivot at (xi,0,0), ball hung below it, axis = z (out of plane).
    world.addConstraint(new CANNON.HingeConstraint(pivot, ball, {
      pivotA: new CANNON.Vec3(0, 0, 0),
      pivotB: new CANNON.Vec3(0, p.L, 0),
      axisA: new CANNON.Vec3(0, 0, 1),
      axisB: new CANNON.Vec3(0, 0, 1),
      collideConnected: false,
    }));
    pivots.push(pivot);
    balls.push(ball);
  }
  return { world, pivots, balls };
}

function _totalEnergy(balls, g) {
  let ke = 0, pe = 0;
  for (const b of balls) {
    ke += 0.5 * b.mass * b.velocity.lengthSquared()
        + 0.5 * b.inertia.x * b.angularVelocity.lengthSquared();
    pe += b.mass * g * b.position.y;
  }
  return { ke, pe, e: ke + pe };
}

export class Mechanism {
  /**
   * @param {CANNON.World|null} world - external physics world (null = headless)
   * @param {THREE.Group|null} scene - render scene (null = headless)
   * @param {Object} spec - parameter source (defaults to imported SPEC)
   */
  constructor(world = null, scene = null, spec = null) {
    this.world = world;
    this.scene = scene;
    this.spec = spec || SPEC;
  }

  resolveParams() {
    return _normalizeSpec(this.spec);
  }

  /**
   * Headless verification probe (§3.1).
   * @param {Object} options - { stepCount:120, dt:1/60, perturb:null,
   *   pullAngleDeg, ballMaterials }
   *   perturb: multipliers, e.g. { pendulumLength: 1.1 } stretches the string
   *   +10% (G4 anti-fake: probe outputs must drift, never return constants).
   * @returns {Object} feature pack
   */
  probe(options = {}) {
    const stepCount = options.stepCount ?? 120;
    const dt = options.dt ?? (1 / 60);
    const perturb = options.perturb ?? null;

    const p = this.resolveParams();
    if (options.pullAngleDeg != null) p.pullAngleDeg = options.pullAngleDeg;
    if (options.ballMaterials) p.ballMaterials = options.ballMaterials;
    if (perturb) {
      if (perturb.pendulumLength) p.L *= perturb.pendulumLength;
      if (perturb.ballRadius) p.ballR *= perturb.ballRadius;
      if (perturb.restitution) p.restitution *= perturb.restitution;
      if (perturb.pullAngleDeg) p.pullAngleDeg *= perturb.pullAngleDeg;
    }

    // ---- Rest-state settle check (§3.1 restStateSettled): perfect rest ----
    // configuration, no pull; a well-posed cradle must stay at rest with no
    // NaN and no runaway velocity over a short window.
    const settle = _buildCradle(p);
    for (let i = 0; i < 10; i++) settle.world.step(dt);
    let restOk = true;
    for (const b of settle.balls) {
      if (!isFinite(b.velocity.length()) || b.velocity.length() > 0.05) restOk = false;
    }

    // ---- Main scenario: pull end ball, release, step fixed dt ----
    const { world, pivots, balls } = _buildCradle(p);
    const pullRad = p.pullAngleDeg * Math.PI / 180;
    const b0 = balls[0];
    b0.position.set(
      pivots[0].position.x - p.L * Math.sin(pullRad),
      -p.L * Math.cos(pullRad),
      0,
    );
    // Orient ball so the hinge anchor lands exactly on the pivot (zero
    // initial constraint violation).
    b0.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), -pullRad);
    b0.velocity.setZero();
    b0.angularVelocity.setZero();

    const contacts = [];
    world.addEventListener('beginContact', (ev) => {
      const ba = ev.bodyA, bb = ev.bodyB;
      const ia = balls.indexOf(ba), ib = balls.indexOf(bb);
      if (ia < 0 || ib < 0) return;
      const dist = ba.position.distanceTo(bb.position);
      const penetration = Math.max(0, 2 * p.ballR - dist);
      contacts.push({ actor: `Ball_${ia}`, prop: `Ball_${ib}`, penetrationDepth: penetration });
    });

    const E0 = _totalEnergy(balls, p.g);
    const x0 = balls.map((b) => b.position.x);
    let maxSlack = 0;
    let maxDisp = 0;
    let farVxPeak = 0;
    let exploded = false;
    const SUBSTEPS = 2; // half-dt substeps keep hinge constraint slack <1%

    for (let s = 0; s < stepCount; s++) {
      for (let k = 0; k < SUBSTEPS; k++) world.step(dt / SUBSTEPS);
      for (let i = 0; i < p.nBalls; i++) {
        const d = pivots[i].position.distanceTo(balls[i].position);
        maxSlack = Math.max(maxSlack, (Math.abs(d - p.L) / p.L) * 100);
        maxDisp = Math.max(maxDisp, Math.abs(balls[i].position.x - x0[i]));
        if (!isFinite(balls[i].position.x) || Math.abs(balls[i].position.x) > 1e3) exploded = true;
      }
      const far = balls[p.nBalls - 1];
      if (far.velocity.x > farVxPeak) farVxPeak = far.velocity.x;
    }

    const E = _totalEnergy(balls, p.g);
    let px = 0, py = 0, pz = 0;
    for (const b of balls) {
      px += b.mass * b.velocity.x;
      py += b.mass * b.velocity.y;
      pz += b.mass * b.velocity.z;
    }

    return {
      // 1. conservation features
      kineticEnergy: E.ke,                    // J, final-step kinetic energy
      potentialEnergy: E.pe,                 // J, final-step potential energy (ref y=0)
      totalEnergyDrift: ((E.e - E0.e) / Math.abs(E0.e)) * 100, // %
      momentumVector: [px, py, pz],           // kg·m/s, final net momentum
      // 2. mechanism-specific features
      primaryVelocity: farVxPeak,            // m/s, far-end ball peak outward exit speed
      restStateSettled: restOk && !exploded,  // no NaN / numerical explosion
      maxDisplacement: maxDisp,               // m, max horizontal excursion of any ball
      // 3. constraints & contacts
      constraintSlack: maxSlack,              // %, max |string|-deviation of hinge
      propCollisions: contacts,               // [{actor, prop, penetrationDepth}]
    };
  }
}
