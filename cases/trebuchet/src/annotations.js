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

  // ---- Tour part labels (step 5): name + world position, progressive ----
  setPartLabels(labels, count, center = null) {
    this.partLabels = labels || null;
    this.partLabelCount = count || 0;
    this.labelCenter = center; // world-space centre labels radiate around
  }

  drawPartLabels() {
    if (!this.partLabels || this.partLabelCount <= 0) return;
    const labels = this.partLabels.slice(0, Math.min(this.partLabelCount, this.partLabels.length));
    const visible = labels
      .map((label) => ({ label, p: this.toScreen(label.pos) }))
      .filter((x) => x.p.visible);
    const n = visible.length;
    if (!n) return;

    // Close-up label style (like the counterweight mass tag): each label sits
    // just OUTSIDE its part, pushed along the anchor's outward direction with
    // a short dashed-blue parabola leader.  Labels fan out in different
    // directions so nothing clusters on a single point; text boxes are
    // collision-checked (push further out) and leader curves are
    // cross-checked (push out again), guaranteeing no overlapping text or
    // crossing lines.  No cards — pure handwritten labels.
    const c = this.labelCenter ? this.toScreen(this.labelCenter) : null;
    const w = this.width, h = this.height;
    const cx = c && c.visible ? Math.min(w * 0.72, Math.max(w * 0.28, c.x)) : w / 2;
    const cy = c && c.visible ? Math.min(h * 0.60, Math.max(h * 0.36, c.y)) : h * 0.55;

    // Layout is computed once for the FULL label set: progressive reveal then
    // shows each label at its final slot, so nothing ever jumps.
    const full = this.partLabels
      .map((label) => ({ label, p: this.toScreen(label.pos) }))
      .filter((x) => x.p.visible);
    const m = full.length;

    this.ctx.save();
    this.ctx.font = '600 17px "Caveat", cursive';
    this.ctx.textBaseline = 'middle';

    const geomFor = (v, dist, angOffset = 0) => {
      // Push outward from the part along its anchor direction, optionally
      // rotated by angOffset so colliding labels fan out sideways instead of
      // stacking in a vertical chain.
      const base = Math.atan2(v.p.y - cy, v.p.x - cx);
      const a = base + angOffset;
      const ux = Math.cos(a), uy = Math.sin(a);
      let tx = v.p.x + ux * dist;
      let ty = v.p.y + uy * dist;
      tx = Math.min(w - 70, Math.max(70, tx));
      ty = Math.min(h - 92, Math.max(64, ty));
      return { tx, ty, ux, uy, a };
    };
    // Ball & Arm special placement: label sits horizontally to the RIGHT of
    // its anchor at the same height (no vertical chain), with the leader's
    // perpendicular offset rotated clockwise 90°.
    const horizontalRight = (v, dist) => {
      let tx = v.p.x + dist;
      let ty = v.p.y;
      tx = Math.min(w - 70, Math.max(70, tx));
      ty = Math.min(h - 92, Math.max(64, ty));
      return { tx, ty, ux: 1, uy: 0, a: 0 };
    };
    const textBox = (g, tw) => {
      const ca = g.ux;
      let align = Math.abs(ca) > 0.3 ? (ca > 0 ? 'left' : 'right') : 'center';
      let x0, x1;
      if (align === 'left') { x0 = g.tx + 14; x1 = x0 + tw; }
      else if (align === 'right') { x0 = g.tx - 14 - tw; x1 = g.tx - 14; }
      else { x0 = g.tx - tw / 2; x1 = g.tx + tw / 2; }
      return { align, x0, x1, y0: g.ty - 12, y1: g.ty + 12 };
    };
    const boxes = [];
    // Overlap = true boxes intersect, OR they line up in the same column
    // (vertical chain: wide x-overlap with a small y gap) — the latter is
    // treated as a collision so labels fan out sideways instead of stacking.
    const verticalChain = (b, o) => {
      const minW = Math.min(b.x1 - b.x0, o.x1 - o.x0);
      if (minW <= 0) return false;
      const ow = Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0);
      if (ow / minW <= 0.5) return false;
      const yGap = Math.min(Math.abs(b.y0 - o.y1), Math.abs(b.y1 - o.y0));
      return yGap < 130;
    };
    const overlap = (b) => boxes.some((o) =>
      !(b.x1 <= o.x0 || b.x0 >= o.x1 || b.y1 <= o.y0 || b.y0 >= o.y1) || verticalChain(b, o));
    const widths = full.map((v) => this.ctx.measureText(v.label.name).width);

    // Direction-cluster detection: when several anchors point the same way
    // (e.g. cup + arm both sit upper-left), later labels get a fixed base tilt
    // so they fan out sideways instead of forming a vertical chain.
    const anchorDirs = full.map((v) => Math.atan2(v.p.y - cy, v.p.x - cx));
    const claimedDirs = [];
    const slots = [];
    for (let i = 0; i < m; i++) {
      const isBall = full[i].label.name === 'Ball 球';
      const isArm = full[i].label.name === 'Arm 摆杆';
      const isChassis = full[i].label.name === 'Chassis 底座';
      const isCup = full[i].label.name === 'Cup 投射杯';
      const isCw = full[i].label.name === 'Counterweight 配重箱';
      // Chassis leader runs down across the wheel: nudge its label to the
      // right (clockwise tilt) so the curve clears the wheel.
      const chassisTilt = isChassis ? Math.PI / 5 : 0;
      // Cup: rotate the leader clockwise 35° (user directive) so the label
      // slides along the beam instead of piling on the cup anchor.
      const cupTilt = isCup ? Math.PI * 35 / 180 : 0;
      // Counterweight: its label sits horizontally to the RIGHT of the box
      // (leader points straight back into it) — user directive: curve missed
      // the box before, needs to sit to the right.

      const near = claimedDirs.filter((d) => {
        let dd = Math.abs(d - anchorDirs[i]);
        dd = Math.min(dd, Math.PI * 2 - dd);
        return dd < Math.PI / 6; // 30° = same direction cluster
      });
      const baseOff = near.length === 0 ? 0 : (near.length % 2 === 1 ? near.length * 38 : -near.length * 38);
      claimedDirs.push(anchorDirs[i]);
      let dist = isBall ? 66 : isArm ? 118 : 108, g = null, box = null;
      for (let k = 0; k < 12; k++) {
        // Alternate clockwise/anti-clockwise tilts so a blocked label slides
        // sideways rather than piling directly below the previous one.
        const angOff = k === 0 ? baseOff + chassisTilt + cupTilt : (k % 2 === 1 ? k * 16 : -(k * 16));
        g = isBall || isArm || isCw ? horizontalRight(full[i], dist) : geomFor(full[i], dist, angOff);
        box = textBox(g, widths[i]);
        if (!overlap(box)) break;
        dist += 26;
      }
      boxes.push(box);
      slots.push({ g, box, dist });
    }

    // Leader cross-check: sample the parabolas and push the later label out
    // until no two curves intersect (bounded retries).
    const curvePts = (v, g) => {
      const ctrlX = (v.p.x + g.tx) / 2 + Math.sin(g.a) * 26;
      const ctrlY = (v.p.y + g.ty) / 2 - Math.cos(g.a) * 26;
      const pts = [];
      for (let t = 0; t <= 12; t++) {
        const u = t / 12, m2 = 1 - u;
        pts.push([m2 * m2 * v.p.x + 2 * u * m2 * ctrlX + u * u * g.tx,
                 m2 * m2 * v.p.y + 2 * u * m2 * ctrlY + u * u * g.ty]);
      }
      return pts;
    };
    const segCross = (x1, y1, x2, y2, x3, y3, x4, y4) => {
      const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (d === 0) return false;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
      return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
    };
    const rebuildPts = () => full.map((v, i) => curvePts(v, slots[i].g));
    let P = rebuildPts();
    for (let retry = 0; retry < 12; retry++) {
      let hit = null;
      for (let i = 0; i < P.length && !hit; i++)
        for (let j = i + 1; j < P.length && !hit; j++)
          for (let a2 = 0; a2 < 12 && !hit; a2++)
            for (let b2 = 0; b2 < 12 && !hit; b2++)
              if (segCross(P[i][a2][0], P[i][a2][1], P[i][a2 + 1][0], P[i][a2 + 1][1],
                           P[j][b2][0], P[j][b2][1], P[j][b2 + 1][0], P[j][b2 + 1][1])) hit = [i, j];
      if (!hit) break;
      const v = full[hit[1]], old = slots[hit[1]];
      let dist = old.dist + 30, g = null, box = null;
      for (let k = 0; k < 12; k++) {
        const angOff = k === 0 ? 0 : (k % 2 === 1 ? k * 16 : -(k * 16));
        g = geomFor(v, dist, angOff);
        box = textBox(g, widths[hit[1]]);
        if (!overlap(box)) break;
        dist += 26;
      }
      slots[hit[1]] = { g, box, dist };
      boxes[hit[1]] = box;
      P = rebuildPts();
    }

    for (let i = 0; i < n; i++) {
      const { label, p } = visible[i];
      const { g, box } = slots[i];
      const tx = g.tx, ty = g.ty, a = g.a;

      // Short dashed parabola from the part to its close-up label
      this.ctx.strokeStyle = '#2563eb';
      this.ctx.fillStyle = '#2563eb';
      this.ctx.lineWidth = 2.2;
      this.ctx.lineCap = 'round';
      this.ctx.setLineDash([7, 6]);
      // Perpendicular (vertical) control offset keeps the leader a real
      // curve even for the horizontal Ball/Arm labels: it arches up instead
      // of collapsing onto the baseline.
      const ctrlX = (p.x + tx) / 2 + Math.sin(a) * 26;
      const ctrlY = (p.y + ty) / 2 - Math.cos(a) * 26;
      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.ctx.quadraticCurveTo(ctrlX, ctrlY, tx, ty);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Small arrowhead at the TEXT end of the leader
      const ux = g.ux, uy = g.uy;
      const tipX = tx - ux * 9, tipY = ty - uy * 9;
      const px = -uy * 5, py = ux * 5;
      this.ctx.beginPath();
      this.ctx.moveTo(tipX, tipY);
      this.ctx.lineTo(tipX + px, tipY + py);
      this.ctx.lineTo(tipX - px, tipY - py);
      this.ctx.closePath();
      this.ctx.fill();

      // Pure blue handwritten text, aligned away from the part
      this.ctx.textAlign = box.align;
      this.ctx.fillText(label.name, box.align === 'left' ? tx + 14 : box.align === 'right' ? tx - 14 : tx, ty);
    }
    this.ctx.restore();
  }

  // ---- Tour step 6 drag hint: animated arrow + text over the cup ----
  showDragHint(pos) {
    this.dragHintPos = pos ? pos.clone() : null;
  }

  hideDragHint() {
    this.dragHintPos = null;
  }

  drawDragHint() {
    if (!this.dragHintPos) return;
    const p = this.toScreen(this.dragHintPos);
    const w = this.width, h = this.height;
    const bob = Math.sin(performance.now() / 260) * 8;
    this.ctx.save();
    // Curved parabolic leader in the flight-path style (dashed blue), sweeping
    // from the hint text down to the cup, ending in a downward arrow.  When the
    // cup projects outside the view (rest position sits above the Hero frame),
    // the arrow and text are clamped into the visible canvas so the gesture
    // hint always stays on screen.
    // Leader target: just to the RIGHT of the cup at bowl height, so the arrow
    // points into the bowl without crossing the throwing beam above it (the
    // beam sweeps up-left in Hero view; a vertical arrow from above lands on it).
    const ax = Math.min(w - 70, Math.max(70, p.x + 52));
    let ay = p.y - 4 + bob;
    if (ay < 64) ay = 64 + bob;
    const tx = Math.min(w - 110, Math.max(110, p.x));
    const ty = 112; // fixed handwritten banner, clear of the tour banner
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.fillStyle = '#2563eb';
    this.ctx.lineWidth = 2.6;
    this.ctx.lineCap = 'round';
    this.ctx.setLineDash([7, 6]);
    // Gentle curve: the perpendicular control offset scales with the leader
    // length so it never twists or folds back on itself, whatever the
    // relative position of text and cup.
    const mx = (tx + ax) / 2, my = (ty + ay) / 2;
    const dx = ax - tx, dy = ay - ty;
    const len = Math.hypot(dx, dy) || 1;
    const off = Math.min(38, len * 0.18);
    const ctrlX = mx - (dy / len) * off;
    const ctrlY = my + (dx / len) * off;
    this.ctx.beginPath();
    this.ctx.moveTo(tx, ty + 10);
    this.ctx.quadraticCurveTo(ctrlX, ctrlY, ax, ay + 4);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    // Handwritten hint text in the same blue
    this.ctx.font = '700 21px "Caveat", cursive';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    this.ctx.fillText('Hold the cup, pull down, let go', tx, ty);
    this.ctx.restore();
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

  // Ball weight badge (ball-stand feature): follows the ball wherever it is
  // (stand while unloaded, cup once loaded).  Shown for 2 s after the BALL
  // slider moves or on load, mirroring the counterweight callout.
  setBallWeight(kg, worldPos) {
    this.ballKg = kg;
    if (worldPos) {
      this.ballPos = worldPos.clone();
    }
  }

  // Floating badge next to the iron ball, styled like the counterweight one
  // (glass/parchment + yellow dot) but positioned left so it never overlaps
  // the counterweight badge on screen.
  drawBallWeightCallout() {
    if (!this.ballPos || !this.showBallCallout) return;
    const p = this.toScreen(this.ballPos);
    if (!p.visible) return;

    this.ctx.save();
    const badgeX = p.x - 92;
    const badgeY = p.y - 18;
    const badgeW = 76;
    const badgeH = 26;

    // Connecting pin line from ball to badge
    this.ctx.strokeStyle = 'rgba(120, 110, 95, 0.85)';
    this.ctx.lineWidth = 1.4;
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.ctx.lineTo(badgeX + badgeW, badgeY + badgeH / 2);
    this.ctx.stroke();

    // Origin dot on the ball
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
    this.ctx.fillText(`${this.ballKg.toFixed(2)} kg`, badgeX + 18, badgeY + badgeH / 2);

    this.ctx.restore();
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
    this.stats.range = `${rangeDist.toFixed(2)}m`; // e.g. 2.69m, matches panel mm value
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

    // 1.5 Tour part labels (step 5)
    this.drawPartLabels();

    // 1.6 Tour drag hint (step 6)
    this.drawDragHint();

    // 2. Draw Floating Weight Callout Badge next to black counterweight box
    this.drawWeightCallout();

    // 2.5 Ball weight badge (ball-stand feature)
    this.drawBallWeightCallout();

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

        // Range (the fixed 31° launch angle is intentionally not annotated:
        // it is geometry-determined and identical every shot)
        this.ctx.font = '700 23px "Caveat", cursive';
        this.ctx.fillText(this.stats.range, midP.x - 15, midP.y - 18);

        this.ctx.restore();
      }
    }
  }
}
