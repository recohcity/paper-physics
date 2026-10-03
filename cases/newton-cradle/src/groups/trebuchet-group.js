import * as THREE from 'three';

// 投石机模型组（当前隐藏，仅保留接口）
export class TrebuchetGroup {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
  }
  setVisible(v) { this.group.visible = v; }
  setMorphFactor(f) { /* noop */ }
}
