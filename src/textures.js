import * as THREE from 'three';

/**
 * Procedural texture generator for high fidelity visuals without external asset loading delays.
 */

// Generate realistic wood plank desk texture
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

// Generate paper texture with pencil sketch matching screenshot 1
// Shared drawer for the hand-drawn trebuchet pencil sketch
export function drawTrebuchetPencilSketch(ctx, tx, ty, helpers) {
  const { drawPencilLine, drawPencilRect, drawPencilCircle } = helpers;

  // Wheels resting on the ground line
  drawPencilCircle(tx - 110, ty + 105, 34);
  drawPencilCircle(tx + 120, ty + 105, 34);

  // Horizontal base chassis
  drawPencilLine(tx - 140, ty + 80, tx + 160, ty + 80, 5);
  drawPencilLine(tx - 140, ty + 55, tx + 160, ty + 55, 4);
  drawPencilLine(tx - 140, ty + 55, tx - 140, ty + 80, 4);
  drawPencilLine(tx + 160, ty + 55, tx + 160, ty + 80, 4);

  // Vertical center upright post
  drawPencilLine(tx + 3, ty - 180, tx + 3, ty + 55, 4);
  drawPencilLine(tx + 27, ty - 180, tx + 27, ty + 55, 4);

  // Triangular A-Frame Uprights
  drawPencilLine(tx - 120, ty + 55, tx + 15, ty - 180, 5);
  drawPencilLine(tx - 95, ty + 55, tx + 25, ty - 165, 4);

  drawPencilLine(tx + 120, ty + 55, tx + 15, ty - 180, 5);
  drawPencilLine(tx + 95, ty + 55, tx + 5, ty - 165, 4);

  // Pivot axle pin
  drawPencilCircle(tx + 15, ty - 180, 9);

  // Short arm to the right with counterweight box hanging
  drawPencilLine(tx + 15, ty - 180, tx + 115, ty - 90, 6);
  // Counterweight box
  drawPencilRect(tx + 90, ty - 80, 65, 75, false);
  drawPencilLine(tx + 115, ty - 90, tx + 122, ty - 80, 3);

  // Long throwing arm angled back-up-left
  drawPencilLine(tx + 15, ty - 180, tx - 210, ty - 340, 7);
  drawPencilLine(tx + 20, ty - 170, tx - 200, ty - 330, 5);

  // Wooden cup / spoon at tip matching Image 1
  ctx.save();
  ctx.strokeStyle = 'rgba(45, 42, 38, 0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(tx - 225, ty - 355, 30, 0.3, Math.PI * 1.35, false);
  ctx.stroke();

  // Stone/ball inside cup
  ctx.fillStyle = 'rgba(75, 70, 65, 0.85)';
  ctx.beginPath();
  ctx.arc(tx - 215, ty - 365, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Generate paper texture with pencil sketch (optionally omitting the trebuchet sketch)
export function createPaperWithSketchTexture(includeTrebuchet = true) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');

  // Warm cream paper
  ctx.fillStyle = '#f7f4ea';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle paper grain noise
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 14;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Helper for pencil graphite drawing
  function drawPencilLine(x1, y1, x2, y2, width = 3, opacity = 0.75, jitter = 1.2) {
    ctx.save();
    ctx.strokeStyle = `rgba(45, 42, 38, ${opacity})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(4, Math.floor(dist / 8));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter;
      const cy = y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Second faint stroke for pencil graphite look
    ctx.strokeStyle = `rgba(50, 45, 40, ${opacity * 0.4})`;
    ctx.lineWidth = width * 0.7;
    ctx.beginPath();
    ctx.moveTo(x1 + (Math.random() - 0.5) * 1.5, y1 + (Math.random() - 0.5) * 1.5);
    ctx.lineTo(x2 + (Math.random() - 0.5) * 1.5, y2 + (Math.random() - 0.5) * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawPencilRect(x, y, w, h, fillHatch = false) {
    drawPencilLine(x, y, x + w, y);
    drawPencilLine(x + w, y, x + w, y + h);
    drawPencilLine(x + w, y + h, x, y + h);
    drawPencilLine(x, y + h, x, y);

    if (fillHatch) {
      ctx.save();
      ctx.strokeStyle = 'rgba(60, 55, 50, 0.2)';
      ctx.lineWidth = 1.2;
      for (let i = 4; i < w + h; i += 8) {
        ctx.beginPath();
        const startX = Math.max(x, x + i - h);
        const startY = Math.min(y + h, y + i);
        const endX = Math.min(x + w, x + i);
        const endY = Math.max(y, y + i - w);
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPencilCircle(cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = 'rgba(45, 42, 38, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.2) {
      const rad = r + (Math.random() - 0.5) * 1.5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Hub
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(45, 42, 38, 0.8)';
    ctx.fill();
    ctx.restore();
  }

  const helpers = { drawPencilLine, drawPencilRect, drawPencilCircle };
  // Ground line in 3D is along Z = 0, which corresponds to the vertical center of the paper (Y = 700)
  const groundY = 700;
  const tx = 387; // Matches 3D trebuchet X = -0.72
  const ty = groundY - 139; // Wheels touch the ground line exactly at groundY = 700

  // 1. Optionally draw trebuchet sketch
  if (includeTrebuchet) {
    drawTrebuchetPencilSketch(ctx, tx, ty, helpers);
  }

  // 2. Ground line sketch across entire paper
  drawPencilLine(120, groundY, 1920, groundY, 2.5, 0.45);
  for (let g = 180; g < 1880; g += 90) {
    drawPencilLine(g, groundY, g + 8, groundY + 9, 1.5, 0.3);
  }

  // 3. DRAW 10 BLOCKS PYRAMID (4 at bottom, 3, 2, 1) matching 3D blocks at X = 0.92, resting on the same ground line
  if (includeTrebuchet) {
    const bx = 1530;
    const blockW = 68;
    const blockH = 68;

    // Row 0 (bottom 4) resting directly on groundY
    for (let c = 0; c < 4; c++) {
      drawPencilRect(bx + c * blockW, groundY - blockH, blockW, blockH, false);
    }
    // Row 1 (3 blocks)
    for (let c = 0; c < 3; c++) {
      drawPencilRect(bx + 34 + c * blockW, groundY - blockH * 2, blockW, blockH, false);
    }
    // Row 2 (2 blocks)
    for (let c = 0; c < 2; c++) {
      drawPencilRect(bx + 68 + c * blockW, groundY - blockH * 3, blockW, blockH, false);
    }
    // Row 3 (1 block on top)
    drawPencilRect(bx + 102, groundY - blockH * 4, blockW, blockH, false);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

// Generate the 2D paper cutout texture of the trebuchet for the stand-up animation
export function createTrebuchetCutoutTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Semi-transparent cutout canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  function drawPencilLine(x1, y1, x2, y2, width = 3.5, opacity = 0.85, jitter = 1.0) {
    ctx.save();
    ctx.strokeStyle = `rgba(40, 36, 32, ${opacity})`;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(4, Math.floor(dist / 8));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const cx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter;
      const cy = y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawPencilRect(x, y, w, h) {
    drawPencilLine(x, y, x + w, y);
    drawPencilLine(x + w, y, x + w, y + h);
    drawPencilLine(x + w, y + h, x, y + h);
    drawPencilLine(x, y + h, x, y);
  }

  function drawPencilCircle(cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 36, 32, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.2) {
      const rad = r + (Math.random() - 0.5) * 1.5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 36, 32, 0.9)';
    ctx.fill();
    ctx.restore();
  }

  const helpers = { drawPencilLine, drawPencilRect, drawPencilCircle };
  // Draw scaled and aligned so wheels touch near the bottom edge (Y=1009)
  ctx.save();
  ctx.translate(576, 821);
  ctx.scale(1.35, 1.35);

  // 1. Paper cardstock backing silhouette (gives tangible 2D paper cutout look)
  ctx.save();
  ctx.fillStyle = 'rgba(247, 242, 233, 0.95)';
  // Chassis
  ctx.fillRect(-142, 53, 304, 30);
  // Both wheels resting on ground line
  ctx.beginPath();
  ctx.arc(-110, 105, 34, 0, Math.PI * 2);
  ctx.arc(120, 105, 34, 0, Math.PI * 2);
  ctx.fill();
  // Center vertical upright post
  ctx.fillRect(3, -180, 24, 235);
  // A-Frame
  ctx.beginPath();
  ctx.moveTo(-122, 55);
  ctx.lineTo(18, -182);
  ctx.lineTo(122, 55);
  ctx.closePath();
  ctx.fill();
  // Throwing arm
  ctx.beginPath();
  ctx.moveTo(118, -92);
  ctx.lineTo(-215, -345);
  ctx.lineTo(-200, -325);
  ctx.lineTo(110, -80);
  ctx.closePath();
  ctx.fill();
  // Counterweight box
  ctx.fillRect(88, -82, 69, 79);
  // Cup
  ctx.beginPath();
  ctx.arc(-225, -355, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Draw pencil sketch lines
  drawTrebuchetPencilSketch(ctx, 0, 0, helpers);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

// Balsa craft wood texture for 3D model parts
export function createBalsaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#eddac2';
  ctx.fillRect(0, 0, 512, 512);

  // Fine linear wood fiber lines
  for (let i = 0; i < 400; i++) {
    const y = Math.random() * 512;
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(180, 145, 105, 0.15)' : 'rgba(255, 245, 230, 0.3)';
    ctx.lineWidth = 0.8 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + (Math.random() - 0.5) * 4);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Dark cast lead counterweight texture
export function createLeadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#232528';
  ctx.fillRect(0, 0, 256, 256);

  // Metallic speckles & rough cast texture
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const gray = 40 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.25)`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Weight stamp "1.00 kg"
  ctx.save();
  ctx.fillStyle = 'rgba(190, 195, 205, 0.45)';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('1.00 kg', 128, 128);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * 2D paper cutout texture for the 4-3-2-1 wooden block pyramid.
 * Canvas 512×512: bottom edge = ground line.
 * Pyramid: 4 wide × 4 tall blocks. BLK = 110 px -> 440×440 px.
 * Sits directly on bottom edge (originY = 510) so it rests flush on the ground table.
 */
export function createBlocksCutoutTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);

  const BLK = 110;
  const rows = [4, 3, 2, 1];
  const totalW = 4 * BLK;
  const originX = (512 - totalW) / 2; // 36 px
  const originY = 510; // Flush with bottom edge

  // Cardstock backing fill
  ctx.fillStyle = 'rgba(247, 242, 233, 0.95)';
  for (let r = 0; r < rows.length; r++) {
    const count = rows[r];
    const rowOffsetX = ((4 - count) / 2) * BLK;
    const y = originY - (r + 1) * BLK;
    for (let c = 0; c < count; c++) {
      const x = originX + rowOffsetX + c * BLK;
      ctx.fillRect(x + 2, y + 2, BLK - 4, BLK - 4);
    }
  }

  // Pencil sketch lines
  function pencilLine(x1, y1, x2, y2, w, op) {
    w = w || 2.5; op = op || 0.82;
    ctx.save();
    ctx.strokeStyle = 'rgba(40, 36, 32, ' + op + ')';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    const steps = Math.max(4, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 6));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      ctx.lineTo(
        x1 + (x2 - x1) * t + (Math.random() - 0.5) * 1.2,
        y1 + (y2 - y1) * t + (Math.random() - 0.5) * 1.2
      );
    }
    ctx.stroke();
    ctx.restore();
  }

  for (let r = 0; r < rows.length; r++) {
    const count = rows[r];
    const rowOffsetX = ((4 - count) / 2) * BLK;
    const y = originY - (r + 1) * BLK;
    for (let c = 0; c < count; c++) {
      const x = originX + rowOffsetX + c * BLK;
      const bx = x + 2, by = y + 2, bw = BLK - 4, bh = BLK - 4;
      // Outline
      pencilLine(bx, by, bx + bw, by);
      pencilLine(bx + bw, by, bx + bw, by + bh);
      pencilLine(bx + bw, by + bh, bx, by + bh);
      pencilLine(bx, by + bh, bx, by);
      // Cross diagonals for paper-craft look
      pencilLine(bx, by, bx + bw, by + bh, 1.2, 0.28);
      pencilLine(bx + bw, by, bx, by + bh, 1.2, 0.28);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}


