// ★ The ONLY project-specific file. Implement this interface.
// The shell (main.js / environment.js / audio.js / textures.js) owns rendering,
// camera, the 3-point light rig, the desk, tour/build mode and resetAll().
// You own only what is specific to THIS mechanism.
//
// FROZEN CONTRACT (see references/antifake-probe-discipline.md + architecture §3.1):
//   constructor(world, scene, spec)
//       world: CANNON.World | null — null in headless tests (probe builds its own)
//       scene: THREE.Group  | null — null in headless tests
//       spec:  the single runtime source of truth (src/spec.js -> ../spec.json)
//   reset()              — back to rest pose; ALSO zero every body's linear AND
//                          angular velocity (this is what resetAll() relies on)
//   action()             — fire / drive the demo
//   setParam(key, value) — a panel slider changed; must reach the runtime body
//   update(dt)           — per-frame hook (fixed-step physics independent of render rate)
//   probe(options)       — HEADLESS feature packet, no DOM / no renderer.
//                          When world/scene are null, self-build a headless
//                          CANNON.World, load bodies+constraints, step pure dt.
//                          Return the bag below; tests read ONLY this, never privates.

export class Mechanism {
  constructor(world, scene, spec) {
    this.world = world;   // may be null headless
    this.scene = scene;   // may be null headless
    this.spec = spec;
    // TODO: build your mechanism here. In headless mode (world==null) do NOT touch
    // scene; just record spec for probe() to rebuild a cannon world.
  }

  reset() {}
  action() {}
  setParam() {}
  update(dt) {}

  // Headless verification probe. Replace with the domain's real quantities.
  // options = { stepCount: 120, dt: 1/60, perturb: null }
  probe(options = {}) {
    return {
      kineticEnergy: 0,        // J
      potentialEnergy: 0,     // J
      totalEnergyDrift: 0,     // % drift without damping
      momentumVector: [0, 0, 0],
      primaryVelocity: 0,     // m/s (launch speed / impact speed, domain-specific)
      restStateSettled: true,
      maxDisplacement: 0,     // m (throw range / travel)
      constraintSlack: 0,      // %
      propCollisions: [],      // [{ actor, prop, penetrationDepth }]
    };
  }
}
