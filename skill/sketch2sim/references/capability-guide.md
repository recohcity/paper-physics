# Capability guide (what this skill can and cannot validate)

Read this before handing a new sketch to the workflow — it decides fast whether this skill is the right
tool, which template to match, and how strong the verdict can be.

## What this skill does

Turns a hand-drawn sketch of a mechanism into a checkable Spec + interactive 3D physics build, and answers
one question: **can this mechanism physically do what it claims?** The deliverable is a feasibility verdict
with provenance, not a pretty model. See `SKILL.md` for the full workflow (steps 0-9).

## Sketch types this skill CAN validate (existing templates)

| Template | Sketch signature | Gate shape | Tooling | Case |
|---|---|---|---|---|
| `hinged_lever_with_hanging_counterweight` | A beam pivoted off-center; a hanging/fixed mass on the short arm; payload in a cup/sling on the long arm (trebuchet family) | Numeric: static balance + energy budget (`v <= sqrt(2E/m)`); needs a scale anchor and masses | Full chain: `mech2d.mjs` reference solver, cannon cross-check, sweeps, fix search | paper-trebuchet (validated end to end) |
| `monotonic_field_gravity_loop` | A non-contact force (magnet, charge) pulls a payload up a track toward itself; the payload must pass the source and return via gravity (perpetual-motion "lodestone & ball" family) | Structural non-existence proof: monotonic field cannot both pull strongly enough at max distance AND let go at min distance — no parameter setting works | None needed — the argument settles it; a demo build is demonstration-grade only | 1648 Wilkins lodestone design (verdict reached, no Spec/report filed) |

Both gates are **scale-invariant**: feasibility depends on ratios / monotonicity, so they hold at any
consistent scale. (Speeds, ranges and timing, however, are not scale-invariant — those need a real anchor.)

Check `references/mechanism-templates.md` for the current catalog before deriving anything from scratch.

## Sketch types this skill CANNOT validate

- **Strength / fatigue / thermal / fluid / manufacturing tolerance.** Rigid-body physics does not cover
  these; they need FEA or specialized analysis. The workflow states this at every report (principle 5).
- **Purely decorative 3D** with no mechanism to check — no feasibility question exists; another tool
  (a 3D modeler) fits better.
- **Mechanisms that need a numeric gate but arrive without a scale anchor.** `scale.status` must leave
  `CONFLICT` before `measured` provenance is possible; if the person cannot supply an anchor (labeled
  dimension or known-size reference object), stop and ask — do not guess (workflow step 0, `sketch-intake.md`).
  Exception: monotonicity-style structural arguments (see above) do not need an anchor at all.
- **Mechanism classes outside the two templates** — e.g. four-bar linkages, stability/falling-object
  classes — have no reference solver, no engine build and no gate yet. A new class is a real project (see
  "Adding a new template" in `mechanism-templates.md`), not a parameter tweak. The next planned pressure
  test is a linkage / stability-class mechanism.
- **Soft bodies, ropes-as-dynamics, fluids, or anything Cannon-es rigid bodies cannot represent.** Note
  the project's rope/winch are decorative visual-follow (principle 7), not simulated cables.

## How to choose (decision order)

1. **Is there a mechanism to validate, or is this decoration / analysis-only?** Decoration → not this skill;
   FEA-class questions → say so and point to the right analysis.
2. **Match the sketch to a template** in `mechanism-templates.md`. Matched → use that template's gate and
   tooling. Unmatched → decide whether this is a *new gate shape* (warrants a new template + reference
   solver work) or just a new case of an existing one (new numbers, existing tools).
3. **Does the gate need numbers?** If yes, establish the scale anchor up front (`sketch-intake.md` part A);
   if the argument is structural (monotonicity, symmetry, conservation), proceed without one and say so.
4. **Run the gate before building anything** (workflow step 3). If it fails, report the failure with the
   numbers / argument — do not build a "working" demo of a dead mechanism. A demonstration-grade model may
   still be built to *show* the failure, but it must carry the demonstration badge and no feasibility claim.

## What the verdict can claim (honest ceilings)

- Gate passes + reference-vs-engine agreement + sweeps with margin → "Feasible within the modeled
  assumptions".
- Structural non-existence proof → "Not feasible as a <field-only / this-class> device; scale-independent".
- Any load-bearing `fitted` quantity, or a demo-only build → "Demonstration only. Not a feasibility result."

## Current maturity (what is still not proven)

- **A sketch that runs end to end through steps 2 onward** (ambiguity confirmation → Spec → build) has not
  happened yet: paper-trebuchet was always code-extraction; the Wilkins case resolved at step 3 without
  needing steps 2+. The next feasible design handed as a sketch will be the first full run.
- **Overlay fidelity check** (render the build from the sketch's view and diff against it) is designed in
  principle but not built.
- **A genuinely new numeric gate** beyond the trebuchet family has not been exercised (both cases so far are
  scale-invariant in opposite ways).
- Everything validated is **single-case**; the checklist generalizes only as far as the audits it survived.

When in doubt about whether this skill fits a sketch, say what you can validate and what you cannot, and
propose the cheapest path to a verdict rather than starting a build.
