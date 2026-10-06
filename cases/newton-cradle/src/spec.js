// spec.js — single runtime source of truth for Newton's cradle.
// Mirrors spec.json. Imported by mechanism.js.

export const SPEC = {
  name: 'newton-cradle',
  gravity: 9.81,
  pendulumLength: 0.343,
  ballRadius: 0.0247,
  restitution: 0.97,
  airDrag: 0.01,
  angleLimit: Math.PI / 2 - 0.02,
  ballCount: 5,
  densities: {
    steel: 7850,
    plastic: 1050,
  },
  groupOrigin: { x: 0.12, y: 0, z: 0 },
};
