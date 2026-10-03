import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { spec } from './spec.js';
import { Environment } from './environment.js';
import { Mechanism } from './mechanism.js';

// ---- renderer / scene ----
const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(2, 4, 3); sun.castShadow = true; scene.add(sun);

// ---- physics ----
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -spec.world.gravity, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);

// ---- desk environment (loads the sketch texture if present) ----
let sketchTex = null;
try {
  sketchTex = new THREE.TextureLoader().load('/sketch.jpg');
  sketchTex.colorSpace = THREE.SRGBColorSpace;
} catch (e) { /* no sketch yet */ }
new Environment(scene, sketchTex, spec.skin || {});

// ---- the mechanism (the 20% project-specific code) ----
const mech = new Mechanism(scene, world, spec);

// ---- camera presets ----
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
document.querySelectorAll('.view-btn').forEach(b =>
  b.onclick = () => {
    document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); setView(b.dataset.view);
  });

// ---- panel: build sliders from spec.inputs ----
const paramSection = document.getElementById('param-section');
spec.inputs.forEach(inp => {
  const row = document.createElement('div'); row.className = 'ctrl-group';
  row.innerHTML = `<div class="ctrl-label-row"><label>${inp.label}</label><span>${inp.value}</span></div>`;
  const sl = document.createElement('input');
  sl.type = 'range'; sl.min = inp.min; sl.max = inp.max; sl.step = inp.step; sl.value = inp.value;
  sl.oninput = () => { row.querySelector('span').textContent = sl.value; mech.setParam(inp.key, parseFloat(sl.value)); };
  row.appendChild(sl); paramSection.appendChild(row);
});

// stats grid from spec.outputs
const statsGrid = document.getElementById('stats-grid');
spec.outputs.forEach((o, i) => {
  const card = document.createElement('div'); card.className = 'stat-card'; card.id = 'stat-' + i;
  card.innerHTML = `<div class="stat-label">${o.label}</div><div class="stat-value">—</div>`;
  statsGrid.appendChild(card);
});

// ---- mode switching: tour vs build ----
const buildPanel = document.getElementById('build-panel');
const banner = document.getElementById('tour-banner');
function setMode(mode) {
  const isTour = mode === 'tour';
  buildPanel.classList.toggle('hidden', isTour);
  banner.classList.toggle('hidden', !isTour);
}
document.getElementById('btn-play-tour').onclick = () => { setMode('tour'); runTour(); };
document.getElementById('btn-build').onclick = () => setMode('build');

async function runTour() {
  const steps = mech.tourSteps();
  if (!steps.length) { banner.classList.add('hidden'); return; }
  mech.reset();
  for (const s of steps) {
    document.getElementById('tour-banner-text').textContent = s.caption;
    await s.apply();
    await new Promise(r => setTimeout(r, 1200));
  }
}

// ---- buttons ----
document.getElementById('btn-action').onclick = () => mech.action();
document.getElementById('btn-reset').onclick = () => mech.reset();
let slowmo = false;
document.getElementById('btn-slowmo').onclick = (e) => {
  slowmo = !slowmo; e.target.classList.toggle('active', slowmo);
};

// ---- main loop ----
const FIXED = 1 / 240;
function resize() {
  renderer.setSize(container.clientWidth, container.clientHeight);
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  let frame = (now - last) / 1000; last = now;
  if (frame > 0.1) frame = 0.1;
  const dt = slowmo ? frame * 0.25 : frame;
  let steps = Math.round(dt / FIXED);
  while (steps-- > 0) world.step(FIXED);
  mech.update(dt);

  // update readouts
  const rows = mech.readout();
  rows.forEach((r, i) => {
    const card = document.getElementById('stat-' + i);
    if (card) card.querySelector('.stat-value').textContent = r;
  });
  renderer.render(scene, camera);
}
setMode('tour');
requestAnimationFrame(tick);
