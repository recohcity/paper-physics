import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWoodFrameTexture } from './textures.js';

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
  constructor(scene, onReady = null) {
    this.scene = scene;
    this.onReady = onReady;

    this.group = new THREE.Group();
    this.group.position.set(0.12, 0, 0);
    this.group.visible = false;
    this.group.scale.z = 0.0001;
    scene.add(this.group);

    this.modelBuilt = false;
    this.materialsAssigned = false;
    this.interactiveReady = false;

    this.entries = [];
    this.roster = { steel: [], metal: [], wood: [], rope: [], led: [] };
    this.balls = [];
    this.physicsRunning = false;
    this._woodTex = createWoodFrameTexture();

    this._loadGlb();
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
        real = { color: new THREE.Color(0xc8ccd2), metalness: 0.95, roughness: 0.12, emissive: new THREE.Color(0), emissiveIntensity: 0, map: null };
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
    });
  }

  // t=0 white clay -> t=1 real materials.
  setMaterialMorph(t) {
    for (const e of this.entries) {
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
    this.L = 0.343;
    this.g = 9.81;
    this.ballR = 0.0247;
    this.nBalls = 5;
    this.airDrag = 0.01;
    this.restitution = 0.97;
    this.theta = new Array(this.nBalls).fill(0);
    this.omega = new Array(this.nBalls).fill(0);
    this.dragIndex = -1;
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
    this.physicsRunning = false;
    this.interactiveReady = true;
    // Dynamic V-ropes: two lines per ball from Hook±1 to ball.
    this.ropeLines = [];
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
    this._applyKinematics(1 / 60);
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

  beginDrag(i) { this.dragIndex = i; this.omega[i] = 0; }
  endDrag() { this.dragIndex = -1; this.physicsRunning = true; }

  moveDragToX(worldX, worldY) {
    if (this.dragIndex < 0) return;
    const local = new THREE.Vector3(worldX, worldY, 0);
    this.group.worldToLocal(local);
    const p = this.pivots[this.dragIndex];
    const dy = p.y - local.y;
    const dx = local.x - p.x;
    const th = Math.atan2(dx, Math.max(0.02, dy));
    this.theta[this.dragIndex] = Math.max(-1.2, Math.min(1.2, th));
    this.omega[this.dragIndex] = 0;
    // Push adjacent balls if touching.
    for (let d = this.dragIndex - 1; d >= 0; d--) {
      const a = this.ballCenter(d + 1), b = this.ballCenter(d);
      if (a.x - b.x < 2 * this.ballR + 1e-4) this.theta[d] = this.theta[d + 1]; else break;
    }
    for (let d = this.dragIndex + 1; d < this.nBalls; d++) {
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
        if (i === this.dragIndex) continue;
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
              this.omega[i] = (vj + e * vj - e * vi + vi) / (2 * this.L);
              this.omega[i + 1] = (vi + e * vi - e * vj + vj) / (2 * this.L);
            }
          }
          const overlap = minSep - dx;
          if (i === this.dragIndex) {
            this.theta[i] -= overlap / this.L;
          } else if (i + 1 === this.dragIndex) {
            this.theta[i + 1] += overlap / this.L;
          } else {
            this.theta[i] -= overlap / this.L * 0.5;
            this.theta[i + 1] += overlap / this.L * 0.5;
          }
        }
      }
    }
    // Rotate pivot groups.
    for (let i = 0; i < this.nBalls; i++) {
      this.pivotGroups[i].rotation.z = this.theta[i];
    }
  }

  setParam() {}
  readout() { return []; }
  update(dt = 1 / 60) { this._applyKinematics(dt); }
  dispose() {}
}
