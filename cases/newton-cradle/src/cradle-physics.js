import * as THREE from 'three';

// Newton's cradle: analytic pendulum chain (pitfall #24).
// Each ball hangs from a fixed pivot; theta_i is swing angle.
// Equal-mass elastic collision between adjacent balls swaps angular velocities.

export class CradlePhysics {
  constructor(scene) {
    this.scene = scene;
    this.balls = [];       // THREE.Mesh
    this.thetas = [];      // swing angle per ball (rad)
    this.omegas = [];      // angular velocity per ball
    this.pivots = [];      // world pivot positions (THREE.Vector3)
    this.L = 0.18;         // pendulum length (m)
    this.g = 9.82;
    this.r = 0.025;        // ball radius
    this.dragging = -1;    // which ball index is dragged
    this.enabled = false;
  }

  attach(balls) {
    this.balls = balls;
    this.thetas = balls.map(() => 0);
    this.omegas = balls.map(() => 0);
    // pivot = ball rest position + (0, L, 0)
    this.pivots = balls.map((b) => {
      const p = new THREE.Vector3();
      b.getWorldPosition(p);
      return new THREE.Vector3(p.x, p.y + this.L, p.z);
    });
    // find ropes: 2 per ball (left/right z), named Rope_i_pm in glb
    this.ropes = balls.map(() => []);
    this.ballGroup = balls[0].parent;
    if (this.ballGroup) {
      this.ballGroup.traverse((o) => {
        if (/^Rope_(\d+)_([+-]1)$/.test(o.name)) {
          const m = o.name.match(/^Rope_(\d+)_([+-]1)$/);
          const i = parseInt(m[1], 10);
          if (this.ropes[i]) this.ropes[i].push(o);
        }
      });
    }
  }

  setEnabled(v) {
    this.enabled = v;
  }

  // Drag: given pointer NDC, find which ball is under cursor and set its angle.
  // groupSize = how many consecutive balls from the left are dragged together.
  pickAndDrag(pointerNDC, camera, groupSize) {
    if (!this.balls.length) return -1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointerNDC, camera);
    const hits = ray.intersectObjects(this.balls, false);
    if (!hits.length) return -1;
    const hitBall = hits[0].object;
    const idx = this.balls.indexOf(hitBall);
    if (idx < 0) return -1;
    this.dragging = idx;
    // groupSize: drag balls 0..idx together (left-aligned) or idx..4 (right-aligned)?
    // User rule: click ball k -> control balls 0..k (k+1 balls from left).
    this.dragGroup = [];
    if (groupSize >= 1) {
      for (let i = 0; i <= idx; i++) this.dragGroup.push(i);
    }
    return idx;
  }

  dragMove(pointerNDC, camera) {
    if (this.dragging < 0 || !this.dragGroup) return;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointerNDC, camera);
    // intersect with y = pivot plane (approx): find point on ball's swing plane
    // Just compute angle from pivot to pointer's x, at ball height.
    const ndc = pointerNDC;
    // Unproject to a point at ball's z plane
    const vec = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
    const dir = vec.sub(camera.position).normalize();
    const dist = (this.pivots[this.dragging].z - camera.position.z) / dir.z;
    const px = camera.position.x + dir.x * dist;
    const py = camera.position.y + dir.y * dist;
    const pivot = this.pivots[this.dragging];
    const dx = px - pivot.x;
    const dy = py - pivot.y;
    let theta = Math.atan2(dx, -dy);
    // clamp
    theta = Math.max(-0.9, Math.min(0.9, theta));
    for (const i of this.dragGroup) {
      this.thetas[i] = theta;
      this.omegas[i] = 0;
    }
    this._applyPositions();
  }

  release() {
    this.dragging = -1;
    this.dragGroup = null;
  }

  step(dt) {
    if (!this.enabled) return;
    // Integrate each pendulum (RK-ish, semi-implicit Euler)
    const sub = 4;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.balls.length; i++) {
        if (i === this.dragging) continue;
        const a = -(this.g / this.L) * Math.sin(this.thetas[i]);
        this.omegas[i] += a * h;
        this.omegas[i] *= 0.999; // tiny damping
        this.thetas[i] += this.omegas[i] * h;
      }
      // Collisions: adjacent balls
      for (let i = 0; i < this.balls.length - 1; i++) {
        if (this._touching(i, i + 1)) {
          // equal mass elastic: swap angular velocities if approaching
          const v1 = this.omegas[i];
          const v2 = this.omegas[i + 1];
          // approach: ball i moving right (omega>0) and ball i+1 moving left (omega<0)?
          // theta positive = ball swings right.
          if ((v1 > 0 && v2 < 0) || (v1 < 0 && v2 > 0)) {
            this.omegas[i] = v2;
            this.omegas[i + 1] = v1;
          }
        }
      }
    }
    this._applyPositions();
  }

  _touching(i, j) {
    const pi = this._ballPos(i);
    const pj = this._ballPos(j);
    return pi.distanceTo(pj) <= 2 * this.r * 1.01;
  }

  _ballPos(i) {
    const p = this.pivots[i];
    return new THREE.Vector3(
      p.x + this.L * Math.sin(this.thetas[i]),
      p.y - this.L * Math.cos(this.thetas[i]),
      p.z
    );
  }

  _applyPositions() {
    for (let i = 0; i < this.balls.length; i++) {
      const pos = this._ballPos(i);
      this.balls[i].position.copy(pos);
      // update ropes: each rope goes from pivot top to ball anchor (offset by z)
      const ropes = this.ropes[i] || [];
      for (const rope of ropes) {
        // determine side from name
        const side = rope.name.endsWith('_1') ? 1 : -1;
        // top anchor: fixed at pivot x, topY, side*0.04
        const top = new THREE.Vector3(this.pivots[i].x, this.pivots[i].y, side * 0.04);
        // bottom anchor: ball center + side*0.015 in z
        const bottom = new THREE.Vector3(pos.x, pos.y, side * 0.015);
        // rope is a cylinder; position = midpoint, lookAt direction
        const mid = top.clone().add(bottom).multiplyScalar(0.5);
        rope.position.copy(mid);
        const dir = bottom.clone().sub(top);
        const len = dir.length();
        rope.scale.set(1, len, 1); // cylinder height assumed 1 in local? may need fix
        // orient cylinder along dir (cylinder default is along Y)
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      }
    }
  }

  reset() {
    this.thetas = this.balls.map(() => 0);
    this.omegas = this.balls.map(() => 0);
    this._applyPositions();
  }

  // Auto-play: lift leftmost ball and release
  autoPlay() {
    this.reset();
    this.thetas[0] = 0.6;
    this.omegas[0] = 0;
  }
}
