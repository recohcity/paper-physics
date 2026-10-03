import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Environment } from './environment.js';
import { createWoodTableTexture } from './textures.js';
import { Mechanism } from './mechanism.js';
import { spec } from './spec.js';

// ── Renderer ──────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

// ── Scene / Camera (trebuchet defaults) ────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2e251d');

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
camera.position.set(0.2, 1.4, 2.5);
camera.lookAt(0.15, 0.35, 0);

// ── Lights ─────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(0.4, 0.8, 0.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// ── Environment (desk / paper / pencil / eraser) ──────────────────────────
const loader = new THREE.TextureLoader();
const paperTex = loader.load('/sketch.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; });
const woodTex = createWoodTableTexture();
const env = new Environment(scene, woodTex, paperTex, paperTex);

// ── Mechanism (project-specific) ──────────────────────────────────────────
const mech = new Mechanism(scene, spec);
mech.camera = camera;

// ── OrbitControls ──────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.15, 0.35, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.4;
controls.maxDistance = 8;

// ── View buttons ──────────────────────────────────────────────────────────
const btnFront = document.querySelector('[data-view="front"]');
const btnIso = document.querySelector('[data-view="iso"]');
btnFront.onclick = () => {
  camera.position.set(...spec.camera.front.pos);
  camera.lookAt(...spec.camera.front.lookAt);
  btnFront.classList.add('active'); btnIso.classList.remove('active');
};
btnIso.onclick = () => {
  camera.position.set(...spec.camera.iso.pos);
  camera.lookAt(...spec.camera.iso.lookAt);
  btnIso.classList.add('active'); btnFront.classList.remove('active');
};

// ── Reset ──────────────────────────────────────────────────────────────────
document.getElementById('btn-reset').onclick = () => mech.reset();

// ── Project-specific panel injection ────────────────────────────────────────
if (mech.buildPanel) {
  mech.buildPanel(document.getElementById('param-section'), document.getElementById('action-bar'));
}
if (spec.hint) document.getElementById('hint').textContent = spec.hint;
if (spec.title) document.getElementById('app-title').textContent = spec.title;

// ── Resize ────────────────────────────────────────────────────────────────
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ── Fixed-timestep loop ───────────────────────────────────────────────────
const FIXED = 1 / 240;
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  let frame = (now - last) / 1000; last = now;
  if (frame > 0.1) frame = 0.1;
  let steps = Math.round(frame / FIXED);
  while (steps-- > 0) mech.step(FIXED);
  mech.update();
  // readout
  const rows = mech.readout ? mech.readout() : ['0.000 J', 'rest'];
  const g = document.querySelector('.stats');
  if (g && g.children[0]) g.children[0].querySelector('.stat-value').textContent = rows[0];
  if (g && g.children[1]) g.children[1].querySelector('.stat-value').textContent = rows[1];
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
