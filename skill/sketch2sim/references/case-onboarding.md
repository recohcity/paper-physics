# Case Onboarding Checklist

When a new case is finished, **first run the mechanical gate**:

```bash
node skill/sketch2sim/scripts/audit-case.mjs cases/<slug>
```

Exit code **must be 0** before declaring done. Items marked `[script]` are
checked automatically by audit-case.mjs — no manual tick needed. Only the
remaining subjective items need human review.

## Before writing any physics code

1. [ ] Copy `template/` to `cases/<slug>/`. The template already has standardized
      lighting, desk, and no-op banner — do not reintroduce dark backgrounds or banner text.
2. [ ] Drop sketch image into `public/<slug>.jpg`.
3. [ ] Set `vite.config.js` base to `/cases/<slug>/dist/`.
4. [ ] Boot the shell: SKETCH shows the drawing, LIFT animates the cutout, view controls work.

## During build

5. [script] **Mesh roster gate** (step 6): `docs/mesh-roster.md` exists and non-trivial.
      Format must follow `references/mesh-roster-format.md`: every mesh classified
      as dynamic / static / visual-follow, grouped by rigid assembly, collisions listed.
6. [script] **Interaction node gate** (step 8): `docs/interaction-nodes.md` exists and non-trivial.
7. [ ] After GLB loads, **wait 3s before measuring bounding boxes** — the model is not
      fully placed on first frame. Measure with Box3, anchor to a known center mesh.
8. [ ] All objects cast+receive shadow. No visual-only-by-accident meshes.

## Spec contract

9. [script] `spec.json` exists, `scale.status === "OK"`.
10. [script] `src/spec.js` is imported by at least one other `src/*.js` file (not dead code).

## Visual consistency

11. [ ] Lighting matches `visual-standards.md` exactly (ambient/sun/fill/bias/radius).
12. [ ] Desk material has `color: 0xd9b98c` tint.
13. [ ] Tour banner shows no text (no-op function).
14. [ ] Panel follows layout spec: ≤2 rows per card, side-by-side cards, 90px sliders.

## State reset

15. [ ] `resetAll()` restores: physics, materials, sliders, toggles, camera.
16. [ ] Switching tour→build calls resetAll; build→tour calls resetToFirstFrame.
17. [ ] Physics card: shows at PHYSICS step, hides on BUILD, click title = 5s show.

## Lobby integration

18. [ ] Copy a 1600×1100 sketch screenshot to `cases/lobby/public/<slug>.jpg`.
19. [ ] Add an entry to `cardDefs` in `cases/lobby/index.html`.
20. [ ] Build lobby: `cd cases/lobby && npx vite build`.

## Delivery (mechanical gate)

21. [script] `docs/intake-questions.md` exists (Step 0 gate record).
22. [script] `docs/report.md` exists (delivery report).
23. [script] `test/verify.mjs` is real (not stub), runs and exits 0.
24. [script] `docs/verify.log` exists (verify.mjs output).
25. [script] `docs/feedback.md` exists (post-mortem lessons).
26. [ ] Write `cases/<slug>/README.md` — focus on physics and interaction, not architecture.
27. [ ] Build the case: `npx vite build` passes with no errors.
28. [ ] Subjective: tour plays start→finish, build mode is interactive, switching modes resets state.
29. [ ] No dead files: check `public/` for unused textures, delete `.DS_Store`.
