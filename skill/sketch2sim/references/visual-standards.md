# Visual Standards

All cases share the same warm desk look. **Copy these values verbatim** — do not re-derive.
If a case needs a variant, document it here and update all cases, never one-off.

## Lighting

```js
// Renderer
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Scene
scene.background = new THREE.Color('#2e251d');

// Ambient — warm fill so shadows never go blue-black
scene.add(new THREE.AmbientLight(0xffeed9, 0.95));

// Sun — key light, upper-left, warm afternoon
const sun = new THREE.DirectionalLight(0xfffaec, 2.3);
sun.position.set(-2.5, 4.5, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 15;
sun.shadow.camera.left = -2.8;
sun.shadow.camera.right = 2.8;
sun.shadow.camera.top = 2.8;
sun.shadow.camera.bottom = -2.8;
sun.shadow.bias = -0.0002;
sun.shadow.radius = 12;
sun.shadow.blurSamples = 16;
scene.add(sun);

// Fill — cool bounce from the other side, low intensity
const fill = new THREE.DirectionalLight(0xdce7f6, 0.6);
fill.position.set(3, 2, -1);
scene.add(fill);
```

## Desk / table material

```js
const tableMat = new THREE.MeshStandardMaterial({
  map: woodTableTexture,
  color: 0xd9b98c,   // warm tint — without this the wood reads gray-white
  roughness: 0.55,
  metalness: 0.05,
});
```

## Props (pencil, eraser)

Same across all cases: hexagonal cedar pencil `0xdfa66c`, graphite tip `0x18181c`,
blue eraser sleeve `0x1d4ed8`. See `environment.js` in any shipped case.

## Panel layout

- Compact card, **max 2 rows** per card, cards side-by-side (not stacked).
- Sliders: fixed width **90px**, not flex-grow.
- Buttons: English labels, `btn-primary` (dark) for action (Play/Slow),
  `btn-secondary` (light) for Reset.
- Material toggles: small square buttons (~24×24px), flex to fill width.
- Speaker icon: right-aligned in the card.
- **No data cards** (VELOCITY/PERIOD/ENERGY readouts) — they clutter.
- Label names: full words ("Bidirectional", "Sync"), not abbreviations ("Bidir", "Sym").

## Tour banner

**No banner text.** `showTourBanner()` is a no-op that keeps the element hidden.
The tour is purely visual — the user watches the model transform, no reading required.

## Physics info card

- Floating card, cream paper background, × close button.
- Content: governing equations written for **user-adjustable parameters**, not academic symbols.
  Bad: `I₀·θ̈ = T₁·sinα·L₂ − ...` (nobody knows T₁/T₂).
  Good: `v_cup = ω × L = 4 × v_cw`, `m_c·g·Δh → ½·I·ω²`.
- Lifecycle: appears at PHYSICS step, stays through PLAY/REPLAY, hides on BUILD.
- On-demand: click title or "Physics Info" tag → show 5s.
- Text must be selectable (`user-select: text`).

## Camera auto-fit (Hero/Side/Top views)

Never hardcode camera distances per case. Two fit modes:

- **SKETCH/LIFT (no model yet):** fit the paper area with desk visible.
  Fallback: `getFitDistance(2.5, 1.5)`.
- **MODEL/MATERIAL/PLAY/REPLAY/BUILD:** fit the model's union bounding box
  (mechanism + props + blocks + stand). Not the paper — model fills the frame.

```js
autoFitDistance(viewName, margin = 1.6) {
  // Union bbox of ALL visible scene objects (mechanism + props + blocks + stand)
  const box = new THREE.Box3();
  box.setFromObject(this.mechanism.group);
  if (this.blocksMesh) box.expandByObject(this.blocksMesh);
  if (this.standMesh) box.expandByObject(this.standMesh);
  if (box.isEmpty()) return this.getFitDistance(2.5, 1.5); // SKETCH: paper + desk
  const size = box.getSize(new THREE.Vector3());
  let w, h;
  if (viewName === 'Top')       { w = size.x; h = size.z; }
  else if (viewName === 'Side') { w = size.x; h = size.y; }
  else                          { w = Math.max(size.x, size.z); h = size.y; }
  return this.getFitDistance(w * margin, h * margin);
}
```

Key points:
- **Include every scene object** — not just the main mechanism group.
  Blocks, ball stand, props all must be in the union bbox, or they get cropped.
- **Subtract UI chrome**: `getFitDistance` uses available canvas height minus
  ~150px (top bar + bottom panel), not full window height.
- **margin = 1.6**: breathing room, not edge-to-edge.
- On window resize, re-call `setCameraView(currentView, 0)` to re-fit.
- Empty-box fallback = paper view (2.5×1.5), prevents errors.

## Sketch normalization (user hand-drawn → standard assets)

User provides one raw sketch photo. Process it into two assets:

1. **`public/cutout_<slug>.png`** — tight rectangle crop of the sketch content
   (find non-white bbox, add small padding, crop). Keep original image as-is,
   no color processing, no transparency, no filling. Treat as a paper label.
2. **`public/sketch_<slug>.jpg`** — the label pasted onto a clean cream A4
   paper (2.7m × 1.85m world). Centered, with margin for pencil + eraser.

**Hard sizing rule:**
- Label height on paper = model's total bounding-box height (measured after
  model loads). Default estimate until model exists.
- Cutout plane (LIFT step) uses the same PNG at the same height.
- Both centered at world X=0.12, Z=0.

This guarantees: SKETCH label → LIFT standing label → MODEL white 3D all
line up in size and position. No size jump between stages.
