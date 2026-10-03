import * as THREE from 'three';

// Generic desk environment: wooden table, A4 sheet (the user's sketch as texture),
// a pencil and an eraser lying on the paper. This is shared by every sketch2sim project.
// KEY INVARIANT: pencil/eraser visibility is BOUND to paper sketch visibility.
// showPaperSketch() -> both visible; hidePaperSketch() -> both hidden.
export class Environment {
  constructor(scene, sketchTexture, paperCleanTexture = null, skin = {}) {
    this.scene = scene;
    const s = {
      tableColor: 0x6b4f35,
      paperTint: 0xf0ebe0,
      eraserColor: 0x4a6fa5,
      ...skin,
    };

    // wooden table
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 8),
      new THREE.MeshStandardMaterial({ color: s.tableColor, roughness: 0.6 })
    );
    table.rotation.x = -Math.PI / 2;
    table.receiveShadow = true;
    scene.add(table);

    // A4 paper, thin box
    const t = 0.006;
    const paperSide = new THREE.MeshStandardMaterial({ color: s.paperTint, roughness: 0.9 });
    this.paperMat = new THREE.MeshStandardMaterial({
      map: sketchTexture || null, color: 0xffffff, roughness: 0.9,
    });
    this.paper = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, t, 1.85),
      [paperSide, paperSide, this.paperMat, paperSide, paperSide, paperSide]
    );
    this.paper.position.set(0, t / 2, 0);
    this.paper.receiveShadow = true;
    scene.add(this.paper);

    this.paperSketchTexture = sketchTexture;
    this.paperCleanTexture = paperCleanTexture || sketchTexture;

    // pencil (group so it can be toggled)
    this.pencilGroup = new THREE.Group();
    const pencil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.18, 8),
      new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.5 })
    );
    pencil.rotation.z = Math.PI / 2;
    this.pencilGroup.add(pencil);
    this.pencilGroup.position.set(-0.9, t + 0.005, 0.6);
    scene.add(this.pencilGroup);

    // eraser
    this.eraserGroup = new THREE.Group();
    const eraser = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.02, 0.03),
      new THREE.MeshStandardMaterial({ color: s.eraserColor, roughness: 0.7 })
    );
    this.eraserGroup.add(eraser);
    this.eraserGroup.position.set(0.9, t + 0.01, 0.6);
    scene.add(this.eraserGroup);
  }

  showPaperSketch() {
    this.paperMat.map = this.paperSketchTexture;
    this.paperMat.needsUpdate = true;
    if (this.pencilGroup) this.pencilGroup.visible = true;
    if (this.eraserGroup) this.eraserGroup.visible = true;
  }

  hidePaperSketch() {
    this.paperMat.map = this.paperCleanTexture;
    this.paperMat.needsUpdate = true;
    if (this.pencilGroup) this.pencilGroup.visible = false;
    if (this.eraserGroup) this.eraserGroup.visible = false;
  }
}
