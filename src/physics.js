import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { sound } from './audio.js';

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    });
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 30;

    // Contact Materials
    const groundMaterial = new CANNON.Material('ground');
    const woodMaterial = new CANNON.Material('wood');
    const metalMaterial = new CANNON.Material('metal');

    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, woodMaterial, {
      friction: 0.7, restitution: 0.12,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(woodMaterial, woodMaterial, {
      friction: 0.65, restitution: 0.15,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(metalMaterial, woodMaterial, {
      friction: 0.45, restitution: 0.50,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, metalMaterial, {
      friction: 0.50, restitution: 0.25,
    }));

    this.materials = { groundMaterial, woodMaterial, metalMaterial };

    this.blocks = [];
    this.blockMeshes = [];
    this.initialBlockPositions = [];
    this.blocksActivated = false;

    this.ballBody = null;
    this.ballMesh = null;
    this.ballReleased = false;

    // Solid Table surface
    const tableBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(5, 0.5, 5)),
      material: groundMaterial,
      position: new CANNON.Vec3(0, -0.5 + 0.006, 0),
    });
    this.world.addBody(tableBody);

    this.onBlockHit = null;
    this.onBallLand = null;
  }

  createBlocks(scene, woodTexture) {
    this.blocks.forEach(b => this.world.removeBody(b));
    this.blockMeshes.forEach(m => scene.remove(m));
    this.blocks = [];
    this.blockMeshes = [];
    this.initialBlockPositions = [];
    this.blocksActivated = false;

    // 10 wooden toy blocks (4-3-2-1 pyramid)
    // Dimensions: Standard cube blocks (0.088 x 0.088 x 0.088)
    const blockSize = 0.088;
    const bw = blockSize;
    const bh = blockSize;
    const bd = blockSize;
    const halfExtents = new CANNON.Vec3(bw / 2, bh / 2, bd / 2);
    const blockGeom = new THREE.BoxGeometry(bw, bh, bd);
    this._blockTexture = woodTexture || null;
    const blockMat = new THREE.MeshStandardMaterial({
      color: 0xf5eedc,
      roughness: 0.65,
      metalness: 0.05,
      map: woodTexture || null,
    });

    const targetCenterX = 0.92;
    const rows = [4, 3, 2, 1];

    let blockIndex = 0;
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      const y = 0.006 + bh / 2 + r * bh;
      const rowStartX = targetCenterX - ((count - 1) * bw) / 2;

      for (let c = 0; c < count; c++) {
        const currentBlockIndex = blockIndex;
        const x = rowStartX + c * bw;
        const z = 0;

        const body = new CANNON.Body({
          type: CANNON.Body.KINEMATIC,
          mass: 0.14,
          material: this.materials.woodMaterial,
          shape: new CANNON.Box(halfExtents),
          position: new CANNON.Vec3(x, y, z),
          linearDamping: 0.12,
          angularDamping: 0.20,
        });

        body.addEventListener('collide', (e) => {
          const relativeVel = e.contact.getImpactVelocityAlongNormal();
          if (Math.abs(relativeVel) > 0.20) {
            sound.playBlockHit(Math.min(1.0, Math.abs(relativeVel) / 2.5));
            // Report whether this was the projectile itself, rather than a
            // secondary block-on-block collision during the collapse.
            if (this.onBlockHit) {
              this.onBlockHit(currentBlockIndex, relativeVel, e.body === this.ballBody);
            }
          }
        });

        this.world.addBody(body);
        this.blocks.push(body);

        const mesh = new THREE.Mesh(blockGeom, blockMat.clone());
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(x, y, z);

        // Pencil edge line around blocks matching hand-drawn craft aesthetic
        const edges = new THREE.EdgesGeometry(blockGeom);
        const edgeLine = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: 0x826442, transparent: true, opacity: 0.60 })
        );
        mesh.add(edgeLine);

        scene.add(mesh);
        this.blockMeshes.push(mesh);
        this.initialBlockPositions.push({ x, y, z });
        blockIndex++;
      }
    }
  }

  activateBlocks() {
    this.blocksActivated = true;
    this._settled = false;
    this._wakeTime = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      if (b.type !== CANNON.Body.DYNAMIC) {
        b.type = CANNON.Body.DYNAMIC;
        b.mass = 0.14;
        b.updateMassProperties();
      }
      b.wakeUp();
    }
  }

  createProjectile(scene) {
    if (this.ballBody) {
      this.world.removeBody(this.ballBody);
    }
    if (this.ballMesh) {
      scene.remove(this.ballMesh);
    }

    const radius = 0.046;
    const ballShape = new CANNON.Sphere(radius);

    this.ballBody = new CANNON.Body({
      type: CANNON.Body.DYNAMIC,
      mass: 0.20,
      material: this.materials.metalMaterial,
      shape: ballShape,
      linearDamping: 0.01,
      angularDamping: 0.05,
    });

    this.world.addBody(this.ballBody);

    // Play thud only when ball is in flight and hits something
    this.ballBody.addEventListener('collide', (e) => {
      if (!this.ballReleased) return;
      const relVel = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (relVel > 0.3) {
        sound.playBlockHit(Math.min(1.0, relVel / 3));
      }
    });

    const geom = new THREE.SphereGeometry(radius, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc8cdd4,
      metalness: 0.9,
      roughness: 0.15,
    });
    this.ballMesh = new THREE.Mesh(geom, mat);
    this.ballMesh.castShadow = true;
    this.ballMesh.receiveShadow = true;
    if (this.envMapTexture) {
      mat.envMap = this.envMapTexture;
      mat.envMapIntensity = 1.0;
    }
    scene.add(this.ballMesh);

    this.ballReleased = false;
    this.ballBody.sleep();
  }

  getDownedBlocksCount() {
    let count = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const initPos = this.initialBlockPositions[i];
      if (!initPos) continue;

      const dx = b.position.x - initPos.x;
      const dy = b.position.y - initPos.y;
      const dz = b.position.z - initPos.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const up = new CANNON.Vec3(0, 1, 0);
      const currentUp = b.quaternion.vmult(up);
      const isUpright = currentUp.y > 0.85;

      if (!isUpright || dist > 0.045 || Math.abs(dy) > 0.030) {
        count++;
      }
    }
    return count;
  }

  step(delta) {
    // Fixed timestep for stable physics (60Hz accumulator)
    const fixedDt = 1/60;
    this._acc = (this._acc || 0) + Math.min(delta, 0.1);
    while (this._acc >= fixedDt) {
      this.world.step(fixedDt);
      this._acc -= fixedDt;
    }

    for (let i = 0; i < this.blocks.length; i++) {
      this.blockMeshes[i].position.copy(this.blocks[i].position);
      this.blockMeshes[i].quaternion.copy(this.blocks[i].quaternion);
    }

    // Auto-sleep blocks once they settle after a collision (with grace period)
    if (this.blocksActivated && !this._settled) {
      if (this._wakeTime === undefined) this._wakeTime = 0;
      this._wakeTime += delta;
      // Wait at least 2 seconds after activation before checking stillness
      if (this._wakeTime > 2.0) {
        let allStill = true;
        for (const b of this.blocks) {
          if (b.type !== CANNON.Body.DYNAMIC) continue;
          const v = Math.abs(b.velocity.x) + Math.abs(b.velocity.y) + Math.abs(b.velocity.z);
          const w = Math.abs(b.angularVelocity.x) + Math.abs(b.angularVelocity.y) + Math.abs(b.angularVelocity.z);
          if (v > 0.02 || w > 0.02) { allStill = false; break; }
        }
        if (allStill) {
          this._settled = true;
          this.settleBlocks();
        }
      }
    }

    if (this.ballReleased && this.ballBody && this.ballMesh) {
      this.ballMesh.position.copy(this.ballBody.position);
      this.ballMesh.quaternion.copy(this.ballBody.quaternion);

      // Trigger dynamic activation when ball approaches the pyramid
      if (!this.blocksActivated && this.ballBody.position.x > 0.70 && this.ballBody.position.x < 1.30) {
        this.activateBlocks();
        this._settled = false;
      }

      if (this.ballBody.position.y <= 0.052 && Math.abs(this.ballBody.velocity.y) < 0.20) {
        if (this.onBallLand) this.onBallLand(this.ballBody.position.x);
      }
    }
  }

  resetBlocks() {
    this.blocksActivated = false;
    this._settled = false;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const init = this.initialBlockPositions[i];
      b.type = CANNON.Body.KINEMATIC;
      b.position.set(init.x, init.y, init.z);
      b.quaternion.set(0, 0, 0, 1);
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      this.blockMeshes[i].position.copy(b.position);
      this.blockMeshes[i].quaternion.copy(b.quaternion);
    }
  }

  // Multi-stage morph: f=0 sketch, 0.33 paper, 0.66 white, 1.0 textured
  setMorphFactor(f) {
    // Blocks
    let blockMat;
    if (f < 0.34) {
      blockMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.85 });
    } else if (f < 0.67) {
      blockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    } else {
      blockMat = new THREE.MeshStandardMaterial({
        color: 0xf5eedc, roughness: 0.65, metalness: 0.05,
        map: this._blockTexture || null,
      });
    }
    for (const m of this.blockMeshes) {
      m.material = blockMat;
    }

    // Ball
    if (this.ballMesh) {
      let ballMat;
      if (f < 0.34) {
        ballMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.85 });
      } else if (f < 0.67) {
        ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      } else {
        ballMat = new THREE.MeshStandardMaterial({
          color: 0xc8cdd4, metalness: 0.9, roughness: 0.15,
        });
        if (this.envMapTexture) {
          ballMat.envMap = this.envMapTexture;
          ballMat.envMapIntensity = 1.0;
        }
      }
      this.ballMesh.material = ballMat;
    }
  }

  // Put blocks to sleep after they settle — make them STATIC so window resizing
  // or idle physics steps cannot cause any jitter or collision response.
  settleBlocks() {
    for (const b of this.blocks) {
      b.type = CANNON.Body.STATIC;
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
    }
  }

  // Wake all blocks before a new shot: restore DYNAMIC so collisions register.
  wakeBlocks() {
    this._settled = false;
    this._wakeTime = 0;
    for (const b of this.blocks) {
      if (b.type !== CANNON.Body.DYNAMIC) {
        b.type = CANNON.Body.DYNAMIC;
        b.mass = 0.14;
        b.updateMassProperties();
      }
      b.wakeUp();
    }
  }
}
