import * as THREE from 'three';

// Analytic pendulum chain (pitfall #24). Each ball i: angle theta_i.
// Equal-mass elastic collision swaps angular velocities.
// Ropes drawn as LineSegments following ball studs.

export class CradlePhysics {
  constructor(scene) {
    this.scene = scene;
    this.balls = [];
    this.theta = [];
    this.omega = [];
    this.pivots = [];
    this.L = 0.18;          // pivot to ball center
    this.g = 9.82;
    this.airDrag = 0.05;
    this.r = 0.025;
    this.dragIndex = -1;
    this.enabled = false;
    this.strings = [];      // LineSegments per ball
  }

  attach(balls) {
    this.balls = balls;
    this.N = balls.length;
    this.theta = new Array(this.N).fill(0);
    this.omega = new Array(this.N).fill(0);
    this.pivots = balls.map((b) => {
      const p = new THREE.Vector3();
      b.getWorldPosition(p);
      return new THREE.Vector3(p.x, p.y + this.L, p.z);
    });
    // hide glb ropes (they're static)
    balls[0].parent.traverse((o) => {
      if (/^Rope_/.test(o.name)) o.visible = false;
    });
    // create LineSegments ropes
    for (let i = 0; i < this.N; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      const str = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x222222 }));
      this.scene.add(str);
      this.strings.push(str);
    }
    this.updateRopes();
  }

  setEnabled(v) { this.enabled = v; }

  ballCenter(i) {
    const p = this.pivots[i];
    return new THREE.Vector3(
      p.x + this.L * Math.sin(this.theta[i]),
      p.y - this.L * Math.cos(this.theta[i]),
      p.z
    );
  }

  pick(raycaster, ndc, camera) {
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(this.balls, false);
    return hits.length ? this.balls.indexOf(hits[0].object) : -1;
  }

  beginDrag(i) {
    this.dragIndex = i;
    this.omega[i] = 0;
  }

  moveDragTo(worldX, worldY) {
    if (this.dragIndex < 0) return;
    const p = this.pivots[this.dragIndex];
    const dy = p.y - worldY;
    const dx = worldX - p.x;
    let th = Math.atan2(dx, Math.max(0.02, dy));
    th = Math.max(-1.2, Math.min(1.2, th));
    this.theta[this.dragIndex] = th;
    this.omega[this.dragIndex] = 0;
    // adjacent touching balls follow
    for (let d = this.dragIndex - 1; d >= 0; d--) {
      const a = this.ballCenter(d + 1), b = this.ballCenter(d);
      if (a.x - b.x < 2 * this.r + 1e-4) this.theta[d] = th; else break;
    }
    for (let d = this.dragIndex + 1; d < this.N; d++) {
      const a = this.ballCenter(d - 1), b = this.ballCenter(d);
      if (b.x - a.x < 2 * this.r + 1e-4) this.theta[d] = th; else break;
    }
    this.updateMeshes();
  }

  endDrag() { this.dragIndex = -1; }

  step(dt) {
    if (!this.enabled) return;
    const sub = 4;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < this.N; i++) {
        if (i === this.dragIndex) continue;
        const acc = -(this.g / this.L) * Math.sin(this.theta[i]) - this.airDrag * this.omega[i];
        this.omega[i] += acc * h;
        this.theta[i] += this.omega[i] * h;
      }
      this.resolveContacts();
    }
    this.updateMeshes();
  }

  resolveContacts() {
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.N - 1; i++) {
        const a = this.ballCenter(i), b = this.ballCenter(i + 1);
        const dx = b.x - a.x;
        if (dx < 2 * this.r) {
          const vi = this.L * this.omega[i];
          const vj = this.L * this.omega[i + 1];
          const closing = vi - vj;
          if (closing > 0) {
            // equal mass, e=0.92: swap velocities
            const e = 0.92;
            const nvi = ((1 - e) * vi + (1 + e) * vj) / 2;
            const nvj = ((1 + e) * vi + (1 - e) * vj) / 2;
            this.omega[i] = nvi / this.L;
            this.omega[i + 1] = nvj / this.L;
          }
          const overlap = 2 * this.r - dx;
          this.theta[i] -= overlap / this.L * 0.5;
          this.theta[i + 1] += overlap / this.L * 0.5;
        }
      }
    }
  }

  reset() {
    this.theta.fill(0);
    this.omega.fill(0);
    this.updateMeshes();
  }

  autoPlay() {
    this.reset();
    this.theta[0] = 0.6;
    this.omega[0] = 0;
  }

  updateMeshes() {
    for (let i = 0; i < this.N; i++) {
      this.balls[i].position.copy(this.ballCenter(i));
    }
    this.updateRopes();
  }

  updateRopes() {
    for (let i = 0; i < this.N; i++) {
      const c = this.ballCenter(i);
      const p = this.pivots[i];
      // V-strings: top anchors at p.x±0.012, z=p.z; ball studs at c.z±0.008
      const topA = new THREE.Vector3(p.x - 0.012, p.y, p.z);
      const topB = new THREE.Vector3(p.x + 0.012, p.y, p.z);
      const studA = new THREE.Vector3(c.x, c.y - this.r, c.z + 0.008);
      const studB = new THREE.Vector3(c.x, c.y - this.r, c.z - 0.008);
      const arr = this.strings[i].geometry.attributes.position.array;
      arr.set([
        topA.x, topA.y, topA.z, studA.x, studA.y, studA.z,
        topB.x, topB.y, topB.z, studB.x, studB.y, studB.z,
      ]);
      this.strings[i].geometry.attributes.position.needsUpdate = true;
    }
  }
}
