import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 牛顿摆模型组：顶梁、挡板、LED、L形挂片、球、绳、挂钩
export class CradleGroup {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this._envMap = null;
    this._loaded = false;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync('cradle.glb');
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        console.log('mesh:', o.name, 'mat:', o.material?.name, 'metalness:', o.material?.metalness);
      }
    });
    this.group.add(gltf.scene);
    this._loaded = true;
    console.log('cradle loaded, meshes:', this.group.children.length);
    this._applyEnv();
  }

  async setEnvMap() {
    const exr = await new EXRLoader().loadAsync('env.exr');
    exr.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(this.renderer);
    this._envMap = pm.fromEquirectangular(exr).texture;
    exr.dispose();
    pm.dispose();
    this._applyEnv();
  }

  _applyEnv() {
    if (!this._envMap) return;
    this.group.traverse((o) => {
      if (o.isMesh && o.material) {
        o.material.envMap = this._envMap;
        o.material.envMapIntensity = 1.0;
        o.material.needsUpdate = true;
      }
    });
  }

  setVisible(v) { this.group.visible = v; }
  setScale(x, y, z) { this.group.scale.set(x, y, z); }
  setPosition(x, y, z) { this.group.position.set(x, y, z); }
}
