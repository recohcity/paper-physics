import * as THREE from 'three';

// Procedural wood table texture — shared across all cases.
export function createWoodTableTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 1024;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#caa57b';
  ctx.fillRect(0, 0, 1024, 1024);

  // Planks
  for (let y = 0; y < 1024; y += 128) {
    const hueOffset = (Math.random() - 0.5) * 8;
    const lightOffset = (Math.random() - 0.5) * 12;
    ctx.fillStyle = `hsl(${32 + hueOffset}, ${46}%, ${62 + lightOffset}%)`;
    ctx.fillRect(0, y, 1024, 128);
    // grain lines
    for (let i = 0; i < 20; i++) {
      ctx.strokeStyle = `rgba(120, 80, 40, ${0.05 + Math.random() * 0.08})`;
      ctx.lineWidth = 0.5 + Math.random();
      ctx.beginPath();
      const gy = y + Math.random() * 128;
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(300, gy + (Math.random() - 0.5) * 10, 700, gy + (Math.random() - 0.5) * 10, 1024, gy);
      ctx.stroke();
    }
    // plank gap
    ctx.fillStyle = 'rgba(80, 50, 20, 0.3)';
    ctx.fillRect(0, y, 1024, 2);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Cream paper texture with no sketch (clean sheet).
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
