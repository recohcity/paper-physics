// 公共外壳资产，权威源为 skill/sketch2sim/template/src/environment.js；本工程为最简样例。
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// SCALE ANCHOR (single source of truth, fixes audit F3):
//   1 scene unit = 1 m.
//   Gravity (9.82 in physics.js), masses (kg), and display units (×1000 -> mm
//   in main.js) are all derived from this anchor.  Desk props below (paper,
//   pencil, eraser) are VISUAL DESIGN sizes on a prop tabletop, deliberately
//   NOT scaled from mm to scene units — they are not physics objects and are
//   not part of any mm-based measurement.
// ---------------------------------------------------------------------------
export class Environment {
  constructor(scene, woodTableTexture, paperTexture, paperCleanTexture) {
    this.scene = scene;

    // 1. Wooden Desk Table Top
    const tableGeom = new THREE.PlaneGeometry(10, 8);
    const tableMat = new THREE.MeshStandardMaterial({
      map: woodTableTexture,
      color: 0xd9b98c, // warm wood tone, kills gray-green cast
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
    // Prop sheet: 2.7 × 1.85 scene units (= 2.7 × 1.85 m at the 1 unit = 1 m
    // anchor).  It is a desk prop of A4 aspect ratio, not a literal A4 sheet.
    const pencilR = 0.0355; // visual prop radius (design value, not mm-derived)
    const paperY = 0.006;
    pencilGroup.position.set(-0.05, paperY + pencilR, -0.73);
    pencilGroup.rotation.y = 0.04;

    // 1. Hexagonal wooden body (warm cedar lacquer)
    const bodyLength = 1.0; // ~110mm (shortened to 80% of the original 1.25)
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

    // 2. Sharpened exposed wood taper (natural basswood inner grain)
    // Real sharpened pencils taper from body radius (pencilR) down to lead radius (leadR)
    const woodLength = 0.16; // ~18mm taper length
    const leadR = 0.009; // graphite core radius (~1.8mm diameter / 2)
    const tipWoodGeom = new THREE.CylinderGeometry(leadR, pencilR, woodLength, 16);
    tipWoodGeom.rotateZ(Math.PI / 2); // left end is leadR (radiusTop), right end is pencilR (radiusBottom)
    const tipWoodMat = new THREE.MeshStandardMaterial({
      color: 0xf3dfc1,
      roughness: 0.75,
    });
    const tipWood = new THREE.Mesh(tipWoodGeom, tipWoodMat);
    // Align right end with bodyLeft (-bodyLength / 2)
    tipWood.position.set(-bodyLength / 2 - woodLength / 2, 0, 0);
    tipWood.castShadow = true;
    tipWood.receiveShadow = true;
    pencilGroup.add(tipWood);

    // 3. Graphite lead core tip (sharpened nib seamlessly emerging from the wood taper)
    const leadLength = 0.035; // ~3.8mm exposed lead cone
    const leadGeom = new THREE.ConeGeometry(leadR, leadLength, 16);
    leadGeom.rotateZ(Math.PI / 2); // apex points left (-X), base faces right (+X) matching woodLeft
    const leadMat = new THREE.MeshStandardMaterial({
      color: 0x18181c,
      roughness: 0.3,
      metalness: 0.25,
    });
    const lead = new THREE.Mesh(leadGeom, leadMat);
    // Wood taper left end is at: -bodyLength / 2 - woodLength (-0.785)
    // Base is slightly embedded (1mm) for a rock-solid seamless connection
    const woodLeftX = -bodyLength / 2 - woodLength;
    lead.position.set(woodLeftX - leadLength / 2 + 0.001, 0, 0);
    lead.castShadow = true;
    lead.receiveShadow = true;
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

    // 5. Pink rubber eraser top — ONE seamless lathe body (straight sides then a
    //    convergent rounded top). No cylinder+cap seam, no hemisphere: the whole
    //    tip is a single smooth surface, poking out only ~5mm past the ferrule.
    const eraserLength = 0.09; // ~10mm
    const eraserR = pencilR * 0.98;
    const eraserMat = new THREE.MeshStandardMaterial({
      color: 0xeb6b6b,
      roughness: 0.9,
    });
    const profile = [
      new THREE.Vector2(0, -eraserLength / 2),                     // left centre (ferrule side)
      new THREE.Vector2(eraserR, -eraserLength / 2),                // left outer rim
      new THREE.Vector2(eraserR, eraserLength / 2 - 0.02),          // straight side up to the fillet
      new THREE.Vector2(eraserR - 0.003, eraserLength / 2 - 0.014), // rounded corner arc (approx)
      new THREE.Vector2(eraserR - 0.008, eraserLength / 2 - 0.008), // rounded corner arc (approx)
      new THREE.Vector2(eraserR - 0.013, eraserLength / 2 - 0.003), // rounded corner arc (approx)
      new THREE.Vector2(0, eraserLength / 2 + 0.005),               // convergent rounded top apex
    ];
    const eraserGeom = new THREE.LatheGeometry(profile, 32);
    eraserGeom.rotateZ(-Math.PI / 2); // axis along X, rounded top toward +X
    const eraser = new THREE.Mesh(eraserGeom, eraserMat);
    eraser.position.set(bodyLength / 2 + ferruleLength + eraserLength / 2, 0, 0);
    eraser.castShadow = true;
    eraser.receiveShadow = true;
    pencilGroup.add(eraser);

    this.scene.add(pencilGroup);
    this.pencilGroup = pencilGroup;
  }

  createEraser() {
    // Standard rectangular block eraser lying flat, HALF pressed onto the pencil:
    // 5.0 ~ 6.0 cm long (~55mm -> 0.50 units)
    // 2.0 ~ 2.5 cm wide (~22mm -> 0.20 units)
    // 1.2 cm thick (~12mm -> 0.109 units)
    // Its bottom rests on the top of the pencil body (paperY + 2*pencilR = 0.077)
    // and its centre is offset so ~half the eraser length overlaps the pencil.
    const eraserGroup = new THREE.Group();
    const paperY = 0.006;
    const eraserThickness = 0.109;
    // Simply flat on the paper at the TOP-RIGHT corner of the sheet, well clear
    // of the pencil (paper: centre (0.12, 0.003, 0), 2.7 x 1.85), small yaw.
    eraserGroup.position.set(1.15, paperY + eraserThickness / 2, -0.75);
    eraserGroup.rotation.y = 0.3;

    const eraserLength = 0.50;
    const eraserWidth = 0.20;

    // White rubber block
    const whiteGeom = new THREE.BoxGeometry(eraserLength, eraserThickness, eraserWidth);
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xdedede, // light grey so the rubber reads against the near-white paper
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
    this.eraserGroup = eraserGroup;
  }

  hidePaperSketch() {
    this._paperSketchVisible = false;
    this.paperMat.map = this.paperCleanTexture;
    this.paperMat.needsUpdate = true;
    if (this.pencilGroup) this.pencilGroup.visible = false;
    if (this.eraserGroup) this.eraserGroup.visible = false;
  }

  showPaperSketch() {
    this._paperSketchVisible = true;
    this.paperMat.map = this.paperSketchTexture;
    this.paperMat.needsUpdate = true;
    if (this.pencilGroup) this.pencilGroup.visible = true;
    if (this.eraserGroup) this.eraserGroup.visible = true;
  }
}
