// spec.js — runtime single source of truth. Imports spec.json.
import spec from '../spec.json' with { type: 'json' };

export const SPEC = {
  ...spec,
  gravity: spec.world.gravity,
  pendulumLength: spec.physics.pendulumLength,
  ballRadius: spec.physics.ballRadius,
  restitution: spec.physics.restitution,
  ballCount: spec.geometry.ballCount,
};
