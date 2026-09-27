import * as THREE from 'three';

/**
 * Renders hand-drawn annotations, trajectory arcs, and physics parameters
 * matching the user's diagrams (0.48 kg, 0.68 kg, 0.95 kg arcs, weight tags, arrow).
 */
export class TrajectoryAnnotations {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.enabled = true;
    this.showTrajectories = false;

    // Flight points recorded in 3D world space
    this.points = [];
    this.launchPoint = null;
    this.impactPoint = null;

    // Weight callout state
    this.counterweightPos = null;
    this.counterweightKg = 0.68;
    this.showWeightCallout = false;

    // Real-time flight annotations
    this.stats = {
      speed: '1.85 m/s',
      angle: '32°',
      range: '2.35',
    };
    this.showFlightAnnotations = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * window.devicePixelRatio;
    this.canvas.height = this.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  clear() {
    this.points = [];
    this.launchPoint = null;
    this.impactPoint = null;
    this.showFlightAnnotations = false;
  }

  setWeight(kg, worldPos) {
    this.counterweightKg = kg;
    if (worldPos) {
      this.counterweightPos = worldPos.clone();
    }
  }

  addPoint(vec3) {
    this.points.push(vec3.clone());
    if (!this.launchPoint) {
      this.launchPoint = vec3.clone();
    }
  }

  finishFlight(speed, angleDeg, rangeDist, impactVec3) {
    this.impactPoint = impactVec3 ? impactVec3.clone() : (this.points[this.points.length - 1] || null);
    this.stats.speed = `${speed.toFixed(2)} m/s`;
    this.stats.angle = `${Math.round(angleDeg)}°`;
    this.stats.range = rangeDist.toFixed(2);
    this.showFlightAnnotations = true;
  }

  // Convert 3D world coordinate to 2D screen coordinate
  toScreen(vec3) {
    const v = vec3.clone();
    v.project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.width;
    const y = (-(v.y * 0.5) + 0.5) * this.height;
    return { x, y, visible: v.z < 1 };
  }

  // Draw reference trajectory curve for a given counterweight mass (0.48, 0.68, 0.95 kg)
  drawReferenceArc(weightKg, label, color, isHighlight = false) {
    // Cup launch point around (-0.55, 0.85, 0)
    // 0.48 kg: lands at X = 0.58 (short of pyramid at X = 1.05)
    // 0.68 kg: hits upper blocks at X = 1.02, Y = 0.35
    // 0.95 kg: lands at X = 1.75 (past pyramid)
    let endX, endY, apexX, apexY;
    if (weightKg < 0.55) {
      // 0.48 kg
      endX = 0.55;
      endY = 0.02;
      apexX = -0.05;
      apexY = 1.25;
    } else if (weightKg < 0.80) {
      // 0.68 kg
      endX = 1.02;
      endY = 0.36;
      apexX = 0.22;
      apexY = 1.48;
    } else {
      // 0.95 kg
      endX = 1.75;
      endY = 0.02;
      apexX = 0.55;
      apexY = 1.68;
    }

    const startP = this.toScreen(new THREE.Vector3(-0.55, 0.82, 0));
    const apexP = this.toScreen(new THREE.Vector3(apexX, apexY, 0));
    const endP = this.toScreen(new THREE.Vector3(endX, endY, 0));

    if (!startP.visible || !apexP.visible || !endP.visible) return;

    this.ctx.save();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = isHighlight ? 2.5 : 1.8;
    this.ctx.setLineDash(isHighlight ? [7, 6] : [5, 6]);

    this.ctx.beginPath();
    this.ctx.moveTo(startP.x, startP.y);
    this.ctx.quadraticCurveTo(apexP.x, apexP.y, endP.x, endP.y);
    this.ctx.stroke();

    // End landing marker: little circle or X
    this.ctx.setLineDash([]);
    if (endY < 0.1) {
      // Draw landing 'x' on paper/table
      const sz = 5;
      this.ctx.beginPath();
      this.ctx.moveTo(endP.x - sz, endP.y - sz);
      this.ctx.lineTo(endP.x + sz, endP.y + sz);
      this.ctx.moveTo(endP.x + sz, endP.y - sz);
      this.ctx.lineTo(endP.x - sz, endP.y + sz);
      this.ctx.stroke();
    } else {
      // Circle on block hit target
      this.ctx.beginPath();
      this.ctx.arc(endP.x, endP.y, 6, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Label on the arc
    this.ctx.font = '700 17px "Caveat", cursive';
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.fillText(label, apexP.x, apexP.y - 12);

    this.ctx.restore();
  }

  // Draw floating weight callout badge next to the black counterweight box
  drawWeightCallout() {
    if (!this.counterweightPos || !this.showWeightCallout) return;
    const p = this.toScreen(this.counterweightPos);
    if (!p.visible) return;

    this.ctx.save();

    // Callout box position: slightly offset to the right
    const badgeX = p.x + 35;
    const badgeY = p.y - 18;
    const badgeW = 76;
    const badgeH = 26;

    // Connecting pin line from box to badge
    this.ctx.strokeStyle = 'rgba(120, 110, 95, 0.85)';
    this.ctx.lineWidth = 1.4;
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.ctx.lineTo(badgeX, badgeY + badgeH / 2);
    this.ctx.stroke();

    // Origin dot on counterweight
    this.ctx.fillStyle = '#222';
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Glass / Parchment Badge Background
    this.ctx.fillStyle = 'rgba(252, 250, 246, 0.95)';
    this.ctx.strokeStyle = 'rgba(205, 195, 180, 0.9)';
    this.ctx.lineWidth = 1.2;
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
    this.ctx.shadowBlur = 6;
    this.ctx.shadowOffsetY = 2;

    this.ctx.beginPath();
    this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    this.ctx.fill();
    this.ctx.shadowColor = 'transparent';
    this.ctx.stroke();

    // Yellow indicator dot
    this.ctx.fillStyle = '#eab308';
    this.ctx.beginPath();
    this.ctx.arc(badgeX + 11, badgeY + badgeH / 2, 3.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Weight text
    this.ctx.fillStyle = '#261f18';
    this.ctx.font = '600 12.5px "JetBrains Mono", monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(`${this.counterweightKg.toFixed(2)} kg`, badgeX + 18, badgeY + badgeH / 2);

    this.ctx.restore();
  }

  render(currentWeightKg) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    if (!this.enabled) return;

    // (Static reference arcs removed per user request: only live recorded flight path is rendered)

    // 2. Draw Floating Weight Callout Badge next to black counterweight box
    this.drawWeightCallout();

    // 3. Draw Live Flight Path points if recorded
    if (this.points.length >= 2) {
      const screenPts = [];
      for (let i = 0; i < this.points.length; i++) {
        const p = this.toScreen(this.points[i]);
        if (p.visible) screenPts.push(p);
      }

      if (screenPts.length >= 2) {
        this.ctx.save();
        this.ctx.strokeStyle = '#2563eb';
        this.ctx.lineWidth = 2.6;
        this.ctx.setLineDash([7, 6]);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        this.ctx.beginPath();
        this.ctx.moveTo(screenPts[0].x, screenPts[0].y);
        for (let i = 1; i < screenPts.length; i++) {
          this.ctx.lineTo(screenPts[i].x, screenPts[i].y);
        }
        this.ctx.stroke();
        this.ctx.restore();
      }

      // Draw flight notes (speed, angle, range, arrow) if completed
      if (this.showFlightAnnotations && screenPts.length > 4) {
        const startP = screenPts[0];
        const midIdx = Math.floor(screenPts.length * 0.45);
        const midP = screenPts[midIdx];
        const endP = screenPts[screenPts.length - 1];
        const nearEndP = screenPts[Math.max(0, screenPts.length - 3)];

        this.ctx.save();

        // Arrow head pointing to impact
        const angleEnd = Math.atan2(endP.y - nearEndP.y, endP.x - nearEndP.x);
        this.ctx.strokeStyle = '#1e1a16';
        this.ctx.lineWidth = 2.2;
        this.ctx.beginPath();
        this.ctx.moveTo(endP.x, endP.y);
        this.ctx.lineTo(
          endP.x - 14 * Math.cos(angleEnd - Math.PI / 6),
          endP.y - 14 * Math.sin(angleEnd - Math.PI / 6)
        );
        this.ctx.moveTo(endP.x, endP.y);
        this.ctx.lineTo(
          endP.x - 14 * Math.cos(angleEnd + Math.PI / 6),
          endP.y - 14 * Math.sin(angleEnd + Math.PI / 6)
        );
        this.ctx.stroke();

        // Handwritten speed
        this.ctx.fillStyle = '#1c1712';
        this.ctx.font = '700 24px "Caveat", cursive';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(this.stats.speed, startP.x + 10, startP.y - 32);

        // Angle
        this.ctx.font = '600 20px "Caveat", cursive';
        this.ctx.fillText(this.stats.angle, startP.x + 55, startP.y - 10);
        this.ctx.strokeStyle = '#2d261e';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(startP.x, startP.y, 28, -Math.PI / 2, -Math.PI / 6, false);
        this.ctx.stroke();

        // Range
        this.ctx.font = '700 23px "Caveat", cursive';
        this.ctx.fillText(this.stats.range, midP.x - 15, midP.y - 18);

        this.ctx.restore();
      }
    }
  }
}
