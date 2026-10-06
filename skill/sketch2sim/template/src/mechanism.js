// ★ The only project-specific file. Implement this interface.
// The shell (main.js) owns rendering, camera, lighting, desk, tour/build mode.
// You own only what is specific to THIS mechanism.
//
// constructor(scene, spec)  — build meshes from spec
// reset()                   — back to rest pose
// action()                  — fire / drive the demo
// setParam(key, value)      — a panel slider changed
// update(dt)                — per-frame hook

export class Mechanism {
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    // TODO: build your mechanism here.
  }
  reset() {}
  action() {}
  setParam() {}
  update(dt) {}
}
