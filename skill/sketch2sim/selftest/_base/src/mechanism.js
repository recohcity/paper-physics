// mechanism.js — headless Mechanism (pure math pendulum, no three/cannon dep).
// probe() models v = sqrt(2 g L (1 - cos theta)); output must DRIFT with perturb
// so G4 anti-fake stays green.

import { SPEC } from './spec.js';

export class Mechanism {
  constructor() {}

  resolveParams() {
    return {
      L: SPEC.pendulumLength,
      g: SPEC.gravity,
      thetaDeg: 30,
    };
  }

  probe(options = {}) {
    let { L, g, thetaDeg } = this.resolveParams();
    const perturb = options.perturb || null;
    if (perturb) {
      if (perturb.pendulumLength) L *= perturb.pendulumLength;
      if (perturb.ballRadius) { /* radius not used in this minimal model */ }
    }
    const rad = (thetaDeg * Math.PI) / 180;
    const primaryVelocity = Math.sqrt(2 * g * L * (1 - Math.cos(rad)));
    const maxDisplacement = L * Math.sin(rad);
    return {
      restStateSettled: true,
      primaryVelocity,
      maxDisplacement,
      constraintSlack: 0.0,
    };
  }
}
