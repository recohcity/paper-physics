// main.js — wires spec.js, holds resetAll() and the tour/formula-card contract.
import { SPEC } from './spec.js';
import './environment.js';

const physicsCard = document.getElementById('physics-card');

class Sim {
  constructor() {
    this.body = {
      velocity: { setZero: () => {} },
      angularVelocity: { setZero: () => {} },
    };
    this.L = SPEC.pendulumLength;
  }

  // resetAll contract: zero BOTH linear and angular velocity.
  resetAll() {
    this.body.velocity.setZero();
    this.body.angularVelocity.setZero();
  }

  // Tour: PHYSICS step (i === 4) lights the formula card; BUILD (step === 7) hides it.
  stepTour(i) {
    if (i === 4) {
      // PHYSICS step
      if (physicsCard) physicsCard.style.opacity = '1';
    }
    if (step === 7) {
      if (physicsCard) physicsCard.style.opacity = '0';
    }
  }
}

export { Sim, SPEC };
