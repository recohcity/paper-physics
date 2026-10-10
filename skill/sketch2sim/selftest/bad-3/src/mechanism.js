// Bad-3: fake physics — probe() returns a hard-coded constant regardless of
// perturb. G3 passes (constant is well-formed) but G4 anti-fake must catch
// that +10% pendulumLength produced zero drift.

import { SPEC } from './spec.js';

export class Mechanism {
  constructor() {}

  resolveParams() {
    return { L: SPEC.pendulumLength, g: SPEC.gravity, thetaDeg: 30 };
  }

  probe(options = {}) {
    // Deliberately IGNORES options.perturb entirely.
    return {
      restStateSettled: true,
      primaryVelocity: 1.0, // hard-coded constant
      maxDisplacement: 0.175, // hard-coded constant
      constraintSlack: 0.0,
    };
  }
}
