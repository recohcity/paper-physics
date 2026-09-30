# Physics pitfalls

Each item says where the evidence comes from: **[code]** read in paper-trebuchet source, **[solver]**
measured with `scripts/mech2d.mjs`, **[inferred]** reasoned from code, not observed at runtime.

## 1. Demonstration-grade vs verification-grade

A demo can fake the mechanism and still look excellent. paper-trebuchet does this: the arm angle is
integrated by hand and the launch speed and angle come from formulas, so only the ball flight and block
collisions are simulated **[code: main.js 416, 454, 455]**. That is fine for storytelling and unusable for
validation, because arm length, masses and cup geometry do not appear in those formulas. Rule: if a result
does not change when the relevant Spec dimension changes, label the build demonstration-grade.

## 2. One scale, defined once

The project uses three scales at once: gravity, masses and the RANGE readout assume 1 unit = 1 m; a comment in
the environment code assumes A4 paper = 2.7 units (1 unit ~ 0.11 m); the demo's "blocks are 40 mm" anchor
implies 1 unit ~ 0.45 m **[code: physics.js, main.js 524, environment.js 54]**. Fix: define the anchor first,
derive `g_scene = g / s`, masses from density x volume, and display units from the same factor. Feasibility
ratios are scale-invariant; speeds, ranges and timing are not.

## 3. Feasibility gate before building

Two numbers decide whether a throwing mechanism can work at all.

- Static balance: driver torque `m_cw * g * a * cos(theta)` against payload+structure torque. Ball and
  counterweight both scale with `cos(theta)` when the payload sits on the arm axis, so the balance is roughly
  angle-independent and set by `m_cw * a` vs `m_ball * r`.
- Energy budget: `m_cw*g*dh_cw - m_ball*g*dh_ball - structure PE gain > 0.5*m_ball*v^2`.

paper-trebuchet fails both **[solver]**: with its own numbers (ball 0.20 kg at 0.65 m, counterweight 0.30-1.00 kg
at 0.185 m, lever ratio 3.5:1) a 0.68 kg counterweight is at neutral balance against the ball alone; adding any
arm or cup mass makes the payload side win. With a massless arm and the maximum 1.00 kg counterweight the best
possible speed is 2.2 m/s, landing 0.115 m from the pivot.

## 4. Do not drive the mechanism kinematically

Hand-integrated `armVelocity += k*dt` cannot respond to design changes and hides energy errors. Use a hinge
with real inertia, or a reference integrator. Keep a **derived** input limit for user drags: the 84.5 degree
cocking limit in the project is a good pattern (analytic tangent contact with the paper, clamp the input, do not
rely on collision resolution) **[code: trebuchet.js 124-126]**.

## 5. Release and stop are modeling decisions

Ideal release at the stop gives the upper bound: ball speed = omega * r, direction tangent to the cup path.
For the project's geometry that tangent is 39.8 degrees, not the hard-coded 32 **[solver]**. Releasing 5 / 10 / 20
degrees early changes the angle to 44.8 / 49.8 / 59.8 and lowers speed **[solver]**. Real spoon or sling release
depends on contact and friction; declare the model (`ideal_at_stop`, `early_release(deg)`, `contact`) in the
Spec and sweep it.

## 6. Stacked bodies (the pyramid)

What worked in the project **[code: physics.js]**: solver iterations 30, wood-wood friction 0.65 / restitution 0.15,
wood-table 0.7 / 0.12, metal-wood 0.45 / 0.50, block 0.14 kg. To avoid stack jitter blocks start KINEMATIC, become
DYNAMIC when the ball is within x in [0.70, 1.30], and turn STATIC after 2 s of near-zero velocity. Consequences:
freezing hides late instability, and the activation window is another fitted parameter. Keep the trick for
demos; in verification builds use sleeping with tuned thresholds and report if stacks are not stable at rest.

## 7. Time stepping

- Fixed 1/60 accumulator is correct **[code]**. The launch animation instead advances `dt = 0.016*timeScale` per
  rendered frame **[code: main.js 430]**, so it runs faster on 120 Hz displays **[inferred]**.
- Slow motion scales the physics delta but meshes copy body positions with no interpolation **[code: physics.js
  step]**, so at 0.25x the physics advances once every ~4 frames and motion looks stepped **[inferred]**. Fix:
  interpolate render state between the last two physics states.

## 8. Tunneling

Check `v_max * dt < smallest colliding feature`. Ball diameter 0.092, block 0.088, speed 3.6 m/s at 1/60 s moves
0.06 per step: safe today, no margin if speed grows **[code + arithmetic]**. Add substeps or CCD if the check fails.

## 9. Single source of geometry

Sketch textures use hard-coded pixel coordinates commented as matching 3D positions **[code: textures.js 247]**.
This caused the block-size fix to be made twice. Generate the sketch layer from the Spec.

## 10. Extruded outlines

Overlapping contour extrusions and coplanar faces produce artifacts (the project's changelog records cleaning
these and aligning parts on one plane at y = 0.021). Assign each part a layer offset in the Spec.

## 11. Verify the verifier

Energy drift of the reference integrator must be near zero when there is no dissipation (1e-15 J here). The
engine build must match the reference within ~5% on the same inputs before any sweep is trusted. Measured
with `scripts/xcheck_suite.mjs`: as-built negative control and fixes A-D all agree within ~1% on speed,
~3% on angle **[solver + engine]**.

## 12. cannon-es: mass and inertia are not automatic

cannon-es computes a body's mass **only** from the Body `mass` option, and approximates inertia with an
AABB box (`updateMassProperties`); shape density does not contribute and the AABB inertia is wrong for
non-box assemblies. A first cross-check build silently gave 8.2 m/s instead of NO RELEASE because the cup
and ball shapes carried no mass **[engine, measured]** (the mechanism suddenly had almost no arm inertia).
Fix: set `mass`, `inertia` and `invInertia` by hand to the exact values the reference solver uses (total
mass, inertia about the CoM via parallel-axis), then call `updateInertiaWorld(true)` after the last
`addShape`.

## 13. cannon-es: the cocked pose must be rotated around the pivot

Placing the arm body at its un-rotated CoM offset and only rotating the quaternion leaves the hinge
misaligned; the constraint solve then yanks the arm into place, injecting energy and turning a
"NO RELEASE" mechanism into a plausible-looking thrower **[engine, measured; E drift -3.2 J on the first
0.8 s]**. Fix: rotate the CoM offset from the pivot by the initial quaternion, then place the body so its
pivot point lands exactly on the world pivot (`q0.vmult(rCom)` pattern in `cannon_trebuchet.mjs`).
Energy tracking (potential + kinetic) must stay flat before doing any comparison.

## 14. Declared values must actually reach the runtime bodies

The audit checks static balance (M2) on the Spec's numbers, but the runtime bodies only behave per what
was pushed into them. paper-trebuchet's fix A build looked balanced on paper (2.60 kg default) while the
physics counterweight body silently stayed at the 1.0 kg constructor default, because `createMechanism()`
was never followed by `setCwMass()` — the UI default only synced on slider input. First Fire inverted the
mechanism: the arm stuck at full cock, "as if the ball were heavier than the counterweight"
**[code + measured]**. Fix: after constructing the mechanism, push every Spec/UI default into the physics
bodies immediately, and add an assertion (read body.mass back and compare). Checklist item M6.

## 15. A background tab freezes rAF — verify in a live tab

When the browser tab is hidden, `requestAnimationFrame` stops, halting both rendering and the per-frame
physics step. A debug session concluded "the arm does not move" repeatedly on a background tab:
`world.time` stayed 0, `renderer.info.render.frame` was constant, while a manual `world.step()` worked
fine and the same build released normally in the foreground tab **[measured]**. Fix: before diagnosing
"mechanism does not move", confirm `document.visibilityState === "visible"` and that world time advances;
raise the tab or verify in the user's active tab. Checklist item P6.

## 16. Visual props need real colliders if they participate

Desk props that sit in the collision area (a pencil, an eraser, any decoration a projectile or block can
roll into) are drawn as meshes and, unless a static body is added, let the ball and blocks pass straight
through them **[code: environment.js pencil/eraser groups]**. Fix: derive a static Box collider from each
prop group's world position, quaternion and visual extent (pencil ~1.33 x 0.072 x 0.072, eraser
0.50 x 0.109 x 0.20 at 1 unit = 1 m), give it the default collision group so ball and blocks (group 1)
collide while the mechanism bodies (mask 4|2 or 0) are unaffected, and add it to the world once — it must
survive block resets. Checklist item T5.

## 17. Demo steps need an explicit end condition, not a fixed sleep

A replay/slow-mo step that sleeps a fixed wall-clock time stops at touchdown even when the projectile is
still rolling or flying, which reads as "the replay is broken". paper-trebuchet's 4.5 s sleep ended the
0.25x replay right after the ball landed **[code + measured]**. Fix: after firing, poll every rAF until the
projectile leaves the scene (position beyond the bounds) or its body speed drops below a small threshold,
with a generous timeout as a safety cap — the step then always plays to "the ball disappears". Checklist
item T3. Keep the final tour step static (reset, no auto-fire, no leftover animation) so it never looks
like the machine fired itself — checklist item T4.


## 18. Validation coverage expires when input ranges change

A verified parameter grid is only evidence for the grid it covered. paper-trebuchet's V2 suite
(5/5) and sweeps were first run on the audit parameters (cw 0.30-1.00 kg, ball 0.20-0.02 kg);
after the shipped sliders moved to cw 1.40-3.00 kg and ball 0.30-0.60 kg, that old PASS said
nothing about the shipped defaults, and the "cw < 1.40 inverts the mechanism" boundary claim had
no sweep evidence behind it **[code: sweep/xcheck grids pre-dating the range change]**. Fix:
re-run `sweep_trebuchet.mjs` and `xcheck_suite.mjs` (product-range family) whenever slider ranges
change, and keep the old grids recorded as regression history. The boundary is now measured:
cw 1.00/1.20 with ball 0.45 -> NO RELEASE, cw 1.40 -> releases at 1.23 m/s; ball 0.60 + cw 1.40
(a reachable slider combination) -> NO RELEASE, so the UI lower-left corner is a no-throw zone.
Checklist items M2/M3 (static balance / energy budget).
Follow-up (V7, 2026-10-02): sweep_trebuchet.mjs and xcheck_suite.mjs now READ their grids from the
Spec (counterweight mass_range/default_mass + counterweight_kg / ball_kg inputs), so any future
slider change is picked up by re-running the same command instead of hand-editing the grids.
Re-running over the expanded range (cw 1.4-10.0) EXPOSED a real gap the old grid (max 4.0) could
not see: at cw >= 4.8 with ball 0.30-0.45, the Cannon-es release angle runs ~1.9-2.0 deg below
the reference (29.3 vs 31.2 deg, 5-6% relative) with speed/land within 5% — a HingeConstraint
release-timing offset under strong driver torque. Solver iterations 50->100 did not converge it;
it is recorded as known engine bias (xcheck_suite.mjs comment) instead of being masked by a
looser gate. Lesson: a widened slider range re-opens engine-vs-reference agreement; re-run and
report, never carry the old PASS forward.


## 19. User "load" interactions change the mechanism's degrees of freedom — sliders and resets must re-settle

A load/aim interaction that pins the arm (KINEMATIC at rest) must NOT be the only
degree of freedom: when the player loads the projectile into the cup, the beam has
to swing freely under the real torque balance (a seesaw) or the "ball too heavy ->
left-tilted, cannot throw" behaviour cannot exist. paper-trebuchet's ball-stand
feature adds `unlockBalance()` (arm + counterweight DYNAMIC, cw mask 4|2 so a heavy
cw settles onto the chassis, hinge equations live, motor off) called on load and on
every slider change while a ball is loaded **[code: physics.js unlockBalance; main.js
loadBall/setBallMass/setWeight]**. Two traps: (a) `setBall()` rebuilds the mechanism
and leaves it locked at rest, so the caller MUST re-call unlockBalance after a
rebuild when a ball is loaded; (b) the seesaw stop (~45 deg logical lock) keeps the
beam from embedding into the chassis on the heavy-ball side — that stop is a
collision behaviour, not a parametrised "cannot fire" gate, so slider ranges stay
open and the physics decides throwability. Checklist M2 (static balance) covers the
torque balance check: cw 1.40 vs ball 0.60 is neutral-to-heavy-ball (NO RELEASE per
the solver) — the reachable UI lower-left corner is a no-throw zone by physics, not
by guard code.


## 20. A logical collision-stopper must never swallow the normal throw arc

A "seesaw-inversion" stop (arm pinned KINEMATIC past ~45 deg so the cup cannot
embed into the chassis) that fires on the raw condition `DYNAMIC && armAngle > 0.78`
locks the arm at the release angle on the FIRST frame of every throw — a throw
releases at +85 deg, which is already past the stop, and the arm is pinned before
it can swing back. paper-trebuchet hit exactly this: default combos threw fine
(counterweight torque wins, spin is negative), but the neutral-to-heavy-ball corner
(cw 1.40 vs ball 0.60 — a precise static-balance point, ~0.03 Nm difference) froze
at 85 deg and read as "stuck". Fix: give the stop a release grace window (400 ms of
free swing after `releaseMechanism` — the throw AND the reverse both start there)
and require cup-ward spin (`angularVelocity.z > 0.05 rad/s`) before locking, so the
lock only engages when the beam is genuinely being driven toward the chassis.
The neutral corner is then correct physics: the arm hangs motionless at the balance
angle (NO RELEASE per the solver) instead of freezing. Checklist M2/M3 (static
balance / energy budget): verify the stop does not steal energy from the throw arc
by re-measuring the default combo after any stopper change.

## 21. Decorative mechanism parts must be decoupled from the dynamics (visual-follow, never force-follow)

A demo can add a rope-and-winch control mechanism (rope, drum, hand cranks) for
storytelling without changing the physics. If the rope body participates in the
constraint solve, the beam's swing-back gets yanked by the rope length constraint;
if the rope/drum gets a collider, the projectile or counterweight collides with a
part that visually "should" give way. paper-trebuchet's winch rope is pure
visual: rope A-end tip is embedded inside the arm-bottom ring tube (flush, not
protruding), B-end is embedded in the drum centre; the rope is a Tube whose two
anchor points are the ring and drum, always taut and straight; drum hand cranks
rotate by a kinematic mapping of the arm angle (pull-down -> counter-clockwise,
release -> clockwise, in sync with the arm's angular velocity sign) [code:
trebuchet.js buildWinch, main.js drag/fire]. The mechanism never transmits force
and never collides; the throw reads are unchanged by the rope. Rule: classify each
part as dynamics or decorative; decorative parts get a kinematic mapping (angle ->
rotation / length), no collider that touches the throw, and a checklist note that
changing them must not change any launch readout. Checklist item T6.

## 22. A projectile released while overlapping the mechanism gets solver-pinned to zero velocity

When the ball sits in the cup at release, its sphere overlaps the cup/beam
colliders for the first solver steps. At normal step sizes the contact solver
pushes it out cleanly; under slow motion the physics delta shrinks but the overlap
may persist long enough that the solver clamps the ball's velocity to ~0, so the
replay then settles in ~12 ms and the slow-mo replay instantly ends
[code + measured: paper-trebuchet replay, 0.25x]. paper-trebuchet's fix:
releaseBall() activates collisions in stages, at release the ball's mask
excludes the mechanism group (chassis|frame|wheels|winch, 2|32|64) so it only
touches target blocks + table (1|4), and restores the full mask after 600 ms
[code: physics.js releaseBall]. Rule: any projectile that starts overlapping a
rigid launcher needs staged collision activation; verify under the slowest
supported time scale, not just at 1x. Checklist item P7.

## 23. A rolling projectile may never settle — event-driven end conditions beat velocity thresholds

Polling "end when speed < 0.06" works for a ball that comes to rest, but a
low-friction ball rolls across the table at ~0.08 m/s for 20+ s (contact damping
decays the velocity asymptotically), so the settled threshold never trips and the
replay hangs until the safety timeout [code + measured]. paper-trebuchet's
fix keeps the poll loop but adds an event-driven cap: the first real impact
(_impactMomentum > 0, set by the collide listener) starts a 5 s post-impact
timer, and the replay resolves on impact-time + 5 s regardless of the ball still
rolling, since the toppling blocks have finished by then. Rule: after the primary
impact event, cap the tail with a fixed wall-clock window (blocks finish toppling
in a few seconds); the generic timeout stays as the last-resort safety. Checklist
item T3 (extends pitfall 17).
