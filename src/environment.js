import * as THREE from 'three';

export class Environment {
  constructor(scene, woodTableTexture, paperTexture, paperCleanTexture) {
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
    this.paperSketchTexture = paperTexture;
    this.paperCleanTexture = paperCleanTexture || paperTexture;
    this._paperSketchVisible = true;

    this.paperMat = new THREE.MeshStandardMaterial({
      map: this.paperSketchTexture,
      roughness: 0.9,
      metalness: 0.0,
    });
    const paperSideMat = new THREE.MeshStandardMaterial({
      color: 0xf0ebe0,
      roughness: 0.9,
    });
    this.paperMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, paperT, 1.85),
      [paperSideMat, paperSideMat, this.paperMat, paperSideMat, paperSideMat, paperSideMat]
    );
    this.paperMesh.position.set(0.12, paperT / 2, 0);
    this.paperMesh.receiveShadow = true;
    this.paperMesh.castShadow = true;
    this.scene.add(this.paperMesh);


    // 3. Wooden Pencil lying on paper (matching screenshot 1)
    this.createPencil();

    // 4. Blue & White Eraser lying on paper (matching screenshot 1 & 2)
    this.createEraser();
  }

  createPencil() {
    const pencilGroup = new THREE.Group();
    // A4 scale: 2.7 units = 297mm -> 1mm ≈ 0.00909 units.
    // Standard sharpened pencil with eraser: length ≤ 190mm (~180mm -> 1.63 units), diameter 7.8mm (~0.071 units, radius 0.0355).
    const pencilR = 0.0355; // 7.8mm diameter / 2
    const paperY = 0.006;
    pencilGroup.position.set(-0.05, paperY + pencilR, -0.73);
    pencilGroup.rotation.y = 0.04;

    // 1. Hexagonal wooden body (warm cedar lacquer)
    const bodyLength = 1.25; // ~138mm
    const bodyGeom = new THREE.CylinderGeometry(pencilR, pencilR, bodyLength, 6);
    bodyGeom.rotateZ(Math.PI / 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xdfa66c,
      roughness: 0.55,
      metalness: 0.05,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    pencilGroup.add(body);

    // 2. Sharpened exposed wood cone (natural basswood/cedar inner grain)
    const coneLength = 0.18; // ~20mm
    const tipWoodGeom = new THREE.ConeGeometry(pencilR, coneLength, 16);
    tipWoodGeom.rotateZ(-Math.PI / 2); // points left (-X)
    const tipWoodMat = new THREE.MeshStandardMaterial({
      color: 0xf3dfc1,
      roughness: 0.75,
    });
    const tipWood = new THREE.Mesh(tipWoodGeom, tipWoodMat);
    tipWood.position.set(-bodyLength / 2 - coneLength / 2, 0, 0);
    tipWood.castShadow = true;
    tipWood.receiveShadow = true;
    pencilGroup.add(tipWood);

    // 3. Graphite lead core tip
    const leadLength = 0.035; // ~3.8mm
    const leadR = 0.0095; // ~2.1mm diameter / 2
    const leadGeom = new THREE.ConeGeometry(leadR, leadLength, 12);
    leadGeom.rotateZ(-Math.PI / 2); // points left (-X)
    const leadMat = new THREE.MeshStandardMaterial({
      color: 0x1f1f22,
      roughness: 0.25,
      metalness: 0.2,
    });
    const lead = new THREE.Mesh(leadGeom, leadMat);
    lead.position.set(-bodyLength / 2 - coneLength + leadLength / 2 - 0.002, 0, 0);
    lead.castShadow = true;
    pencilGroup.add(lead);

    // 4. Aluminum ferrule (brass / silver metal band with crimp rings)
    const ferruleLength = 0.10; // ~11mm
    const ferruleR = pencilR * 1.025;
    const ferruleGeom = new THREE.CylinderGeometry(ferruleR, ferruleR, ferruleLength, 24);
    ferruleGeom.rotateZ(Math.PI / 2);
    const ferruleMat = new THREE.MeshStandardMaterial({
      color: 0xd8d3c7,
      metalness: 0.85,
      roughness: 0.25,
    });
    const ferrule = new THREE.Mesh(ferruleGeom, ferruleMat);
    ferrule.position.set(bodyLength / 2 + ferruleLength / 2, 0, 0);
    ferrule.castShadow = true;
    ferrule.receiveShadow = true;
    pencilGroup.add(ferrule);

    // 5. Pink rubber eraser top
    const eraserLength = 0.09; // ~10mm
    const eraserR = pencilR * 0.98;
    const eraserGeom = new THREE.CylinderGeometry(eraserR, eraserR, eraserLength, 20);
    eraserGeom.rotateZ(Math.PI / 2);
    const eraserMat = new THREE.MeshStandardMaterial({
      color: 0xeb6b6b,
      roughness: 0.9,
    });
    const eraser = new THREE.Mesh(eraserGeom, eraserMat);
    eraser.position.set(bodyLength / 2 + ferruleLength + eraserLength / 2, 0, 0);
    eraser.castShadow = true;
    eraser.receiveShadow = true;
    pencilGroup.add(eraser);

    this.scene.add(pencilGroup);
  }

  createEraser() {
    // Standard rectangular block eraser:
    // 5.0 ~ 6.0 cm long (~55mm -> 0.50 units)
    // 2.0 ~ 2.5 cm wide (~22mm -> 0.20 units)
    // 1.2 cm thick (~12mm -> 0.109 units)
    const eraserGroup = new THREE.Group();
    const paperY = 0.006;
    const eraserThickness = 0.109;
    eraserGroup.position.set(0.96, paperY + eraserThickness / 2, -0.73);
    eraserGroup.rotation.y = -0.22;

    const eraserLength = 0.50;
    const eraserWidth = 0.20;

    // White rubber block
    const whiteGeom = new THREE.BoxGeometry(eraserLength, eraserThickness, eraserWidth);
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5,
      roughness: 0.88,
    });
    const whiteBlock = new THREE.Mesh(whiteGeom, whiteMat);
    whiteBlock.castShadow = true;
    whiteBlock.receiveShadow = true;
    eraserGroup.add(whiteBlock);

    // Blue cardboard protective sleeve wrapped around the middle/back
    const sleeveLength = 0.32;
    const sleeveGeom = new THREE.BoxGeometry(sleeveLength, eraserThickness + 0.004, eraserWidth + 0.004);
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // vivid classic blue sleeve
      roughness: 0.45,
    });
    const sleeve = new THREE.Mesh(sleeveGeom, sleeveMat);
    sleeve.position.set(0.06, 0, 0);
    sleeve.castShadow = true;
    sleeve.receiveShadow = true;
    eraserGroup.add(sleeve);

    this.scene.add(eraserGroup);
  }

  hidePaperSketch() {
    this._paperSketchVisible = false;
    this.paperMat.map = this.paperCleanTexture;
    this.paperMat.needsUpdate = true;
  }

  showPaperSketch() {
    this._paperSketchVisible = true;
    this.paperMat.map = this.paperSketchTexture;
    this.paperMat.needsUpdate = true;
  }
}
