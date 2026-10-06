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
9. **Tour ⇄ Build switching must reset ALL state.** Every time the user crosses between tour mode and build
   mode — in either direction — call a single `resetAll()` that restores: (a) physics (angles, velocities,
   drag pointers, collision state), (b) all user-overridden materials back to default, (c) panel UI controls
   back to default (slider values, toggle states, material buttons), (d) camera to the default view. Stale
   state leaking across modes (a plastic ball left plastic when re-entering the tour, a mid-swing angle left
   hanging) is a bug, not a feature — the user expects a fresh start every time they switch.
10. **Build panel layout spec.** Compact card, max 3 rows, aligned grid:
    - Sliders: fixed width ~90px (same as trebuchet panel), not flex-grow full width.
    - Buttons in the same column must align vertically (use padding-left offset on second row to align under first).
    - Per-object material toggles: small square buttons (~24×24px), not wide pills.
    - Play/Slow/Reset row: left-aligned next to material toggles, speaker icon right-aligned.
    - No data cards (VELOCITY/PERIOD/ENERGY) — they clutter and the user doesn't read them.
    - Buttons: English labels, `btn-secondary` / `action-btn` style, consistent padding.
11. **Physics info card.** A floating card explaining the governing equations, shown at the PHYSICS tour step
    AND on demand by clicking the title. Rules:
    - Must show: pendulum/dynamics equation, collision formula, constraint type, restitution/damping values.
    - If the build supports per-object material/mass switching, the card must show the general (mass-weighted)
      formula, not just the equal-mass simplification. List material densities.
    - **Tour lifecycle:** card appears at step PHYSICS and stays visible through PLAY and REPLAY — do NOT
      auto-hide when advancing to the next step. Hide it only when entering BUILD mode (step 7) or when the
      user closes it via ×. No `await sleep()` on the card itself; the tour flow proceeds immediately.
    - **On-demand click:** clicking the title or "Physics Info" tag shows the card for 5s then auto-hides.
    - Text must be selectable (`user-select:text`), not decorative.

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

## Workflow — Task Checklist

> **Hard rule:** before starting ANY step, read the pitfalls tagged for that step
> (`references/physics-pitfalls.md`, search by `[stepN]` tag). Do not start until read.
> Every new problem discovered during a build MUST be written back to pitfalls with
> the step tag, and if it is a template-level issue (lighting, panel, reset, lobby),
> it must also be applied to `template/` immediately so the next case starts correct.

### User's role vs agent's role

The user does exactly four things:
1. Submit the sketch / photo and state what they want to validate.
2. Answer the intake Q&A checklist (batched, one message).
3. Approve two confirmation gates (mesh roster, interaction nodes).
4. Accept the final delivery.

Everything else — setup, build, physics, testing, visual polish, lobby integration,
self-checks — is the agent's job. Do not ask the user to run commands, test builds,
or fix styling. Only pause for the three gates below.

### Step 0 — Intake & Scaffold
- **Read pitfalls:** [step0] #1, #2, #15.
- **Agent does (parallel):**
  - Workstream A: parse sketch, produce requirements list + numbered Q&A.
  - Workstream B: copy `template/` to `cases/<slug>/`, drop sketch in `public/`, boot shell.
- **Output:** `cases/<slug>/docs/intake-questions.md` — the Q&A checklist.
- **GATE — ask user:** batch the Q&A (max 3 questions per batch). Wait for answers before step 2.

### Step 1 — Recognition
- **Read pitfalls:** [step1] #9, #10.
- **Agent does:** read sketch part-by-part, output parts/joints/actuators JSON.
- No user pause.

### Step 2 — Spec
- **Read pitfalls:** [step2] #2, #14, #37.
- **Agent does:** write `spec.js`, confirm `scale.status = "OK"`.
- No user pause (ambiguities already resolved in step 0 Q&A).

### Step 3 — Feasibility Gate
- **Read pitfalls:** [step3] #3, #4, #5.
- **Agent does:** run domain gates. If fail, stop and report.
- **GATE — stop:** if gate fails, report numbers and options. Wait for user.

### Step 4 — Reference Solution
- **Read pitfalls:** [step4] #11, #24.
- **Agent does:** analytic or small-integrator reference.

### Step 5 — Scaffold
- Already done by Workstream B. Only `src/mechanism.js` is new.

### Step 6 — Engine Build
- **Read pitfalls:** [step6] #6, #7, #8, #12, #13, #16, #22, #24, #26, #37, #38.
- **Agent does:** build bodies/constraints, cross-check vs reference.
- **GATE — mesh roster:** after GLB loads (and 3s delay per #37), print mesh table
  (name / proposed role / pivot). **Wait for user confirmation** before wiring physics.
  Store the approved roster in `cases/<slug>/docs/mesh-roster.md`.

### Step 7 — Sweeps
- **Read pitfalls:** [step7] #18.
- **Agent does:** headless input sweeps.

### Step 8 — Interaction
- **Read pitfalls:** [step8] #17, #19, #20, #21, #23, #27, #40, #41, #42, #45.
- **Read references:** `references/panel-layout-standards.md` (build panel layout rules).
- **Agent does:** direct manipulation, slow-mo, replay, build panel layout.
- **GATE — interaction nodes:** list draggable meshes, follow chains, collision triggers,
  play/replay auto-fires, AND the build panel card map (which controls in which card,
  card order, flex widths, button sizes). **Wait for user confirmation.** Store in
  `cases/<slug>/docs/interaction-nodes.md`.

### Step 9 — PARTS Annotation
- **Read pitfalls:** [step9] #30.
- **Agent does:** auto-annotate key nodes. Physics card formulas use user-visible params (#43).

### Step 10 — Visual & Reset
- **Read pitfalls:** [step10] #38, #39, #42, #9 (reset), #11 (physics card).
- **Agent does:** apply visual-standards.md verbatim (lighting, desk, panel, banner no-op).
  Implement `resetAll()` for tour⇄build both directions.

### Step 11 — Lobby Integration & Delivery
- **Read pitfalls:** [step11] #35, #39, #40.
- **Agent does:** screenshot sketch, add lobby card, build all cases, write README.
- **GATE — mechanical audit:** run
  `node skill/sketch2sim/scripts/audit-case.mjs cases/<slug>`
  **MUST exit 0** before handoff. This checks spec.json, spec.js wiring,
  docs/ six artifacts, test/verify.mjs — no reliance on memory.
- **GATE — final acceptance:** present the running build. Wait for user to accept or list fixes.

### Audit mode
For an existing project: skip to step 3 (extract spec from code).

## Execution Supervision

After the step 0 Q&A is answered, the agent auto-drives steps 1→11 autonomously:
- Self-test at every step (headless verify, build passes, no clip).
- Only pause at the three gates: step 0 Q&A, step 6 mesh roster, step 8 interaction nodes.
- If a new pitfall is hit mid-build: fix it, write it to `physics-pitfalls.md` with the
  `[stepN]` tag, and if it is template-level (lighting, panel, reset, lobby), apply it to
  `template/` in the same commit. This is how information symmetry is maintained.
- Final summary: what was built, verdict, assumptions, how to run.

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
- `physics-pitfalls.md` — engine, modeling, and UX pitfalls, general rules (#1-#43)
- `visual-standards.md` — **canonical lighting rig, desk material, panel layout, banner, physics card** — copy verbatim to every new case
- `case-onboarding.md` — pre-build, during-build, visual, reset, lobby integration, delivery checklist
- `audit-checklist.md` — checkable items for building or auditing
- `template/` — the reusable Vite shell. Lighting, desk, and no-op banner are pre-configured to visual-standards. Each project writes its mechanism, spec, annotations and textures.

## Status (honest)

Distilled and stress-tested end-to-end twice:
- **Trebuchet** — the original worked example, went through audit fixes V2-V5.
- **Newton's cradle** — second case, validated the workflow but surfaced 7 new UX pitfalls
  (#37-#43): post-load bounding-box timing, standardized lighting rig, fake contact shadows
  for stacked flat objects, drag-vs-click distinction, per-object material/mass switching,
  hover lift height, and physics card formula style. These are now in `visual-standards.md`
  and `case-onboarding.md`.
Not yet exercised: overlay fidelity on a dimensioned engineering drawing; sweeps across the
full input grid; a genuinely new physics domain beyond the catalog. Treat every reference as
a draft the next real case corrects.
