# sketch2sim

> Turn a hand-drawn sketch into an interactive 3D physics simulation — and tell you whether it actually works.

Sketch → Spec → 3D model → rigid-body physics → interactive validation.
The deliverable is not a pretty model; it is a **checkable specification** and a
**feasibility verdict you can trust**.

---

## Why this exists

Most physics tools require CAD software or hundreds of lines of setup code. sketch2sim
compresses that path to: **draw → submit → answer a few questions → play with a working simulation.**

It is opinionated: it assumes the user brings intent and a drawing, not an engineering spec.
The agent fills the expert gaps, asks only what changes the verdict, and never fakes mechanics
to make a broken design look right.

## What you get

For each submitted mechanism, the output includes:

- A 3D scene on a warm wooden desk, with pencil sketch → 2D cutout → white model → textured
  model transition (the "sketch to physics" morph).
- Real rigid-body dynamics (cannon-es): hinges, joints, gravity, collisions, friction —
  not hand-written animation.
- Direct manipulation: drag parts, fire the mechanism, slow-motion replay, flight paths.
- A physics info card explaining the governing equations in user-visible terms.
- A build panel for parameter sweeps (mass, angle, counterweight, etc.).
- Lobby integration: a blueprint card on the desk that links to the case.

## Workflow (12 steps)

The agent drives autonomously after intake. The user pauses at three confirmation gates.

| Step | What happens | User pause? |
|---|---|---|
| 0 | Intake: parse sketch, scaffold project, produce Q&A checklist | **Yes — answer questions** |
| 1 | Recognition: parts / joints / actuators extracted from sketch | No |
| 2 | Spec: single source of truth, scale anchor confirmed | No |
| 3 | Feasibility gate: does the design physically work? | Only if it fails |
| 4 | Reference solution: analytic cross-check | No |
| 5 | Scaffold: project shell ready | No |
| 6 | Engine build: bodies, joints, materials, cross-check | **Yes — mesh roster approval** |
| 7 | Input sweeps: headless parameter tests | No |
| 8 | Interaction: drag, collision, slow-mo, replay | **Yes — interaction nodes approval** |
| 9 | Physics annotations: equations card | No |
| 10 | Visual consistency: lighting, reset, panel | No |
| 11 | Lobby integration, build, final delivery | **Yes — accept or request fixes** |

### The three user gates

1. **Intake Q&A** — batched, at most 3 questions. Stored in `cases/<slug>/docs/intake-questions.md`.
2. **Mesh roster** — after GLB loads, a table of every mesh with its proposed role
   (dynamic actor / static prop / visual-follow). Stored in `docs/mesh-roster.md`.
3. **Interaction nodes** — what is draggable, what follows what, what triggers collision.
   Stored in `docs/interaction-nodes.md`.

## Design principles

1. **The Spec is the contract.** Every dimension lives in one `spec.js`. Never hard-code
   the same number twice.
2. **Provenance on every quantity.** `declared` / `measured` / `derived` / `assumed` / `fitted`.
   A "feasible" verdict is forbidden while any load-bearing value is `fitted`.
3. **Dynamics come from bodies and joints, never hand-written formulas.**
4. **Run the feasibility gate before building UI.**
5. **State what is not modeled.** Strength, fatigue, heat, fluids are out of scope.
6. **Never fake mechanics with guard code.** If physics says it tilts wrong, let it tilt.
7. **Three object roles:** dynamic actor, static world prop (solid but immobile), visual-follow.
8. **Every object has physics from day one.** No "visual only by accident".

## Mechanical verification (no memory required)

The workflow's promises are enforced by scripts, not by the agent remembering:

- **`scripts/audit-case.mjs <slug>`** — run before declaring a case done.
  Checks spec.json exists, spec.js is imported **and actually referenced** (not
  dead code), docs/ six artifacts are non-trivial, test/verify.mjs runs and
  exits 0. Exit 1 = do not ship.
- **`test/verify.mjs`** — headless assertions. Beyond internal consistency
  (gravity sane, ratios positive), it parses `docs/intake-questions.md` and
  asserts SPEC values match the answers the user confirmed. This catches
  "the code says 5 but the user agreed to 4" drift.
- **Card map gate** — before writing build-panel HTML, list which controls go
  in which card, save to `docs/interaction-nodes.md`. See
  `references/panel-layout-standards.md`.
9. **Tour ⇄ Build switching resets all state** — physics, materials, sliders, camera.
10. **Compact panel:** max 2 rows per card, 90px sliders, no data readout cards.
11. **Physics card:** equations written for user-adjustable parameters, not academic notation.

## Repository layout

```
skill/sketch2sim/
├── SKILL.md                          # This file — workflow, principles, gates
├── scripts/
│   └── audit-case.mjs                # Mechanical delivery gate (exit 0 = pass)
├── template/                         # Reusable Vite shell (pre-configured lighting/desk)
│   ├── index.html
│   ├── src/
│   │   ├── main.js                    # Scene, camera, lights, tour/build loop
│   │   ├── environment.js            # Desk, paper, pencil, eraser
│   │   ├── textures.js               # Procedural wood table, clean paper
│   │   ├── mechanism.js               # Project-specific (overwritten per case)
│   │   ├── spec.js                    # Single source of truth
│   │   └── style.css
│   └── test/verify.mjs               # Headless physics self-check
└── references/
    ├── sketch-intake.md              # Steps 0-2: recognition, ambiguity protocol
    ├── mechanism-templates.md       # Physics domains, gates, when to add a new one
    ├── spec-schema.md                # Spec fields and provenance rules
    ├── capability-guide.md           # What/what-not this skill validates (L0-L5)
    ├── project-delivery.md           # Project tree, shell, self-check
    ├── architecture-checklist.md     # Single source of truth, module boundaries
    ├── physics-pitfalls.md           # 44 tagged pitfalls ([stepN] labels)
    ├── visual-standards.md           # Canonical lighting, desk, panel, banner, physics card
    ├── mesh-roster-format.md         # Required mesh classification format
    └── case-onboarding.md            # Delivery checklist (script-checked items marked)
    └── audit-checklist.md            # Pre-delivery verification
```

## Visual standards (summary)

All cases share the same look — copy verbatim:

- **Lighting:** ambient `0xffeed9/0.95`, sun `0xfffaec/2.3` at `(-2.5, 4.5, 3.2)`,
  fill `0xdce7f6/0.6` at `(3, 2, -1)`. Shadows: 2048px, bias `-0.0002`, radius `12`, blurSamples `16`.
- **Desk:** wood texture + warm tint `0xd9b98c`, roughness `0.55`.
- **Background:** `#2e251d` (dark walnut).
- **Tour banner:** no text — purely visual transition.
- **Panel:** compact cards, English labels, `btn-primary` for action, `btn-secondary` for Reset.

## Pitfalls

44 accumulated pitfalls, each tagged with the workflow step where it bites.
New problems discovered during a build are written back with their step tag immediately;
template-level fixes (lighting, panel, reset, lobby) are applied to `template/` in the same
commit so the next case starts correct.

## Cases shipped

- **Trebuchet** — 4:1 lever, counterweight drive, cannon-es rigid bodies, block knockdown.
- **Newton's cradle** — V-string pendulum constraint, mass-weighted elastic collision,
  steel/plastic material switching, bidirectional impact experiments.

## Requirements

- Node.js ≥ 18
- Three.js r160+
- cannon-es v0.20+
- Vite 5+

## License

MIT
