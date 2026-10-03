# Physics pitfalls

General engine and modeling rules. Each states the failure, the general fix, and how to check it.
Evidence tags: **[code]** read in a build, **[solver]** measured, **[inferred]** reasoned not observed.

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
