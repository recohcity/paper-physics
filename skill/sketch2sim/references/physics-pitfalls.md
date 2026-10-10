---
tags: [T2, T3, T4, step0-11, engine, modeling, ux, resetAll, lighting]
provenance: cases/trebuchet（#1-#36）+ cases/newton-cradle（#37-#45）
---

# Physics pitfalls

General engine, modeling and UX rules. Each states the failure, the general fix, and how to check it.
Evidence tags: **[code]** read in a build, **[solver]** measured, **[inferred]** reasoned not observed.

**Step tags:** each pitfall belongs to one or more workflow steps. Before starting a step,
read all pitfalls tagged `[stepN]` for that step (N = 0..11 per SKILL.md Workflow).
When adding a new pitfall, assign the step tag(s) where the problem was discovered.
Template-level pitfalls (lighting, panel, reset, lobby) must also be applied to `template/`
in the same commit so the next case starts correct.

> Maintenance: this list grows from real projects. New pitfalls land here after a case survives them
> (see `docs/skill-feedback/`). Users may also contribute their own lessons; contributions are welcome
> but not required — the list must stay general, never device-specific.

## 1. Demonstration-grade vs verification-grade

A demo can fake the mechanism and still look excellent — dynamics integrated by hand, results from
formulas, only the contact/flight parts simulated. That is fine for storytelling and unusable for
validation, because changing a design dimension does not change the output.
**Rule:** if a result does not change when the relevant Spec dimension changes, label the build
demonstration-grade.

## 2. One scale, defined once

A build easily ends up carrying three conflicting scales (gravity/masses assume one unit, a texture
comment another, a "this part is X mm" anchor a third).
**Rule:** define the anchor first; derive scene gravity, masses from density × volume, and display units
all from the same factor. Feasibility ratios are scale-invariant; speeds, ranges and timing are not.

## 3. Run the feasibility gate before building

For a storage-and-release mechanism: static balance (driver torque vs payload+structure torque through
the travel) and energy budget (driver PE released − payload PE − structure PE > claimed payload KE).
If either fails at the proposed geometry, do not build a "working" demo of it.
**Rule:** compute both before any UI.

## 4. Do not drive the mechanism kinematically

Hand-integrated velocity (`v += k·dt`) cannot respond to design changes and hides energy errors.
**Rule:** use joints with real inertia, or a reference integrator. Keep user input limits as derived
geometric clamps, not hand-tuned guards.

## 5. Release and stop are modeling decisions

Ideal release at the stop gives the upper bound; releasing early changes the angle and lowers speed.
**Rule:** declare the release model (`ideal_at_stop`, `early_release(deg)`, `contact`) in the Spec and
sweep it; do not hard-code an angle that looks right.

## 6. Stacked bodies need a declared stabilization method

Loose stacked blocks jitter under the contact solver. A common trick: start bodies kinematic, switch
dynamic when the action arrives, freeze near-zero-velocity bodies.
**Rule:** declare the activation/freezing method as an assumption; freezing hides late instability and
the activation window is itself a tuned parameter — report it.

## 7. Time stepping

- Physics must use a fixed accumulator independent of display refresh; advancing `dt = 1/60` per rendered
  frame runs the sim faster on high-Hz displays.
- Slow motion that scales the physics delta but does not interpolate render state looks stepped.
**Rule:** fixed step; interpolate between the last two physics states for rendering.

## 8. Tunneling

Check `v_max · dt < smallest colliding feature`. If not, add substeps or continuous collision detection.

## 9. Single source of geometry

Sketch/texture layers that hard-code coordinates cause the same dimension to be fixed in two places.
**Rule:** generate the sketch layer from the Spec; perturb one dimension and both must change.

## 10. Extruded outlines

Overlapping contour extrusions and coplanar faces produce z-fighting artifacts.
**Rule:** assign each part a layer offset in the Spec.

## 11. Verify the verifier

The reference integrator must show near-zero energy drift with no dissipation. The engine build must
match the reference within the domain tolerance on the same inputs before any sweep is trusted.

## 12. Physics engine: mass and inertia are not automatic

Most rigid-body engines compute mass only from the mass option and approximate inertia with an AABB
box; shape density does not contribute and the box inertia is wrong for non-box assemblies. A first
build that forgot to assign mass behaves as if the mechanism has almost no inertia.
**Rule:** set `mass` and `inertia` by hand to the reference values (CoM + parallel-axis), then refresh
the world inertia cache after adding shapes.

## 13. The cocked/start pose must be rotated around the pivot

Placing a body at its un-rotated CoM offset and only rotating the quaternion misaligns the constraint;
the solver then yanks the body into place, injecting energy and turning a dead mechanism into a
plausible-looking runner.
**Rule:** rotate the CoM offset by the initial orientation, then place the body so its pivot lands
exactly on the world pivot. Track potential+kinetic energy; it must stay flat before comparing.

## 14. Declared values must actually reach the runtime bodies

The audit checks the Spec numbers, but bodies behave per what was pushed into them. A build can look
balanced on paper while the runtime body silently keeps a constructor default — first action inverts the
mechanism.
**Rule:** after constructing, push every Spec/UI default into the bodies immediately, then read
`body.mass` back and compare.

## 15. A hidden/background tab freezes the frame loop

When the tab is hidden, the render loop stops, halting both rendering and the per-frame physics step.
A "mechanism does not move" conclusion reached on a background tab is an artifact.
**Rule:** before concluding the mechanism is stuck, confirm the tab is visible and world time advances.

## 16. Visual props need real colliders if they participate

Scene props in the collision area let projectiles pass straight through unless given a static collider.
**Rule:** derive a static collider from each prop's world position and visual extent; the whole scene
(the launcher, stands, every visible object) must block the projectile or carry an explicit exemption.

## 17. Demo/replay steps need an explicit end condition, not a fixed sleep

A step that sleeps a fixed wall-clock time stops mid-action.
**Rule:** poll each frame until the action's natural end (projectile leaves scene, or speed below a
threshold), with a generous timeout as safety. The final tour step must be static (no auto-fire, no
leftover motion).

## 18. Validation coverage expires when input ranges change

A verified grid is only evidence for the grid it covered. Widening a slider range means the old PASS
says nothing about the new defaults, and may expose an engine bias the old grid could not see.
**Rule:** re-run the reference-vs-engine check whenever input ranges change; report any new gap rather
than loosening the gate or carrying the old PASS forward.

## 19. User "load" interactions must not pin the mechanism's only degree of freedom

When the user places a load, the body must still settle under real torque balance — otherwise a
"payload too heavy" behaviour cannot emerge. The stop that prevents self-intersection is a collision
behaviour, not a logic lock; physics decides throwability.

## 20. A collision stop must never swallow the normal action arc

A raw condition that pins the body whenever it passes an angle can lock it on the first frame of the
intended motion.
**Rule:** give the stop a release grace window and require motion in the correct direction before
locking; re-measure the default behaviour after any stopper change.

## 21. Decorative parts are visual-follow, never force-follow

Ropes, drums, cranks, dials added for storytelling must not participate in the constraint solve or
carry a collider that touches the action.
**Rule:** classify each part as dynamics or decorative; decorative parts get a kinematic mapping of the
real state, and changing them must not change any readout.

## 22. A projectile released while overlapping the launcher gets solver-pinned

At slow time scales, a projectile that starts overlapping the launcher colliders can be clamped to
near-zero velocity and "settle" instantly.
**Rule:** stage collision activation at release (mask out the launcher group, restore after a short
window); verify under the slowest supported time scale, not just at 1×.

## 23. A rolling body may never settle — event-driven end conditions beat velocity thresholds

A low-friction body rolls forever asymptotically, so a speed threshold never trips and the replay hangs.
**Rule:** after the primary impact event, cap the tail with a fixed wall-clock window; keep the generic
timeout as last resort.

## 24. Suspended pendulum chains: impulse engines inject energy — use the analytic model

A row of identical hanging balls (Newton's cradle, hanging punchbags) looks like a trivial rigid-body
job, but an impulse solver (cannon-es / Ammo) gets it wrong in ways that look like user-reported bugs:
`PointToPointConstraint` pulls the ball to the anchor (all balls stuck to the ceiling);
a bilateral `DistanceConstraint` is a rigid rod that pushes, so a ball with ghost energy flips up over
the bar and jams against it; a hand-written one-sided rope projection desyncs position and velocity
and fights the contact solver, reversing collision direction. The middle ball also never settles,
because the solver treats balls as free masses and ignores the suspension pivot's effective inertia.
**Rule:** for a pendulum-chain/contact-wave mechanism, do not force it through a general impulse engine.
Model each body on its real pendulum circle (`θ̈ = -(g/L) sinθ`), integrate in fixed steps, and apply
equal/unequal-mass elastic velocity exchange only when adjacent bodies actually touch. This conserves
energy, never inverts, and the middle bodies stay put — and it is *more* accurate than the impulse
approximation, not a downgrade. Only reach for a full rigid-body engine when the mechanism needs
3D contact, arbitrary shapes, or off-plane dynamics that the 1D chain model cannot represent.

## 25. Resting contact is the default — do not open gaps to work around a solver

Real Newton's-cradle balls rest touching; a gap of only a few tenths of a millimetre already degrades
the momentum-wave behaviour. Leaving a deliberate gap to stop the solver injecting energy at initial
contact is papering over a model error: it changes the physical layout the user drew.
**Rule:** place bodies in their true resting contact. If the solver injects energy at rest contact,
fix the solver/time-step or the contact model — do not move the geometry apart to hide it.

## 26. The 2D→3D z-unfold must not share its progress with the material morph

The tour animates a sketch that "lifts off" the paper and unfolds along Z (`scale.z: 0 → 2`) while
also fading the white-clay material into the real texture. If the same tween `f` drives both, and the
MODEL step stops at `f=0.66` (white-clay threshold) while MATERIAL continues `f: 0.66 → 1.0`, then
`scale.z = 0.01 + f·2` lands at `1.33` at the end of MODEL — spheres look squashed along Z and the
user reports "the ball is not round". The MATERIAL step's onUpdate often forgets to set `scale` at
all, so the wrong Z value sticks.
**Rule:** track the Z-unfold progress as its own tween variable. MODEL must end with `scale.z = 2`
(spheres truly round) while the material stays white-clay; MATERIAL only swaps materials, never
re-touches scale. Verify on the white-clay step that balls read as perfect spheres before approving
the model.

## 27. Never guess glb mesh roles — show the roster and confirm before attaching physics

After a Blender export, mesh names are easy to misread. In the Newton's-cradle case the glb had
`Socket_i_±1`, `Hook_i_±1`, `Cap_i_±1`, `HookRod_i_±1`, `Rope_i_±1` per ball. The skill assumed
`Socket` = top beam anchor and attached `Cap`/`HookRod` to the ball, but actually `Hook` was the
top fixed point and `Socket` was on the ball. Wrong parent = rope floats, bolts detach, balls
swing but hardware stays put — symptoms that look like a physics bug but are a naming bug.
**Rule:** right after glb load, print the full mesh list to the user as a table (name, proposed
role: static anchor / dynamic body / visual-follow, and which mesh rides which). Wait for the
user to confirm or correct before wiring any `attach()`, pivot, or rope anchor. Same gate before
writing interaction code: list draggable mesh, followers, collision trigger, play/replay default,
and confirm. This is not an expert decision — naming is a contract, and the user knows the model.


## 28. Tour step navigation must reset to that step's starting state, not jump mid-transition

When the user clicks a tour step button directly (e.g. "MODEL" after watching LIFT), the handler
must first reset to that step's *starting* state, then play the transition. If it applies the end
state directly (`applyMorphToStage(66)`) and then runs the step animation from its start, the user
sees a flash of the finished result, then it disappears and replays.
**Rule:** `seekTourStep(i)` calls `resetToFirstFrame()` first, then `applyTourStepStart(i)` which
sets up the *beginning* of step i (e.g. for MODEL: cutout standing in Side view), then the step's
own tween animates the transition. Never set the end state in `applyTourStepStart` — that's what
the tween is for.

## 29. The lifted 2D cutout must share the model's world position, not sit on the paper

When the sketch lifts off the A4 paper and stands up, it should occupy the same XYZ position where
the 3D model will unfold. If the cutout stays at the paper's Z position (e.g. Z=0.46) while the
model group sits at Z=0, the crossfade looks like the model is growing out of empty space, not
transforming from the drawing.
**Rule:** set the cutout mesh position to match the model group's origin (`cradleGroup.position`),
with the cutout's bottom edge resting on the same table height. Verify the cutout and model overlap
on screen before approving the transition.

## 30. PHYSICS step shows physics formulas, not part names

Labeling parts ("this is the beam", "this is a ball") adds no value — the user can already see them.
The educational value is the physics: pendulum equation, momentum conservation, energy exchange.
**Rule:** PHYSICS step shows a paper-style card (not floating labels) listing the governing equations
for this mechanism. The card is dismissible (×), selectable (user can copy formulas), and toggled
by clicking the project title. Card persists through RUN/REPLAY, hides on BUILD.

## 31. Free-orbit view is a toggle switch, not a view button

A "3D" button that switches camera modes confuses users. Use a pill-style toggle (off=gray,
on=gold). When off, Hero/Side/Top are fixed camera views. When on, OrbitControls is enabled and
the user can freely orbit. Toggling off keeps the current camera angle (does NOT snap back to the
last fixed view). Only clicking Hero/Side/Top resets to a fixed framing.
**Rule:** `controls.enabled` must be gated by the toggle state, not by `currentView === '3D'`,
otherwise the animation loop re-enables orbit every frame.

## 32. BUILD mode always resets to rest state + default view

Entering BUILD must: (a) reset physics to all balls at rest, (b) set materials to full (not white
clay), (c) reset to the model's default interaction view (Side for Newton's cradle, Hero for
trebuchet). If the user clicks BUILD mid-tour or mid-play, the scene must not stay in a partial
tour state.
**Rule:** `showBuildPanel()` calls `cradlePhys.reset()`, `_setCradleMorph(1.0)`, and
`setCameraView(defaultBuildView, 800)`. Default view is per-model config, not global.

## #33 Material double-mesh overlay envMap timing

When using the white-clay → material fade pattern (cradleGroup = WHITE_CLAY,
cradleMaterialGroup = clone with original materials fading in via opacity),
the environment map (env.exr / HDR) loads asynchronously AFTER the GLB.
If env.exr finishes loading after the GLB clone, the fix-up loop that re-assigns
`material.envMap` must traverse **both** `cradleGroup` AND `cradleMaterialGroup`.
Traversing only the primary group leaves the overlay with no env reflection,
making metals (steel balls) render black. Symptom: metal balls go black after
switching tour/build or navigating between cases, even though the primary group
looks fine.

**Rule:** After PMREM env texture is ready, write a helper `applyEnv(group)` and
call it on every material-bearing group (primary, overlay, any clone). Set
`needsUpdate = true` on each material.

## #34 Tour/build reset must clear all groups

`resetToFirstFrame()` (called on page load and when returning to tour from build)
must hide EVERY group that build mode shows, not just the primary:
- `cradleGroup.visible = false`
- `cradleMaterialGroup.visible = false`
- `cradleCutout.visible = false`
- pencil/eraser `visible = true`
- paper sketch texture shown
Forgetting `cradleMaterialGroup` leaves a ghost material model floating over
the sketch. Symptom: after clicking BUILD then back to TOUR, the 3D model is
still visible behind the blueprint.

## #35 Inter-case navigation is full page reload

The lobby navigates with `window.location.href = url`, so each case gets a
fresh JS context — no shared state leaks between cases. Do NOT add inter-case
cleanup code; the bug is always inside the target case's own init/reset path.
When a user reports "after switching back to case X, material is gone", check
X's init sequence: async resources (env.exr, textures) may finish loading after
the model group has already been set up, and the fix-up loop must cover all
groups created at that point.

## #36 Bidirectional tour/build reset

Switching between TOUR and BUILD must reset state in BOTH directions:
- BUILD → TOUR: call `resetToFirstFrame()` — hide 3D groups, show sketch, reset camera to top.
- TOUR → BUILD: reset physics to rest (balls at center, no velocity), apply full material
  (morph=1.0), set camera to the model's default build view (per-model config), hide
  paper sketch + cutout + pencil/eraser. If the user was mid-tour on step 2 (white clay),
  clicking BUILD must NOT leave them in white clay mid-animation.
Both directions must also pause any running physics (tour auto-play) and clear tweens.

## #37 [step6] Measure GLB bounds after load, not immediately

A GLTF/GLB `onLoad` fires when the file arrives, but child meshes may not have
their world transforms computed yet. If you measure Box3 to space parts (e.g.
aligning 5 balls in a Newton's cradle), the first measurement gives wrong
edge positions and parts end up with uneven gaps. Fix: **delay 3 seconds after
GLB load**, then measure Box3 against a known center anchor and reposition.
Symptom: "balls 0-1 touch, 1-2 have a gap, 3-4 touch" — uneven spacing.

## #38 [step10][template] Standardized lighting — copy verbatim

Every case must use the exact light rig in `visual-standards.md`:
ambient 0xffeed9/0.95, sun 0xfffaec/2.3 at (-2.5,4.5,3.2), fill 0xdce7f6/0.6 at
(3,2,-1), shadow bias -0.0002/radius 12/blurSamples 16, desk color 0xd9b98c.
Symptom of drift: one case looks warm and another looks washed-out/gray.
When adding a new case, copy the rig from an existing shipped case — do not
"improve" the numbers.

## #39 [step11] Stacked flat objects need fake contact shadows

Two thin planes (papers, cards) lying 3-20mm apart do NOT cast reliable
real-time shadows on each other — the shadow map resolution (2048 over ~5m)
is too coarse for sub-cm gaps, and PCF blur eats the shadow. Fix: add a
canvas-generated soft shadow plane (blurred rounded rect, black 35% opacity,
offset ~20-30mm in the shadow direction) as a child of the upper object.
Real-time shadows still work on the desk, but the inter-object shadow must be faked.

## #40 [step8] Drag vs click must be distinguished

If an object is both draggable AND clickable (e.g. lobby blueprint cards that
navigate on click), a simple click must not trigger the navigation guard.
Track a `dragMoved` flag: set it true only when the pointer moves >~1cm during
mousedown. On mouseup, only set `_justDragged = true` if `dragMoved` was set.
Otherwise a plain click (mousedown+mouseup without movement) is treated as a drag
and the navigation never fires.

## #41 [step8] Per-object material + mass switching

When a case supports switching individual objects between materials (e.g. steel
vs plastic balls), define a density table and compute mass from volume:
steel 7850 kg/m³, plastic 1050 kg/m³. Use mass-weighted collision formulas, not
the equal-mass velocity-exchange simplification. Prefer procedural materials
(color + roughness) over external EXR/HDR textures — they load instantly and
don't need compression. Only use EXR env maps for reflective metal; matte
materials need no env map.

## #42 [step10] Hover lift height balance

When hovering an object lifts it (e.g. a card on a desk), the lift height must
be: high enough to cast a visible contact shadow on the object below, but low
enough that nearby props (pencil, eraser) don't look sunken. Sweet spot:
resting gap 3-5mm, hover lift 20-25mm. Lifts >40mm look like floating.

## #43 [step9] Physics card formulas must use user-visible parameters

The physics info card is for the user, not the professor. Write equations in
terms of sliders the user actually moves: "v_cup = ω × L = 4 × v_cw",
"m_c·g·Δh → ½·I·ω²". Do NOT write academic notation (T₁, α, β, I₀) that
requires a legend. List the actual parameter ranges (g=9.82, CW 1.4-10kg, etc).


## #44 [step6] Objects pass through each other — missing colliders
**Symptom:** Dynamic balls/arms visually clip through walls, beams, or each other.
Repeated across trebuchet and newton-cradle, costing multiple fix cycles.
**Cause:** Meshes were listed in the roster as "dynamic" or "static" but no physics
collider was actually created for them. The visual model exists, the physics body does not.
**Fix:** Before leaving step 6, audit every mesh in the roster:
- Dynamic mesh → does it have a collider shape + mass?
- Static boundary (wall, floor, beam) that a dynamic object can hit → does it have a static collider?
- Visual-follow (rope, cable) → no collider needed, OK.
If a dynamic object can cross a visual boundary, that boundary needs a collider
OR an explicit clamp (e.g. pendulum angle limit). Verify headless, not by eye.

## #45 [step8] Build panel layout: card-per-responsibility, flex not px

Newton's cradle build panel was reworked 15+ times because layout was guessed
instead of following a standard. Full spec in `references/panel-layout-standards.md`.
Key rules:
- Each functional group = its own `.panel-section.throw-section` card. Do NOT
  stuff playback buttons into the material card. Three cards = three divs.
- Card row: `display:flex; flex-direction:row; gap:6px; align-items:stretch;`
- Each card: `flex:1;` (never fixed px width).
- Inside card: `flex-direction:column; justify-content:center;` so all cards
  are equal height.
- Title font: `11px / #8a7e6e / letter-spacing:1px`.
- Buttons: `padding:4px 8px; font-size:11px;` — same across all cards.
- Primary: `.action-btn.btn-primary`. Secondary: `.action-btn`. Icon-only:
  `.action-btn.icon-only`.
- Legend row: `white-space:nowrap`, left-aligned with card title (no indent).
- Before writing HTML, confirm the card map with the user: which controls go
  in which card. Guessing = rework.
