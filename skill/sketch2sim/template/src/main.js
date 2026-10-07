import * as THREE from 'three';
import { Environment } from './environment.js';
import { createWoodTableTexture, createCleanPaperTexture } from './textures.js';
import { Mechanism } from './mechanism.js';
import { spec } from './spec.js';

// ---- renderer ----
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// ---- scene / camera ----
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2e251d');
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);

// ---- standardized lighting (see references/visual-standards.md) ----
scene.add(new THREE.AmbientLight(0xffeed9, 0.95));
const sun = new THREE.DirectionalLight(0xfffaec, 2.3);
sun.position.set(-2.5, 4.5, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 15;
sun.shadow.camera.left = -2.8; sun.shadow.camera.right = 2.8;
sun.shadow.camera.top = 2.8; sun.shadow.camera.bottom = -2.8;
sun.shadow.bias = -0.0002;
sun.shadow.radius = 12;
sun.shadow.blurSamples = 16;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdce7f6, 0.6);
fill.position.set(3, 2, -1);
scene.add(fill);

// ---- desk environment ----
const woodTex = createWoodTableTexture();
const cleanPaperTex = createCleanPaperTexture();
// Project-specific sketch texture: drop <slug>.jpg in public/ and load it here.
// const sketchTex = new THREE.TextureLoader().load('<slug>.jpg');
const env = new Environment(scene, woodTex, cleanPaperTex, cleanPaperTex);

// ---- mechanism (project-specific) ----
const mech = new Mechanism(scene, spec);

// ---- camera views ----
const views = {
  hero: [0, 0.4, 1.2],
  side: [1.2, 0.2, 0],
  top: [0, 1.4, 0.01],
  iso: [0.8, 0.6, 0.8],
};
function setView(name) {
  const p = views[name] || views.hero;
  camera.position.set(...p);
  camera.lookAt(0, 0.1, 0);
}
setView('hero');
document.querySelectorAll('.view-btn').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setView(b.dataset.view);
  };
});

// ---- panel sliders from spec.inputs ----
const paramSection = document.getElementById('param-section');
spec.inputs.forEach(inp => {
  const row = document.createElement('div');
  row.className = 'ctrl-group';
  row.innerHTML = `<div class="ctrl-label-row"><label>${inp.label}</label><span>${inp.value}</span></div>`;
  const sl = document.createElement('input');
  sl.type = 'range'; sl.min = inp.min; sl.max = inp.max; sl.step = inp.step; sl.value = inp.value;
  sl.dataset.key = inp.key;
  sl.oninput = () => { row.querySelector('span').textContent = sl.value; mech.setParam(inp.key, parseFloat(sl.value)); };
  row.appendChild(sl);
  paramSection.appendChild(row);
});

// ---- mode switching ----
const buildPanel = document.getElementById('build-panel');
function resetAll() { mech.reset(); }
function setMode(mode) {
  const isTour = mode === 'tour';
  buildPanel.classList.toggle('hidden', isTour);
  resetAll();
}
document.getElementById('btn-play-tour').onclick = () => setMode('tour');
document.getElementById('btn-build').onclick = () => setMode('build');

// ---- buttons ----
document.getElementById('btn-action').onclick = () => mech.action();
document.getElementById('btn-reset').onclick = () => {
  mech.reset();
  // Reset panel sliders to defaults (case-specific: add your own resets here)
  paramSection.querySelectorAll('input[type=range]').forEach(sl => {
    const inp = spec.inputs.find(i => i.key === sl.dataset.key);
    if (inp) { sl.value = inp.value; sl.dispatchEvent(new Event('input')); }
  });
};
let slowmo = false;
document.getElementById('btn-slowmo').onclick = (e) => {
  slowmo = !slowmo; e.target.classList.toggle('active', slowmo);
};

// ---- resize ----
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---- main loop ----
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  let frame = (now - last) / 1000; last = now;
  if (frame > 0.1) frame = 0.1;
  const dt = slowmo ? frame * 0.25 : frame;
  mech.update(dt);
  renderer.render(scene, camera);
}
setMode('tour');
requestAnimationFrame(tick);

// Fade out cream loading overlay after first render
requestAnimationFrame(() => {
  setTimeout(() => {
    const ov = document.getElementById('loading-overlay');
    if (ov) { ov.style.opacity = '0'; setTimeout(() => ov.remove(), 300); }
  }, 200);
});
