# Architecture checklist (code quality for interactive physics builds)

Use when building or refactoring a sketch-to-sim interactive project (Three.js +
physics engine), or when auditing an existing one. The paper-trebuchet refactor
(2026-09-28) is the worked example: a `src/spec.js` single source of truth that
physics, the 3D model, the UI sliders and the Spec file all reference.

Goal: a future project inherits the discipline, not the debt. Severity:
**B** blocks trust in the build, **H** should fix, **M** improve.

| ID | Check | How to verify | Sev |
|---|---|---|---|
| A1 | Runtime single source of truth exists (physics / 3D / UI / display all read one module, e.g. `src/spec.js`, mirroring the Spec) | grep the same dimension in physics.js, trebuchet.js, main.js, index.html — it must appear as a definition in one module and imports elsewhere | B |
| A2 | Main controller file is not a god object | count methods and lines per file; a >800-line controller with tour + UI + input + physics sync should be split (e.g. TourController, PanelController, FireController) | H |
| A3 | No duplicated literals across modules | pick 5 load-bearing numbers (arm length, cup bore, pin position, slider bounds, rest angle) and grep each; each must resolve to one definition | B |
| A4 | Derived values are derived, not re-written | a value computed from others (e.g. cwPivotX = SHORT_ARM - 0.015) must be a formula or a comment linking the derivation, not a copy-pasted number | M |
| A5 | Intentional visual-vs-physical gaps are documented | e.g. visual beam 0.62 vs physical material extent -0.596: keep both in spec.js with a note; do not silently equalize | M |
| A6 | UI slider bounds match the physics clamps and the Spec inputs | compare index.html min/max/default vs spec.js UI vs the clamp inside setBall/setCwMass; all three must agree | B |
| A7 | No stale comments / historical baselines in source | search for old values in comments ("r=23.9 mm", "3.22-3.25 m/s", "old hardcode"); history belongs in CHANGELOG, provenance notes may stay but must be current | M |
| A8 | No temp/debug residue | search TEMP, DEBUG, window.__x hooks, unused methods; remove before delivery | M |
| A9 | Physics values unchanged by refactor | before/after refactor, run the reference-vs-engine cross-check and a browser launch; numbers must be identical (pure reference convergence must not move physics) | B |

## Worked example: paper-trebuchet (2026-09-28)

Before: `LONG_ARM` 0.62 / `SHORT_ARM` 0.315 / `CW_HANG` 0.10 / apex 0.5964 /
REST_ANGLE -1.00 / cupR 0.05 / cwSize 0.13 lived in trebuchet.js; `MECH`
(arm_x1 -0.596 … box 0.13) in physics.js; slider defaults 2.60 / 0.45 / 84.5 in
main.js and index.html — the same physical quantity written in up to 4 places
(violating skill principle 1 at the code level).

After: `src/spec.js` exports `MECH` (physics bodies), `GEOM` (3D model), `UI`
(slider ranges/defaults); physics.js / trebuchet.js / main.js import from it;
index.html carries `<!-- mirrors src/spec.js UI.x -->` anchors. Browser launch
before/after: 3.53 m/s / 31° identical (A9 pass). Stale comments (r=23.9 mm,
old browser baseline 3.22-3.25 m/s) moved to CHANGELOG (A7 pass).

Note: HTML cannot import ES modules, so index.html anchors are comments, not
imports — keep them in sync manually or generate index.html from the spec in
larger projects.
