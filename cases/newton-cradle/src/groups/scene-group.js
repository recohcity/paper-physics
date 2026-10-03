import * as THREE from 'three';
import { createPaperWithSketchTexture } from '../textures.js';
import { Environment } from '../environment.js';

// 场景组：桌面、A4图纸、铅笔、橡皮
export class SceneGroup {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.paperSketchTexture = createPaperWithSketchTexture(true);
    this.paperCleanTexture = createPaperWithSketchTexture(false);
    this.env = new Environment(scene, null, this.paperSketchTexture, this.paperCleanTexture);
  }
  showSketch() { this.env.showPaperSketch(); }
  hideSketch() { this.env.hidePaperSketch(); }
}
