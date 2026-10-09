// spec.js — runtime single source of truth.
// Imports spec.json as the data source; only adds derived values here.
import spec from '../spec.json' with { type: 'json' };

export const SPEC = {
  ...spec,
  gravity: spec.world.gravity,
  pendulumLength: spec.physics.pendulumLength,
  ballRadius: spec.physics.ballRadius,
  restitution: spec.physics.restitution,
  airDrag: spec.physics.airDrag,
  angleLimit: spec.physics.angleLimit,
  ballCount: spec.geometry.ballCount,
  groupOrigin: spec.geometry.groupOrigin,
  densities: {
    steel: spec.materials.steel.density,
    plastic: spec.materials.plastic.density,
  },
};
