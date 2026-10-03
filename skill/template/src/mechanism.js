import * as THREE from 'three';

// Mechanism interface — fill in per project.
// Required methods:
//   constructor(scene, spec)
//   step(dt)          — advance physics by fixed dt
//   update()          — sync meshes to physics state
//   reset()           — back to initial state
//   readout()         — [energyStr, stateStr]
// Optional:
//   buildPanel(paramSection, actionBar) — inject project-specific controls
//   camera = camera   — set by main.js after construction

export class Mechanism {
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    // TODO: build your mechanism meshes here.
  }

  step(dt) {}
  update() {}
  reset() {}
  readout() { return ['0.000 J', 'rest']; }
}
