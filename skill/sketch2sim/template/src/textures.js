// ============================================================================
// AUTHORITATIVE PUBLIC SHELL (skill/sketch2sim/template/src/textures.js)
// Single source of truth for SHARED procedural textures. Aligned wood grain
// synced from cases/lobby (2048px planks, knots, plank seams). Case-specific
// textures (trebuchet cutouts, balsa, lead, blocks, sketch.jpg loading) stay
// in their own cases and are NOT promoted here.
// ============================================================================
import * as THREE from 'three';

/**
 * Procedural texture generator for high fidelity visuals without external asset loading delays.
 */

// Generate realistic wood plank desk texture (shared across all cases).
// Procedural wood table texture — shared across all cases.
export function createWoodTableTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  // Base wood tone
  ctx.fillStyle = '#caa57b';
  ctx.fillRect(0, 0, 2048, 2048);

  const numPlanks = 8;
  const plankHeight = 2048 / numPlanks;

  for (let i = 0; i < numPlanks; i++) {
    const yStart = i * plankHeight;
    // Plank color variation
    const hueOffset = (Math.random() - 0.5) * 6;
    const lightOffset = (Math.random() - 0.5) * 12;
    ctx.fillStyle = `hsl(${32 + hueOffset}, ${46 + hueOffset}%, ${62 + lightOffset}%)`;
    ctx.fillRect(0, yStart, 2048, plankHeight);

    // Wood grain lines
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

    // Wood knots (occasional)
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

    // Seam line between planks
    ctx.strokeStyle = 'rgba(40, 25, 10, 0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, yStart);
    ctx.lineTo(2048, yStart);
    ctx.stroke();

    // Plank highlight edge
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

// Cream paper texture with no sketch (clean sheet).
// Project-specific sketch texture: drop <slug>.jpg in public/ and load it in the
// case's own main.js (see template main.js comment). This template only ships
// the clean-sheet fallback.
export function createCleanPaperTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 700;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, 1024, 700);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
