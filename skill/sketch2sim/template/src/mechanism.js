// ★ THE ONLY NEW FILE PER PROJECT.
// Implement this interface. The shell (main.js) owns rendering, camera, mode switching
// and panel wiring; you own only what is specific to THIS mechanism.
//
// constructor(scene, world, spec)  — build meshes + physics bodies from spec
// reset()                         — back to rest pose
// action()                        — fire / drop / drive the demo action
// setParam(key, value)            — a panel slider changed
// readout()                       — array of [label, value] rows for the stats grid
// tourSteps()                     — array of {caption, apply()} for tour mode (optional)
// update(dt)                      — per-frame hook (rarely needed if shell steps the world)

export class Mechanism {
  constructor(scene, world, spec) {
    this.scene = scene;
    this.world = world;
    this.spec = spec;
    // TODO: build your mechanism here.
  }
  reset() {}
  action() {}
  setParam() {}
  readout() { return []; }
  tourSteps() { return []; }
  update() {}
}
