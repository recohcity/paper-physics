import * as THREE from 'three';

export class Environment {
  constructor(scene, woodTableTexture, paperTexture) {
    this.scene = scene;

    // 1. Wooden Desk Table Top
    const tableGeom = new THREE.PlaneGeometry(10, 8);
    const tableMat = new THREE.MeshStandardMaterial({
      map: woodTableTexture,
      roughness: 0.55,
      metalness: 0.05,
    });
    this.tableMesh = new THREE.Mesh(tableGeom, tableMat);
    this.tableMesh.rotation.x = -Math.PI / 2;
    this.tableMesh.position.y = -0.005;
    this.tableMesh.receiveShadow = true;
    this.scene.add(this.tableMesh);

    // 2. White Paper Sheet — thin box with visible edge, casts real shadow
    const paperT = 0.006;
    this.paperMat = new THREE.MeshStandardMaterial({
      map: paperTexture, roughness: 0.9, metalness: 0.0,
    });
    const paperSideMat = new THREE.MeshStandardMaterial({
      color: 0xf0ebe0, roughness: 0.9,
    });
    this.paperMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, paperT, 1.85),
      [paperSideMat, paperSideMat, this.paperMat, paperSideMat, paperSideMat, paperSideMat]
    );
    this.paperMesh.position.set(0.12, paperT / 2, 0);
    this.paperMesh.receiveShadow = true;
    this.paperMesh.castShadow = true;
    this.scene.add(this.paperMesh);

    // Plain white paper (for after sketch is "built up")
    this.plainPaperMat = new THREE.MeshStandardMaterial({
      color: 0xfaf8f3, roughness: 0.9, metalness: 0.0,
    });
    this._paperSketchVisible = true;


    // 3. Wooden Pencil lying on paper (matching screenshot 1)
    this.createPencil();

    // 4. Blue & White Eraser lying on paper (matching screenshot 1 & 2)
    this.createEraser();
  }

  createPencil() {
    const pencilGroup = new THREE.Group();
    pencilGroup.position.set(0.05, 0.015, -0.62);
    pencilGroup.rotation.y = 0.08;

    // Hexagonal pencil body (wood / yellow-cedar)
    const bodyGeom = new THREE.CylinderGeometry(0.011, 0.011, 0.42, 6);
    bodyGeom.rotateZ(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdfa66c, // warm cedar wood pencil
      roughness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    pencilGroup.add(body);

    // Sharpened cone tip (exposed wood) — apex points left, base meets body
    const tipWoodGeom = new THREE.ConeGeometry(0.011, 0.045, 6);
    tipWoodGeom.rotateZ(Math.PI / 2);
    const tipWoodMat = new THREE.MeshStandardMaterial({
      color: 0xf5deb3,
      roughness: 0.7,
    });
    const tipWood = new THREE.Mesh(tipWoodGeom, tipWoodMat);
    tipWood.position.set(-0.232, 0, 0);
    tipWood.castShadow = true;
    pencilGroup.add(tipWood);

    // Graphite lead tip — base embedded inside the wood cone, nib protrudes past the wood point
    const leadGeom = new THREE.ConeGeometry(0.0035, 0.02, 8);
    leadGeom.rotateZ(Math.PI / 2);
    const leadMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.3,
    });
    const lead = new THREE.Mesh(leadGeom, leadMat);
    lead.position.set(-0.248, 0, 0);
    lead.castShadow = true;
    pencilGroup.add(lead);

    // Metal ferrule (silver / brass)
    const ferruleGeom = new THREE.CylinderGeometry(0.0115, 0.0115, 0.03, 16);
    ferruleGeom.rotateZ(Math.PI / 2);
    const ferruleMat = new THREE.MeshStandardMaterial({
      color: 0xc8c2b5,
      metalness: 0.8,
      roughness: 0.3,
    });
    const ferrule = new THREE.Mesh(ferruleGeom, ferruleMat);
    ferrule.position.set(0.225, 0, 0);
    ferrule.castShadow = true;
    pencilGroup.add(ferrule);

    // Pink rubber eraser
    const eraserGeom = new THREE.CylinderGeometry(0.0105, 0.0105, 0.035, 16);
    eraserGeom.rotateZ(Math.PI / 2);
    const eraserMat = new THREE.MeshStandardMaterial({
      color: 0xec7272,
      roughness: 0.9,
    });
    const eraser = new THREE.Mesh(eraserGeom, eraserMat);
    eraser.position.set(0.255, 0, 0);
    eraser.castShadow = true;
    pencilGroup.add(eraser);

    this.scene.add(pencilGroup);
  }

  createEraser() {
    // Classic Blue & White block eraser
    const eraserGroup = new THREE.Group();
    eraserGroup.position.set(0.55, 0.020, -0.68);
    eraserGroup.rotation.y = -0.35;

    // White rubber block
    const whiteGeom = new THREE.BoxGeometry(0.09, 0.032, 0.045);
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      roughness: 0.85,
    });
    const whiteBlock = new THREE.Mesh(whiteGeom, whiteMat);
    whiteBlock.castShadow = true;
    whiteBlock.receiveShadow = true;
    eraserGroup.add(whiteBlock);

    // Blue cardboard sleeve wrapped around the middle/back
    const sleeveGeom = new THREE.BoxGeometry(0.055, 0.034, 0.047);
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // vivid blue sleeve
      roughness: 0.5,
    });
    const sleeve = new THREE.Mesh(sleeveGeom, sleeveMat);
    sleeve.position.set(0.02, 0, 0);
    sleeve.castShadow = true;
    eraserGroup.add(sleeve);

    this.scene.add(eraserGroup);
  }

  hidePaperSketch() {
    if (!this._paperSketchVisible) return;
    this._paperSketchVisible = false;
    this.paperMesh.material[2] = this.plainPaperMat;
  }

  showPaperSketch() {
    if (this._paperSketchVisible) return;
    this._paperSketchVisible = true;
    this.paperMesh.material[2] = this.paperMat;
  }
}
