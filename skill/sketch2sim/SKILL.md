---
name: sketch2sim
description: >-
  Turn a hand-drawn sketch / photo of a mechanism, product or structure into an interactive 3D model
  with physics, and say whether it actually works. 面向普通用户的简洁触发词：画个机器、帮我做出来、
  把这张图变成 3D、这个能不能动、这个稳不稳、投石机/投石车/永动机/牛顿摆/机械臂/小发明 做个动画、
  这图纸能造吗。面向专业用户的触发词：草图转仿真、机构可行性验证、物理 demo 真实性审计、
  刚体动力学快速验证、杠杆/连杆/铰链/抛射/升降/夹持机构。Use when the user uploads a sketch,
  blueprint or photo of a device and wants it brought to life in 3D with physics, or wants to know
  whether it can physically work. Not for strength/fatigue/thermal/fluid FEA, nor purely decorative 3D.
---

# sketch2sim

Sketch -> Spec -> 3D model -> physics -> interactive validation. The deliverable is not the 3D model;
it is a **checkable Spec** and a **feasibility verdict that can be trusted**. A model that looks right
but cannot physically work is worse than no model, because the user will believe it.

## Who the user is

The user brings intent + a drawing, not a specification. They often have no engineering, mechanical or
motor background. Treat the request as an expert engineer would: make the professional judgment, and
only hand back the decisions that are genuinely theirs. Never hide behind "the user said X" to ship a
fake build.

## Non-negotiable principles

1. **The Spec is the contract.** Sketch textures, 3D geometry and physics bodies are all generated from
   one Spec. Never hand-write the same dimension in two places.
2. **Every physical quantity carries provenance**: `declared` (user said so), `measured` (from the
   sketch, with scale anchor), `derived` (computed from others), `assumed` (your best guess, user must
   see it), or `fitted` (tuned to look right). `fitted` may exist only in a demonstration-grade build
   and must be listed. A verdict of "feasible" is forbidden while any load-bearing quantity is `fitted`.
3. **Dynamics come from bodies, joints and masses, never a hand-written formula.** If changing an arm
   length in the Spec does not change the result, the model is validating nothing.
4. **Run the feasibility gate before building UI.** It takes minutes and catches designs that cannot work.
5. **State what is not modeled.** Rigid-body physics does not cover strength, fatigue, material flex,
   heat, fluids or manufacturing tolerance. Say so in every report.
6. **Never fake mechanics with guard code.** A "cannot move / not ready" state must come from real
   torques, masses and collision limits, not a logic lock. If the player's combination makes the beam
   tilt the wrong way, let it tilt: physics decides. The only hard stops are collision behaviours.
7. **Three object roles, not two.** Classify every object at build time:
   - *Dynamic actor* — moves and transmits force (the lever, arm, projectile): real body, joints, mass.
   - *Static world prop* — anything that just sits there (ceiling bar, base, pencil, eraser, table edge,
     walls). It does not drive anything and has no actuator, but it IS solid: a moving body that reaches it
     must collide and be blocked. Static props get a real static collider in the same commit as their mesh.
     "Decorative" never means "no collider" — it means "it does not move, but it still blocks you".
   - *Visual-follow* — purely mappings of a dynamic state (a rope drawn between anchor and ball, a dial
     needle): kinematic, no independent body, and must never alter any readout.
8. **Every object carries its full physics from the moment it is built — the user must never be the
   tester.** When a mesh is created, its role above is decided in the same commit and the matching physics
   is attached immediately: a dynamic actor gets correct mass/joints; a static world prop gets a real
   collider (the action can hit it); a rope/link uses the physically correct constraint type from the start
   (not a placeholder you will "fix later"); a visual-follow part is explicitly classified as such. No object
   ships as "visual only by accident". Before handoff, run a headless self-check (node or screenshot) proving:
   nothing passes through a static prop, the rest state settles as drawn, and the intended action fires. The
   user finding a ball clipping through the ceiling bar, a body hanging upside-down, or a prop silently not
   blocking means the build was delivered unfinished — treat that as your error, not their feedback.

## Decision ownership (who decides what)

The failure mode this prevents: the user's vague intent is treated as a spec, the skill fills the gaps
with silent guesses, and a plausible-but-wrong model is produced. Cut every decision into one of three:

| Category | Examples | Owner | If wrong |
|---|---|---|---|
| **Expert decides** (never ask) | which physics domain(s) apply, joint type, mass/inertia estimate, which gate, the arithmetic, how a part physically moves | the skill | record as `assumed`, overturnable |
| **Must ask the user** | what exactly is being validated (thrown far? held up? placed accurately?), which parts move vs fixed, acceptance target (payload mass / hit point), trade-offs between incompatible goals | the user | ask once, in one batch |
| **Must stop** (do not push through) | no scale anchor, gate fails, a load-bearing quantity can only be `fitted`, the request conflicts with physics | the skill halts and reports | report numbers, propose options |

Rule of thumb: if a wrong answer changes the verdict or safety **and the user can answer it** -> ask;
if the user cannot answer it -> decide as expert and mark `assumed`; if the whole task cannot stand
without it -> stop.

## Workflow

> **Before each numbered step, read the pitfalls that step is known to trigger**
> (`references/physics-pitfalls.md`). Skim all of them once at intake, then re-read the specific
> numbered pitfalls below before starting that step. Do not start a step until its listed pitfalls
> have been read — this is how the accumulated mistakes turn into checkable gates.

0. **Intake. Do not ask questions — start two workstreams in parallel.**
   - Pitfalls to read before this step: #1, #2, #15.
   - **Workstream A (background, analysis):** parse sketch, materials, requirements; produce (a) a raw requirements list and (b) a numbered list of model/interaction questions to confirm later. Do not block the user on these.
   - **Workstream B (foreground, setup):** immediately copy `template/` to `cases/<slug>/`, drop the user's sketch into `public/`, and boot the shell so that: the project name shows on the panel, **SKETCH** shows the sketch on the A4 sheet, **LIFT** already plays the cutout standing-up animation, zoom/view controls work.
   - **Step gating by readiness (DO NOT hardcode disabled):** the tour step buttons are enabled/disabled dynamically based on what has actually been built:
     - SKETCH + LIFT always available (template ships them).
     - MODEL enabled only after the white 3D model is loaded.
     - MATERIAL enabled only after materials are assigned.
     - PARTS / PLAY / REPLAY / BUILD enabled as soon as any part of the model can move and be interacted with (even a simple drag).
     - `playTour()` runs through whatever steps are currently available and stops at the first unbuilt step.
   - Once Workstream B is up, use Workstream A's question list to confirm model/interaction details in **batches** (expert-then-yes/no, at most 3 questions per batch).
1. **Recognition.** Read the sketch part by part. Native vision does the semantic read; output parts / joints / actuators / guides / fields JSON. **Do not ask the user to classify joints** — that is expert work.
   - Pitfalls: #9, #10.
2. **Spec + ambiguity confirmation.** Write the Spec, confirm ambiguities as expert-then-yes/no. Only ask about things that change the acceptance target. `scale.status` must be `"OK"` before continuing.
   - Pitfalls: #2, #14.
3. **Feasibility gate.** Use the gate of every matching physics domain. Stop and report if it fails.
   - Pitfalls: #3, #4, #5.
4. **Reference solution.** Solve the mechanism analytically or with a small integrator.
   - Pitfalls: #11, #24.
5. **Scaffold.** Already done by Workstream B. Only `src/mechanism.js` is new.
6. **Engine build + cross-check.** Build bodies/constraints from the Spec; run `test/verify.mjs` headlessly before handoff.
   - Pitfalls: #6, #7, #8, #12, #13, #16, #22, #24, #25, #26.
   - **#26 specifically:** the 2D→3D z-unfold tween must be its own variable, not shared with the material morph. MODEL ends with `scale.z = 2` and spheres read as perfect white-clay spheres before MATERIAL touches materials.
7. **Sweeps.** Sweep design inputs headlessly.
   - Pitfalls: #18.
8. **Interaction.** Direct manipulation, live readouts, slow-mo, replay.
   - Pitfalls: #17, #19, #20, #21, #23.
9. **PARTS auto-annotation.** Do NOT ask the user which parts to label. Extract key nodes from the build/interaction and auto-annotate.
10. **Test + report.** tour and build both run clean; report; on user acceptance, lobby auto-adds the new blueprint card.
    - Pitfalls: #17, #23.

For auditing an existing project instead of starting from a sketch, skip straight to extracting a Spec
from the code (`source.kind: "code-extraction"`) and rejoin at step 3.

## Execution supervision (once the task is accepted)

After the intake questions are answered, the skill acts as its own orchestrator and runs the workflow
autonomously to completion. It does not check in with the user between expert steps:

- **Auto-drive steps 3→10** (gate, reference, scaffold, build, verify, sweeps, report). Use headless
  scripts and self-checks; report progress only at the end (or on a real blocker).
- **Only pause for two reasons:** (a) a "must ask the user" item from the decision-ownership table — batch
  it into one message; (b) a "must stop" item — report numbers and options. Never pause on expert decisions.
- **Self-verify before declaring done:** `test/verify.mjs` passes, rest state settles, no clip/inversion,
  engine matches reference. If a check fails, fix it yourself — do not hand the user a broken build.
- **One final summary** when done: what was built, the verdict, assumptions, how to run it.

## Decision ownership vs capability boundary (they are different)

- **Capability boundary** = does this skill take the job at all (capability-guide.md): FEA/strength, pure
  decoration, no-anchor numeric gates are rejected up front.
- **Decision ownership** = once the job is accepted, who picks each value (this page).
  They are not the same: a task can be inside capability yet still need one user decision (what success
  looks like). Resolve capability at intake; resolve ownership per-step through the workflow.


## Gates are per physics domain

Gates are not derived per device. Check `references/mechanism-templates.md` first: each domain
(kinematic chain, field force, track-guided, motor control, …) brings its own gate shape and tooling.
A new domain is warranted only by a new physical theory / math tool — never by a different device shape.

The verdict vocabulary:

| Evidence | Allowed claim |
|---|---|
| Spec only, geometry matches sketch overlay | "Geometrically consistent with the sketch" |
| + gate passes, reference agrees with engine | "Kinematically and dynamically plausible at concept level" |
| + sweeps show margin around the operating point | "Feasible within the modeled assumptions" |
| any load-bearing `fitted` quantity | "Demonstration only. Not a feasibility result." |

Every verdict is scoped to the declared physics-restore level (L0 geometry -> L1 materials -> L2
kinematics -> L3 rigid dynamics -> L4 friction/collision -> L5 fields/drives/control; see
`references/capability-guide.md`).

## Report template

1. Scope: what was validated, scale anchor and how it was chosen.
2. Assumptions table: every `assumed` / `fitted` item with its value.
3. Gate results and reference-vs-engine agreement.
4. Sensitivity: which parameters move the outcome most.
5. Verdict using the vocabulary above.
6. **Not modeled** list.
7. Suggested design changes, each verified by the reference solver.

## Lite edition (single HTML, onboarding)

Same Spec, reduced fidelity: one sketch, simplified physics, no cross-check. Delivery checks:
- visible "demonstration grade" badge; must not issue a feasibility verdict;
- exports `spec.json` with `scale.status` and every load-bearing quantity's provenance;
- lists what the full workflow adds;
- confirms the hosting CDNs actually serve the physics libraries.

## References

- `sketch-intake.md` — view requirements, recognition output format, expert-then-yes/no ambiguity protocol (steps 0-2)
- `mechanism-templates.md` — physics-domain modules, their gates, when to add a new domain
- `spec-schema.md` — fields, provenance, validation rules
- `capability-guide.md` — what/what-not this skill validates, the L0-L5 restore ladder
- `project-delivery.md` — standard project tree, the interactive shell, sketch archiving, self-check (steps 5-10)
- `architecture-checklist.md` — single source of truth, module boundaries, stale residue
- `physics-pitfalls.md` — engine and modeling pitfalls, general rules
- `audit-checklist.md` — checkable items for building or auditing
- `template/` — the reusable Vite shell copied into every new project. The shell (scene, camera, panel,
  tour/build, desk) is reused as-is; each project writes its mechanism, spec, annotations and textures.

## Status (honest)

Distilled and now stress-tested end-to-end once: a hand-drawn Newton's cradle (two sketches, static +
action) went through recognition, the ≤3-question expert-then-yes intake, Spec, analytic reference, build,
and headless cross-check in one run. That run produced two new pitfalls (#24 suspended pendulum chains,
#25 resting contact is the default) and the object-role model (dynamic actor / static world prop /
visual-follow). Earlier builds were rigid-linkage and arm cases, partly from extracted code.
Not yet exercised: overlay fidelity on a dimensioned engineering drawing; sweeps across the full input grid;
a genuinely new physics domain beyond the catalog. Treat every reference as a draft the next real case corrects.
