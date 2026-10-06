import * as THREE from 'three';

// Shared desk environment: wood table, A4 paper, pencil, eraser.
// 1 scene unit = 1 m. Props are visual design sizes, not physics objects.
export class Environment {
  constructor(scene, woodTableTexture, paperTexture, paperCleanTexture) {
    this.scene = scene;

    // 1. Wooden desk
    const tableGeom = new THREE.PlaneGeometry(10, 8);
    const tableMat = new THREE.MeshStandardMaterial({
      map: woodTableTexture,
      color: 0xd9b98c,
      roughness: 0.55,
      metalness: 0.05,
    });
    this.tableMesh = new THREE.Mesh(tableGeom, tableMat);
    this.tableMesh.rotation.x = -Math.PI / 2;
    this.tableMesh.position.y = -0.005;
    this.tableMesh.receiveShadow = true;
    this.scene.add(this.tableMesh);

    // 2. Paper sheet
    const paperT = 0.006;
    this.paperSketchTexture = paperTexture;
    this.paperCleanTexture = paperCleanTexture || paperTexture;
    this._paperSketchVisible = true;

    this.paperMat = new THREE.MeshStandardMaterial({
      map: this.paperSketchTexture,
      color: 0xfff6e6,
      roughness: 0.9,
    });
    const paperSideMat = new THREE.MeshStandardMaterial({
      color: 0xf0ebe0,
      roughness: 0.9,
    });
    this.paperMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, paperT, 1.85),
      [paperSideMat, paperSideMat, this.paperMat, paperSideMat, paperSideMat, paperSideMat]
    );
    this.paperMesh.position.set(0, paperT / 2, 0);
    this.paperMesh.receiveShadow = true;
    this.paperMesh.castShadow = true;
    this.scene.add(this.paperMesh);

    this.createPencil();
    this.createEraser();
  }

  createPencil() {
    const g = new THREE.Group();
    const pencilR = 0.0355;
    g.position.set(-0.5, 0.006 + pencilR, -0.73);
    g.rotation.y = 0.04;

    const bodyLen = 1.0;
    const bodyGeom = new THREE.CylinderGeometry(pencilR, pencilR, bodyLen, 6);
    bodyGeom.rotateZ(Math.PI / 2);
    const body = new THREE.Mesh(bodyGeom, new THREE.MeshStandardMaterial({
      color: 0xdfa66c, roughness: 0.55, metalness: 0.05,
    }));
    body.castShadow = body.receiveShadow = true;
    g.add(body);

    const woodLen = 0.16, leadR = 0.009;
    const tipWoodGeom = new THREE.CylinderGeometry(leadR, pencilR, woodLen, 16);
    tipWoodGeom.rotateZ(Math.PI / 2);
    const tipWood = new THREE.Mesh(tipWoodGeom, new THREE.MeshStandardMaterial({
      color: 0xf3dfc1, roughness: 0.75,
    }));
    tipWood.position.set(-bodyLen / 2 - woodLen / 2, 0, 0);
    tipWood.castShadow = tipWood.receiveShadow = true;
    g.add(tipWood);

    const leadLen = 0.035;
    const leadGeom = new THREE.ConeGeometry(leadR, leadLen, 16);
    leadGeom.rotateZ(Math.PI / 2);
    const lead = new THREE.Mesh(leadGeom, new THREE.MeshStandardMaterial({
      color: 0x18181c, roughness: 0.3, metalness: 0.25,
    }));
    lead.position.set(-bodyLen / 2 - woodLen - leadLen / 2 + 0.001, 0, 0);
    lead.castShadow = lead.receiveShadow = true;
    g.add(lead);

    const ferrLen = 0.10;
    const ferrGeom = new THREE.CylinderGeometry(pencilR * 1.025, pencilR * 1.025, ferrLen, 24);
    ferrGeom.rotateZ(Math.PI / 2);
    const ferr = new THREE.Mesh(ferrGeom, new THREE.MeshStandardMaterial({
      color: 0xd8d3c7, metalness: 0.85, roughness: 0.25,
    }));
    ferr.position.set(bodyLen / 2 + ferrLen / 2, 0, 0);
    ferr.castShadow = ferr.receiveShadow = true;
    g.add(ferr);

    const eraserLen = 0.09;
    const eraserR = pencilR * 0.98;
    const profile = [
      new THREE.Vector2(0, -eraserLen / 2),
      new THREE.Vector2(eraserR, -eraserLen / 2),
      new THREE.Vector2(eraserR, eraserLen / 2 - 0.02),
      new THREE.Vector2(eraserR - 0.008, eraserLen / 2 - 0.008),
      new THREE.Vector2(0, eraserLen / 2 + 0.005),
    ];
    const eraserGeom = new THREE.LatheGeometry(profile, 32);
    eraserGeom.rotateZ(-Math.PI / 2);
    const eraser = new THREE.Mesh(eraserGeom, new THREE.MeshStandardMaterial({
      color: 0xeb6b6b, roughness: 0.9,
    }));
    eraser.position.set(bodyLen / 2 + ferrLen + eraserLen / 2, 0, 0);
    eraser.castShadow = eraser.receiveShadow = true;
    g.add(eraser);

    this.scene.add(g);
    this.pencilGroup = g;
  }

  createEraser() {
    const g = new THREE.Group();
    g.position.set(1.15, 0.006 + 0.0545, -0.75);
    g.rotation.y = 0.3;

    const whiteBlock = new THREE.Mesh(
      new THREE.BoxGeometry(0.50, 0.109, 0.20),
      new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.88 })
    );
    whiteBlock.castShadow = whiteBlock.receiveShadow = true;
    g.add(whiteBlock);

    const sleeve = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.113, 0.204),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45 })
    );
    sleeve.position.set(0.06, 0, 0);
    sleeve.castShadow = sleeve.receiveShadow = true;
    g.add(sleeve);

    this.scene.add(g);
    this.eraserGroup = g;
  }

  showPaperSketch() {
    this._paperSketchVisible = true;
    this.paperMat.map = this.paperSketchTexture;
    this.paperMat.needsUpdate = true;
    if (this.pencilGroup) this.pencilGroup.visible = true;
    if (this.eraserGroup) this.eraserGroup.visible = true;
  }

  hidePaperSketch() {
    this._paperSketchVisible = false;
    this.paperMat.map = this.paperCleanTexture;
    this.paperMat.needsUpdate = true;
    if (this.pencilGroup) this.pencilGroup.visible = false;
    if (this.eraserGroup) this.eraserGroup.visible = false;
  }
}
