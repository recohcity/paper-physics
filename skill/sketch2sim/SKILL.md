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

0. **Intake.** Before anything else, run the view-requirements checklist in `references/sketch-intake.md`
   part A: how many views, scale anchor, legibility. Ask for what's missing in one message; do not start
   recognition on an image that fails the legibility or scale-anchor checks. Also ask what should be
   validated and which parts move.
1. **Read the sketch part by part.** Follow `references/sketch-intake.md` part B: Claude's own vision does
   the semantic read (what each part is, where joints probably are) and produces the parts/joints/ambiguities
   JSON directly — no separate CV script. A script only does arithmetic downstream (pixel-to-metre, Spec
   assembly), never the recognition itself.
2. **Write the Spec** (`references/spec-schema.md`). Follow `references/sketch-intake.md` part C: turn the
   ambiguities from step 1 into batched, guess-first questions and get the user to confirm or correct them.
   `scale.status` must be `"OK"` before continuing. Anything left unanswered becomes an `assumed` entry.
3. **Feasibility gate** (next section). Stop and report if it fails.
4. **Reference solution.** Solve the mechanism analytically or with a small custom integrator
   (`scripts/mech2d.mjs` is the pattern: Lagrangian, RK4, energy-drift check). This is ground truth for step 5.
5. **Engine build and cross-check.** Build bodies and constraints from the Spec (Three.js + Cannon-es). For
   the hinged-lever template, run the Cannon-es build and the reference solver on the same inputs and require
   agreement within ~5% on launch speed and angle: `scripts/cannon_trebuchet.mjs` (single point) and
   `scripts/xcheck_suite.mjs` (regression suite, grids generated from the Spec's input ranges — re-run
   whenever those ranges change, old passes do not carry over, `physics-pitfalls.md` #18). Any larger gap
   means a modeling or engine-setup bug — see `references/physics-pitfalls.md` items 12-13 for the two bugs
   this caught, and item where a widened range exposed a genuine ~2 degree engine release-angle bias that was
   reported as FAIL rather than masked. The 5% gate covers the engine build vs the reference solver (both
   240 Hz fixed-step); a browser build that samples release on 60 Hz rAF frames carries ~±7% sampling bias
   and needs its own baseline (checklist V2 note). For a new mechanism template, write its reference solver
   and engine build first; the cross-check is what makes the engine trustworthy, so do not skip it.
6. **Sweeps.** Sweep the design inputs headlessly (`scripts/sweep_trebuchet.mjs`, grids generated from the
   Spec), find sensitivity and failure regions, and search for parameter changes that fix a failing design
   (`scripts/search_fix.mjs`).
7. **Interaction and instruments.** Direct manipulation (drag = temporary override, release = hand back to
   dynamics), input ranges derived from geometry, live readouts, slow motion, replay, view presets. For
   tours, part labels, hotspots and any scene prop the user can interact with, run checklist items T1-T7
   (anchors from real mesh positions, deterministic label layout, explicit step end conditions, static end
   state, real colliders for every scene prop, decorative parts decoupled from dynamics, compound gestures
   complete in one pointer session). Before slow-mo/replay demos, run P7 (staged collision activation for
   a projectile that starts overlapping the launcher) and the event-driven replay end condition (T3,
   pitfall 23).
8. **Code architecture.** Keep one runtime source of truth (`src/spec.js` pattern: physics / 3D / UI read
   the same module that mirrors the Spec), split controller files that exceed ~800 lines, and remove stale
   comments and temp hooks. Run `references/architecture-checklist.md`; a refactor must not move the physics
   numbers (re-run the cross-check and a browser launch before/after).
9. **Report** using the template below. Export `spec.json` next to the build.

Steps 0-2 are the only ones that differ when auditing an existing project instead of starting from a sketch:
skip straight to extracting a Spec from the code (`source.kind: "code-extraction"`, see "Auditing an existing
demo" below) and rejoin at step 3.

## Scripts (all are template-specific: hinged_lever_with_hanging_counterweight)

- `scripts/mech2d.mjs` — rigid reference solver (Lagrangian 2-DOF + RK4), exports `simulate()` and `fitted()`.
- `scripts/sweep_trebuchet.mjs` — feasibility sweeps; grids read from the Spec's `mass_range`/`default_mass`
  and `counterweight_kg`/`ball_kg` inputs, so a range change re-runs correctly without editing the script.
- `scripts/search_fix.mjs` — grid search for parameter changes that hit the Spec target.
- `scripts/cannon_trebuchet.mjs` — Cannon-es hinge build, single-point cross-check vs `mech2d.mjs` (V2).
- `scripts/xcheck_suite.mjs` — V2 regression suite: the original audit-fix variants (regression history) plus
  a product-range family generated from the Spec. Requires `cannon-es`; install it outside the skill and run
  with `NODE_PATH`, e.g. `mkdir -p /tmp/cannon-xcheck && cd /tmp/cannon-xcheck && npm init -y && npm install
  cannon-es`, then `NODE_PATH=/tmp/cannon-xcheck/node_modules node scripts/xcheck_suite.mjs
  examples/trebuchet.spec.json`.
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
3. Gate results and reference-vs-engine agreement (V2: cite `xcheck_suite.mjs` output, both variant families).
4. Sensitivity: which parameters move the outcome most.
5. Verdict using the vocabulary above.
6. **Not modeled** list.
7. Suggested design changes, each verified by the reference solver.

## Lite edition (single HTML, for onboarding)

Same Spec, reduced fidelity: one sketch, simplified physics, no cross-check, no overlay check. Delivery
checks before calling it done:

- Shows a visible "demonstration grade" badge; must **not** issue a feasibility verdict.
- Exports `spec.json` next to the build with `scale.status` and every load-bearing quantity's provenance.
- Lists what the full local workflow adds (multi-view intake, overlay check, sweeps, feasibility report).
- Confirms the hosting environment's allowed CDNs actually serve the physics libraries before promising it.

## Auditing an existing demo

Run `references/audit-checklist.md` against the project. Extract a Spec from its code (see
`examples/trebuchet.spec.json`), run the gate and sweeps on the extracted Spec, and file findings with
evidence. Worked example: `audit/paper-trebuchet-audit.md`.

## References

- `references/sketch-intake.md` view requirements, recognition output format, ambiguity confirmation protocol (workflow steps 0-2)
- `references/mechanism-templates.md` known mechanism classes and the feasibility gate for each; check before deriving a new gate
- `references/spec-schema.md` fields, provenance, validation rules
- `references/architecture-checklist.md` code-quality checks (single source of truth in code, module boundaries, stale residue); run when building or refactoring the interactive build
- `references/physics-pitfalls.md` engine and modeling pitfalls with evidence
- `references/capability-guide.md` what sketch types this skill can validate, what it cannot, and how to choose (read first when handed a new sketch)
- `references/audit-checklist.md` checkable items for building or auditing

## Status (be honest with users)

Validated on one case (paper-trebuchet), always via code-extraction (`source.kind: "code-extraction"`) —
every run so far started from existing code, never a real sketch. Spec extraction, reference solver, energy
check, sweeps, fix search, audit checklist, and the V2 engine cross-check are all proven this way, across
multiple rounds that landed real cannon-es modeling bugs (pitfalls 12-13), a declared-value-never-reaches-
runtime bug (M6), a background-tab rAF freeze artifact (P6), an architecture pass (A1-A9), an interaction
layer pass (T1-T7), and a case where widening the input range re-opened the cross-check and surfaced a
genuine ~2 degree engine release-angle bias, reported as FAIL rather than masked (physics-pitfalls #18, #V2
scripts now grid-generate from the Spec instead of hardcoding a range, so this doesn't silently go stale
again). All of that is real, but all of it is single-case and starts from code, not a drawing.

**Workflow steps 0-2 (sketch -> Spec) now have a written procedure** (`references/sketch-intake.md`): view
requirements, a part-by-part recognition output format, and an ambiguity-confirmation protocol. This closes
the gap where the skill's own workflow listed step 1 as "planned" while every actual run skipped it via
code-extraction. **It has not been run on a real sketch yet** — treat it as a first draft that the first real
sketch will correct, not as validated. The overlay fidelity check (render the build from the sketch's view,
diff against it) is designed in principle in `sketch-intake.md` but not built.

**First real sketch has now been run** (chat, 1648 Wilkins lodestone perpetual-motion design — not the
trebuchet): steps 0-1 exercised the intake checklist and the recognition JSON on a genuine hand-drawn-style
image with no scale anchor and no dimensions. It surfaced a real gap immediately — the recognition schema
had `joints` but nothing for a track-follower or a non-contact force, which this mechanism is entirely made
of — closed by adding `guides[]`/`fields[]` to the schema (`spec-schema.md`, `sketch-intake.md`) and a new
`references/mechanism-templates.md` cataloging feasibility gates per mechanism class. This case also proved
a gate can be *scale-independent* (a monotonicity argument, no reference solver, no sweep) where the
trebuchet's gates always needed numbers — useful evidence the workflow isn't secretly numeric-only. Not yet
done for this case: a Spec/report file (the verdict was reached and is recorded above, but not filed the way
`audit/paper-trebuchet-audit.md` files the trebuchet's); steps 2 (ambiguity confirmation) and beyond were
skipped because the case resolved at step 3 without needing them.

Still pending: (1) a sketch that goes all the way through steps 2 onward (ambiguity confirmation, Spec
write, and — for a feasible design — the engine build and interaction layer) since the Wilkins case never
needed to; (2) a mechanism template that needs a genuinely new *numeric* gate (not scale-invariant like
either case so far); (3) the overlay fidelity check, still undesigned in detail beyond the one paragraph in
`sketch-intake.md`. Do not describe any of these as done.
