// spec.js — runtime single source of truth
// Imports spec.json as the data source; only adds derived/visual constants here.
import spec from '../spec.json' with { type: 'json' };

export const SPEC = spec;

// --- Derived mechanism constants (visual + inertial, metres) --------------
export const MECH = {
  arm_x1: spec.physics.armLongX,   // -0.596 long-arm physical extent
  arm_x2: spec.physics.armShortX,  // 0.17 short-arm end (4:1 lever)
  arm_ty: 0.042,                   // beam thickness y
  arm_dz: 0.034,                  // beam depth z
  rho: 160,                       // balsa density kg/m^3
  cup_x: -0.65,
  cup_y: 0.021,
  cup_ri: 0.05,
  cup_ro: 0.07,
  ball_x: -0.65,
  ball_y: 0.017,
  ball_r_default: 0.03,
  pin_x: 0.155,
  hang: 0.10,
  box: 0.13,
};

// --- Visual geometry --------------------------------------------------------
export const GEOM = {
  SHORT_ARM: spec.physics.armShortX,
  LONG_ARM: 0.62,
  CW_HANG: MECH.hang,
  apexX: 0.02,
  apexY: 0.5964,
  REST_ANGLE: spec.physics.restAngle,  // -1.571 rad
  cupR: MECH.cup_ri,
  cupCenterX: -0.62 - 0.05 + 0.02,
  cwPivotX: spec.physics.armShortX - 0.015,
  cwSize: MECH.box,
  deckTopY: 0.10,
  deckThickness: 0.07,
};

// --- UI sliders -------------------------------------------------------------
export const UI = {
  counterweight: { min: spec.inputs[0].min, max: spec.inputs[0].max, value: spec.inputs[0].value, step: spec.inputs[0].step },
  ball:          { min: spec.inputs[1].min, max: spec.inputs[1].max, value: spec.inputs[1].value, step: spec.inputs[1].step },
  pull:          { min: spec.inputs[2].min, max: spec.inputs[2].max, value: spec.inputs[2].value, step: spec.inputs[2].step },
  morph:         { min: 0, max: 100, value: 100, step: 1 },
  zoom:          { min: 60, max: 200, value: 160, step: 5 },
};
