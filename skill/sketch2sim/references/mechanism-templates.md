# Mechanism templates

Each entry: what the sketch looks like, the Spec fields it needs beyond the generic schema, and the
feasibility gate to run at workflow step 3 — the thing that answers "can this work" cheaply, before any
build. Check this file before deriving a gate from scratch; add an entry whenever a genuinely new mechanism
class shows up (a new gate, not just new numbers for an existing one).

## hinged_lever_with_hanging_counterweight

Sketch signature: a beam pivoted off-center, a mass hanging or fixed on the short arm, a payload on or in a
cup/sling at the end of the long arm. Trebuchet-family.

- Fields used: `mechanism` (arm/cup/counterweight geometry), `joints` (the pivot, the counterweight hang).
- Gate: static balance (driver torque vs payload+structure torque through the travel) and energy budget
  (`v <= sqrt(2*E_available/m_payload)`). Both scale-invariant (mass ratio x lever ratio).
- Tooling: `scripts/mech2d.mjs` (reference solver), `scripts/cannon_trebuchet.mjs` +
  `scripts/xcheck_suite.mjs` (engine cross-check), `scripts/sweep_trebuchet.mjs` / `search_fix.mjs`.
- Case: paper-trebuchet (`examples/trebuchet.spec.json`, `audit/paper-trebuchet-audit.md`).

## monotonic_field_gravity_loop

Sketch signature: a non-contact force source (magnet, charged body) pulls a payload up a track toward
itself; the payload is meant to pass the source (through a hole, past a peak) and return via gravity to
repeat the cycle. Perpetual-motion "lodestone and ball" designs are the classic case, but the same shape
covers any "field pulls payload past itself, gravity resets it" claim.

- Fields used: `fields[]` (the source, `monotonicity`), `guides[]` (the track the payload follows), `world`
  (gravity). No `joints` — nothing is pinned.
- Gate (no reference solver, no simulation, no scale anchor needed): let `r` be source-to-payload distance.
  The field is monotonic in `r` (true of essentially all real point/dipole sources: field strength decreases
  with distance). The mechanism needs, simultaneously:
  - at the *farthest* payload position on the climb (largest `r`, weakest field): field pull along the track
    > gravity pull along the track, or the climb never starts;
  - at the *pass point* (smallest `r`, strongest field): field pull < gravity (or whatever releases the
    payload), or it never lets go.
  These two requirements sit at opposite ends of the same monotonic curve — whatever single field strength
  satisfies the first makes the second strictly harder, never easier. **No field strength satisfies both.**
  This is a non-existence proof, not a parameter search: no sweep, no fitted constant, no scale rescues it.
  Only exceptions: a *non-monotonic* field (engineered field shaping — not a bar magnet or point charge) or
  a mechanism that removes/shields the source at the pass point (a real trap door is a *mechanical* release,
  not a field property — model it as a separate joint/guide event, and then this gate no longer applies to
  that variant, because the premise "field alone does both jobs" no longer holds).
  Report this as: "Not feasible as a field-only device; scale/strength-independent (monotonic field). If a
  mechanical release replaces the field at the pass point, re-derive — that is a different mechanism."
- Tooling: none needed beyond the argument above; do not write a numeric solver for a claim this gate already
  settles analytically. If the person wants an interactive model anyway (to *show* the failure — e.g. an
  animated ball that visibly gets stuck, or flies off, depending on tuned strength), build it as
  demonstration-grade only and say so; do not present it as a working design.
- Case: 1648 Wilkins lodestone perpetual motion sketch (chat, no Spec/report file yet — first case, verdict
  reached without ever establishing a scale anchor, since scale does not affect a monotonicity argument).

## Adding a new template

A new template is warranted when the *shape of the feasibility question* changes (a different gate), not
when only the numbers change (that is just a new case of an existing template). When in doubt: could the
question be answered by "is there a parameter setting that works" (existing templates so far: yes, sweep for
it) or "can no parameter setting work" (monotonic-field: a structural non-existence proof)? Both are valid
gate shapes; name the new template after the mechanism class, not the specific sketch, and record which
Spec fields (`joints`/`guides`/`fields`/other) it actually uses.
