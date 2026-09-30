---
name: sketch2sim
description: >-
  Turn a hand-drawn sketch or drawing of a mechanism, product or structure into an interactive 3D model
  with physics, and validate whether the design is physically feasible before it is built. 中文触发词：
  草图转仿真、图纸验证、机构可行性验证、物理演示审计、投石机/杠杆/连杆/铰链/抛射类机构“能不能动起来、
  能不能把东西扔出去、结构稳不稳”的验证，现有物理 demo 的物理真实性审计，sketch to sim / mechanism
  validation / physics demo audit。Use when the user wants a sketch, blueprint or concept drawing "brought
  to life", wants a mechanism (levers, linkages, launchers, hinges, stability, impact) validated visually
  and interactively, or wants an existing physics demo audited for physical validity. Not for
  strength/fatigue/thermal/fluid analysis (needs FEA) and not for purely decorative 3D.
---

# sketch2sim

Sketch -> Spec -> 3D model -> physics -> interactive validation. The value is not the 3D model; it is a
**checkable Spec** and a **feasibility verdict that can be trusted**. A model that looks right but cannot
physically work is worse than no model, because it will be believed.

## Non-negotiable principles

1. **The Spec is the contract.** Sketch textures, 3D geometry and physics bodies are all generated from one
   Spec. Never hand-write the same dimension in two places.
2. **Every physical quantity carries provenance**: `declared` (user said so), `measured` (from the sketch, with
   scale anchor), `derived` (computed from others), `assumed` (the agent's guess, user must see it), or `fitted`
   (tuned to look right). `fitted` quantities may exist only in a demonstration-grade build and must be
   listed in the report. A verdict of "feasible" is forbidden while any load-bearing quantity is `fitted`.
3. **Mechanism dynamics come from bodies, joints and masses, never from a hand-written formula.** If changing
   an arm length in the Spec does not change the result, the model is not validating anything.
4. **Run the feasibility gate before building UI** (below). It takes minutes and catches designs that cannot work.
5. **State what is not modeled.** Rigid-body physics does not cover strength, fatigue, material flex, heat,
   fluids or manufacturing tolerance. Say so in every report.
6. **Respect natural mechanics; never fake it with guard code.** A "cannot fire / not ready / inverted"
   state must come from real torques, masses and collision limits — the default parameter set is what keeps
   the mechanism ready (driver torque > payload torque), not a logic lock. If the player's combination makes
   the beam tilt the wrong way, let it tilt: the physics decides throwability. The only acceptable hard stops
   are collision behaviours (arm-to-chassis, cup-to-deck).
7. **Decorative parts are visual-follow, never force-follow.** Ropes, winches, drums, hand cranks, dials and
   indicators must not transmit force and must not carry a collider that touches the throw. Their motion is a
   kinematic mapping of a real state (arm angle -> rope length / drum rotation / direction sign). Changing a
   decorative part must not change any launch readout (checklist T6).

## Workflow (local / Claude Code route)

0. **Intake.** Collect all views available (ask for side/top views). Ask: what should be validated, the scale
   anchor (one known real dimension), materials, and which parts move.
1. **Read the sketch part by part.** Vision for semantics (what each part is, where joints probably are);
   scripts for measurement (contours, circles, OCR of dimension marks). Output parts with pixel coordinates
   and a confidence per part. *(status: planned, see Status)*
2. **Write the Spec** (`references/spec-schema.md`). Convert pixels to metres with the anchor. List every
   ambiguity (joint type, thickness, material, hidden dimensions) and get the user to confirm or correct
   them before continuing. Ambiguities left unresolved become `assumed` entries.
3. **Feasibility gate** (next section). Stop and report if it fails.
4. **Reference solution.** Solve the mechanism analytically or with a small custom integrator
   (`scripts/mech2d.mjs` is the pattern: Lagrangian, RK4, energy-drift check). This is ground truth for step 5.
5. **Engine build and cross-check.** Build bodies and constraints from the Spec (Three.js + Cannon-es). For
   the hinged-lever template, run the Cannon-es build and the reference solver on the same inputs and require
   agreement within ~5% on launch speed and angle: `scripts/cannon_trebuchet.mjs` (single point) and
   `scripts/xcheck_suite.mjs` (regression suite). Any larger gap means a modeling or engine-setup bug —
   see `references/physics-pitfalls.md` items 12-13 for the two bugs this caught. The 5% gate covers the
   engine build vs the reference solver (both 240 Hz fixed-step); a browser build that samples release on
   60 Hz rAF frames carries ~±7% sampling bias and needs its own baseline (checklist V2 note). For a new
   mechanism template, write its reference solver and engine build first; the cross-check is what makes
   the engine trustworthy, so do not skip it.
6. **Sweeps.** Sweep the design inputs headlessly (`scripts/sweep_trebuchet.mjs`), find sensitivity and
   failure regions, and search for parameter changes that fix a failing design (`scripts/search_fix.mjs`).
7. **Interaction and instruments.** Direct manipulation (drag = temporary override, release = hand back to
   dynamics), input ranges derived from geometry, live readouts, slow motion, replay, view presets. For
   tours, part labels, hotspots and any scene prop the user can interact with, run checklist items T1-T7
   (anchors from real mesh positions, deterministic label layout, explicit step end conditions, static end
   state, real colliders for participating props, decorative parts decoupled from dynamics, one-pointer
   compound interactions). Before slow-mo/replay demos, run P7 (staged collision activation for a projectile
   that starts overlapping the launcher) and the event-driven replay end condition (T3, pitfall 23).
8. **Code architecture.** Keep one runtime source of truth (`src/spec.js` pattern: physics / 3D / UI read
   the same module that mirrors the Spec), split controller files that exceed ~800 lines, and remove stale
   comments and temp hooks. Run `references/architecture-checklist.md`; a refactor must not move the physics
   numbers (re-run the cross-check and a browser launch before/after).
9. **Report** using the template below. Export `spec.json` next to the build.

## Scripts (all are template-specific: hinged_lever_with_hanging_counterweight)

- `scripts/mech2d.mjs` — rigid reference solver (Lagrangian 2-DOF + RK4), exports `simulate()` and `fitted()`.
- `scripts/sweep_trebuchet.mjs` — feasibility sweeps over mass/pull/release; reads the Spec.
- `scripts/search_fix.mjs` — grid search for parameter changes that hit the Spec target.
- `scripts/cannon_trebuchet.mjs` — Cannon-es hinge build, single-point cross-check vs `mech2d.mjs` (V2).
- `scripts/xcheck_suite.mjs` — V2 regression suite over the audit's fix variants; requires `cannon-es`.
  Install it outside the skill and run with `NODE_PATH`, e.g. `mkdir -p /tmp/cannon-xcheck && cd /tmp/cannon-xcheck
  && npm init -y && npm install cannon-es`, then `NODE_PATH=/tmp/cannon-xcheck/node_modules node
  scripts/xcheck_suite.mjs examples/trebuchet.spec.json`.
- New mechanism templates need their own reference solver and engine build; these scripts do not transfer.

## Feasibility gate (do this first, cheap and decisive)

For any mechanism that stores energy and throws, lifts or moves something:

- **Static balance:** at the start pose and along the travel, is the net torque of the driver larger than
  the opposing torque of the payload plus structure? If the payload side outweighs the driver at any angle
  the mechanism stalls there.
- **Energy budget:** driver potential energy released, minus payload potential energy gained, minus
  structure potential energy gained, must exceed the payload kinetic energy the design claims.
  Payload speed is bounded by `v <= sqrt(2*E_available/m_payload)`.
- **Ratios, not absolutes:** feasibility depends on mass ratio x lever ratio, so it holds at any consistent scale.

If either check fails, do not build the interactive model as a "working" design. Report the failure, the
numbers, and use `search_fix.mjs`-style search to propose parameter changes that pass.

## Verdict vocabulary (what the report may claim)

| Evidence | Allowed claim |
|---|---|
| Spec only, geometry matches sketch overlay | "Geometrically consistent with the sketch" |
| + gate passes, reference solver agrees with engine | "Kinematically and dynamically plausible at concept level" |
| + sweeps show margin around the operating point | "Feasible within the modeled assumptions" |
| any load-bearing `fitted` quantity | "Demonstration only. Not a feasibility result." |

## Report template

1. Scope: what was validated, scale anchor and how it was chosen.
2. Assumptions table: every `assumed` and `fitted` item with its value.
3. Gate results and reference-vs-engine agreement (V2: cite `xcheck_suite.mjs` output).
4. Sensitivity: which parameters move the outcome most.
5. Verdict using the vocabulary above.
6. **Not modeled** list.
7. Suggested design changes, each verified by the reference solver.

## Lite edition (single HTML, for onboarding)

Same Spec, reduced fidelity: one sketch, simplified physics, no CV extraction, no cross-check. Delivery
checks before calling it done:

- Shows a visible "demonstration grade" badge; must **not** issue a feasibility verdict.
- Exports `spec.json` next to the build with `scale.status` and every load-bearing quantity's provenance.
- Lists what the full local workflow adds (measurement, overlay check, sweeps, feasibility report).
- Confirms the hosting environment's allowed CDNs actually serve the physics libraries before promising it.

## Auditing an existing demo

Run `references/audit-checklist.md` against the project. Extract a Spec from its code (see
`examples/trebuchet.spec.json`), run the gate and sweeps on the extracted Spec, and file findings with
evidence. Worked example: `audit/paper-trebuchet-audit.md`.

## References

- `references/spec-schema.md` fields, provenance, validation rules
- `references/architecture-checklist.md` code-quality checks (single source of truth in code, module boundaries, stale residue); run when building or refactoring the interactive build
- `references/physics-pitfalls.md` engine and modeling pitfalls with evidence
- `references/audit-checklist.md` checkable items for building or auditing

## Status (be honest with users)

Validated on one case (paper-trebuchet): Spec extraction, reference solver, energy check, sweeps, fix search,
audit checklist, and the V2 engine cross-check (`xcheck_suite.mjs`, 5/5 variants within ~5% on speed and
angle). The audit has since survived six rounds: V2 cross-check landed the two cannon-es modeling bugs
(pitfalls 12-13); V3 added checklist items M6 (declared values must reach runtime bodies — the
"2.60 kg default never reached physics" inversion) and P6 (background-tab rAF freeze artifact), plus the
front-end sampling-bias note on V2 (~±7% at 60 Hz rAF release sampling); V4 ran the architecture checklist
(`src/spec.js` single source of truth, A1-A9); V5 (interaction layer) added T1-T5 (real-mesh label anchors,
deterministic non-overlapping layout, explicit replay end conditions, static tour end state, colliders for
participating scene props) and pitfalls 16-17. V6 (physics-fidelity round, 2026-10-01) added principles 6-7
(natural mechanics without guard code; decorative parts visual-follow only), checklist P7 (staged collision
activation for a projectile overlapping the launcher), T6 (decorative parts never affect launch readouts),
T7 (compound interactions complete in one pointer session), extended T3 (event-driven replay end condition,
pitfall 23) and T5 (whole-scene blocking), and pitfalls 21-23. All still single-case evidence; a second mechanism type
(linkage / stability class) is the planned next pressure test. Not yet built: CV-based sketch extraction,
overlay fidelity check, UI scaffold. Do not describe planned steps as if they were available.
