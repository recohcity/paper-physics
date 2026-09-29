// ---------------------------------------------------------------------------
// spec.js — 运行时单一数据源 (single source of truth)
//
// Mirrors skill/sketch2sim/examples/trebuchet.spec.json.  Every physical
// dimension, geometry constant, UI slider range and display unit is written
// HERE once; physics.js / trebuchet.js / main.js import from this module.
// Do NOT hand-write the same number in two places (sketch2sim principle 1).
//
// Provenance tags follow the skill vocabulary: declared / measured / derived /
// assumed / fitted.  Numbers here must match the Spec file; change both in sync.
// ---------------------------------------------------------------------------

// --- Mechanism (physics bodies + 3D model, metres) -------------------------
// LONG_ARM is the visual beam length; MECH.arm_x1 is the physical material
// extent used for mass/inertia. They differ by design (the cup overhangs the
// beam end); keep the gap documented rather than silently equal.
export const MECH = {
  arm_x1: -0.596,   // long-arm physical extent (mass/inertia)  [code-extraction]
  arm_x2: 0.315,    // short-arm end (counterweight side)      [code-extraction]
  arm_ty: 0.042,    // beam thickness y                         [code-extraction]
  arm_dz: 0.034,    // beam depth z                             [code-extraction]
  rho: 160,         // balsa density kg/m^3                     [assumed:balsa]
  cup_x: -0.65,     // cup centre, arm-local                     [code-extraction]
  cup_y: 0.021,
  cup_ri: 0.05,     // cup inner radius (bore 100 mm)           [code-extraction]
  cup_ro: 0.07,
  ball_x: -0.65,    // ball rest centre, arm-local               [code-extraction]
  ball_y: 0.017,
  ball_r_default: 0.03, // 0.45 kg -> 60% of cup bore           [derived]
  pin_x: 0.30,      // counterweight hanger pin on the arm      [code-extraction]
  hang: 0.10,       // hanging link length                      [code-extraction]
  box: 0.13,        // counterweight box size                   [code-extraction]
};

// --- Geometry (3D model, metres) -------------------------------------------
export const GEOM = {
  SHORT_ARM: 0.315,     // visual short arm (== MECH.arm_x2)
  LONG_ARM: 0.62,       // visual long arm (== -MECH.arm_x1 + 0.024 overhang)
  CW_HANG: 0.10,        // == MECH.hang
  apexX: 0.02,
  apexY: 0.5964,        // pivot height: box bottom = apexY - 0.476 = 0.1204,
                        // 20 mm hover gap above deckTopY           [fitted:hover]
  REST_ANGLE: -1.00,    // rad; releases the ball at ~31°           [fitted]
  cupR: 0.05,           // == MECH.cup_ri (visual)
  cupCenterX: -0.62 - 0.05 + 0.02, // derived: -LONG_ARM - cupR + 0.02
  cwPivotX: 0.315 - 0.015,        // derived: SHORT_ARM - 0.015 (hanger pin)
  cwSize: 0.13,         // == MECH.box (visual box)
  deckTopY: 0.10,       // deck box top surface
  deckThickness: 0.07,  // thickened deck box: y in [0.03, 0.10]
};

// --- UI sliders (mirror index.html and the Spec inputs) --------------------
export const UI = {
  counterweight: { min: 1.40, max: 3.00, value: 2.60, step: 0.01 }, // sand full = 3.0
  ball:          { min: 0.30, max: 0.60, value: 0.45, step: 0.01 },
  pull:          { max: 84.5 },   // derived: cradle-bottom touches paper
  morph:         { min: 0, max: 100, value: 100, step: 1 },
  zoom:          { min: 60, max: 200, value: 160, step: 5 },
};
