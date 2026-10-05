import * as THREE from 'three';

/**
 * Procedural textures (shell only, Workstream B).
 * The paper sketch itself is the pre-composited
 * public/sketch_newton-cradle.jpg (cream #f7f4ea bg + pencil line art), loaded
 * by main.js; the 2D LIFT cutout is public/cutout_newton-cradle.png (near-white
 * background knocked out to transparent). No procedural pencil drawing here —
 * that would duplicate the user's sketch (single-source rule, pitfall #9).
 */

// Realistic wood plank desk texture
export function createWoodTableTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#caa57b';
  ctx.fillRect(0, 0, 2048, 2048);

  const numPlanks = 8;
  const plankHeight = 2048 / numPlanks;

  for (let i = 0; i < numPlanks; i++) {
    const yStart = i * plankHeight;
    const hueOffset = (Math.random() - 0.5) * 6;
    const lightOffset = (Math.random() - 0.5) * 12;
    ctx.fillStyle = `hsl(${32 + hueOffset}, ${46 + hueOffset}%, ${62 + lightOffset}%)`;
    ctx.fillRect(0, yStart, 2048, plankHeight);

    ctx.save();
    for (let g = 0; g < 140; g++) {
      const y = yStart + Math.random() * plankHeight;
      const alpha = 0.04 + Math.random() * 0.08;
      ctx.strokeStyle = Math.random() > 0.4 ? `rgba(90, 55, 25, ${alpha})` : `rgba(235, 205, 170, ${alpha * 0.7})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      const waveFreq = 0.002 + Math.random() * 0.003;
      const waveAmp = 2 + Math.random() * 6;
      for (let x = 0; x <= 2048; x += 32) {
        const ny = y + Math.sin(x * waveFreq) * waveAmp + (Math.random() - 0.5) * 1.5;
        ctx.lineTo(x, ny);
      }
      ctx.stroke();
    }

    if (Math.random() > 0.5) {
      const knotX = 200 + Math.random() * 1600;
      const knotY = yStart + plankHeight * (0.3 + Math.random() * 0.4);
      const knotRad = 15 + Math.random() * 25;
      const grad = ctx.createRadialGradient(knotX, knotY, 2, knotX, knotY, knotRad * 1.8);
      grad.addColorStop(0, 'rgba(70, 40, 15, 0.4)');
      grad.addColorStop(0.5, 'rgba(110, 70, 30, 0.25)');
      grad.addColorStop(1, 'rgba(110, 70, 30, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(knotX, knotY, knotRad * 1.5, knotRad * 0.7, 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(40, 25, 10, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, yStart);
    ctx.lineTo(2048, yStart);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 240, 215, 0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yStart + 3);
    ctx.lineTo(2048, yStart + 3);
    ctx.stroke();

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  return texture;
}

// Blank cream paper (used as the "clean" paper once the sketch lifts off).
export function createPaperWithSketchTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, 2048, 1440);
  return canvas;
}

// Tight horizontal wood-grain for the cradle frame (beam / walls / brackets).
export function createWoodFrameTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#b98d5a';
  ctx.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 90; i++) {
    const y = Math.random() * 256;
    const alpha = 0.05 + Math.random() * 0.1;
    ctx.strokeStyle = Math.random() > 0.4 ? `rgba(80, 48, 20, ${alpha})` : `rgba(225, 195, 155, ${alpha * 0.8})`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 24) {
      ctx.lineTo(x, y + Math.sin(x * 0.008 + i) * 3);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
