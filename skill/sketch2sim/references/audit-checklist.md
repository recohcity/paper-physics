# Audit checklist

Use when building a new model (as a self-check) or auditing an existing one. Severity: **B** blocks any
feasibility claim, **H** should fix, **M** improve. Mark each item Pass / Fail / Unverified with evidence.

| ID | Check | How to verify | Sev |
|---|---|---|---|
| S1 | One scale anchor defined and recorded in the Spec | read `scale`; a real dimension maps to a scene length | B |
| S2 | Gravity, masses, display units and any paper/texture scale agree with S1 | grep for unit conversions and scale comments; compare | B |
| S3 | Masses derive from density x volume, or implied density is plausible | compute implied density of each declared mass | H |
| M1 | Mechanism dynamics come from bodies/joints/masses, not formulas | change a Spec dimension; does the result change? | B |
| M2 | Static balance holds through the travel | torque of driver vs payload + structure at start pose and key angles | B |
| M3 | Energy budget supports the claimed payload speed | `E_driver - E_payload_PE - E_structure_PE >= 0.5 m v^2` | B |
| M4 | User-driven input ranges are derived from geometry | trace the source of each limit | H |
| M5 | Release / stop model is declared and swept | find the release code; is timing/angle a parameter? | H |
| M6 | Declared values actually reach the runtime bodies | trace construction and every slider handler; after build, read body.mass/geometry and compare with the Spec/UI default. paper-trebuchet failed this: the UI default 2.60 kg never reached the counterweight body (physics stayed at the 1.0 kg constructor default), inverting the mechanism on first Fire [measured] | H |
| P1 | Physics uses a fixed step independent of display rate; animation is time-based | search for per-frame constants (`dt = 0.016`); to confirm a suspected frame-rate bug, run in a throttled browser (e.g. Chrome DevTools CPU 4x) and compare flight time against a fixed-step build | H |
| P2 | Slow motion keeps smooth rendering | is render state interpolated when physics steps are skipped?; to confirm, record screen at 0.25x and count rendered frames vs physics steps | M |
| P3 | `v_max * dt` is below the smallest colliding feature, or CCD/substeps exist | arithmetic on the fastest body | H |
| P4 | Stack stability method declared; freeze/activation hacks listed as assumptions | read body-type switching code | M |
| P5 | Counted outcomes have written criteria | read the counting function; copy into Spec outputs | H |
| P6 | Runtime verification happens in a live tab | before concluding "mechanism does not move", confirm `document.visibilityState === "visible"` and world time is advancing; a background tab freezes rAF, halting both rendering and physics — a frozen "no release" is an artifact, not evidence [measured] | M |
| P7 | A projectile that starts overlapping the launcher releases cleanly under the slowest supported time scale | enable 0.25x (or the min scale) and fire; the projectile must fly, not get solver-pinned to ~0 velocity and "settle" instantly — staged collision activation (mask excludes the mechanism at release, restored after ~600 ms) is the fix [paper-trebuchet: replay settled in ~12 ms until releaseBall staged the mask] | H |
| G1 | Sketch layer and 3D geometry come from the same data | perturb one dimension; both must change | H |
| G2 | Layer offsets defined for coplanar/overlapping parts | look for z-fighting workarounds, manual y offsets | M |
| V1 | Reference solver energy drift ~0 without dissipation | run `mech2d.mjs`, read `energy_drift_J` | B |
| V2 | Engine build agrees with reference within ~5% | run `xcheck_suite.mjs` (hinged-lever template); compare speed/angle on the same inputs. Status on paper-trebuchet: **Pass** — as-built negative control and fixes A-D, speed within 1%, angle within 3.2%. **Front-end caveat:** the 5% gate covers engine-vs-solver (cannon_trebuchet.mjs vs mech2d.mjs, both 240 Hz fixed-step). A browser build samples the release on 60 Hz rAF frames with interpolation and measured +6.8% vs the golden reference on identical mechanism parameters [measured]; treat in-browser values as carrying ~±7% sampling bias, or sample from the fixed-step state | B |
| T1 | Annotation / hotspot anchors come from the rendered meshes' world positions, never hand-copied coordinates | grep the label anchor source; move the camera, labels must still touch their parts [paper-trebuchet: hard-coded anchor guesses all drifted off-target] | H |
| T2 | Overlapping/crossing part labels are resolved by a deterministic layout (text-box push-out + leader-curve cross-check + same-column vertical-chain detection) | show all labels; none overlap, no leaders cross, no two labels stack in one column | M |
| T3 | Demo / replay steps have an explicit end condition (e.g. poll until the projectile leaves the scene or settles), not a fixed sleep | slow-mo replay must keep playing until the ball is gone/settled, never pause right after it lands [paper-trebuchet: fixed 4.5 s sleep stopped the replay at touchdown]. A rolling low-friction ball may never trip a velocity threshold (~0.08 m/s for 20+ s) — cap the tail on the primary impact event (impact time + ~5 s) instead, keeping the generic timeout as safety [pitfall 23] | M |
| T4 | Tour end state is static: no auto-firing, no leftover animation from the previous step; reset to the manipulable idle state | click the final step; nothing fires, ball is back in the cup, previous step's motion has stopped | M |
| T5 | Scene props that interact with the simulation (pencil, eraser, any deco) have real colliders sized/posed from their meshes, with correct collision groups | throw/roll a body at the prop; it stops the body instead of passing through [paper-trebuchet: ball passed through the pencil until static boxes were added]. Extend to the whole scene: the launcher itself, ball stand, winch and every visible object must block the projectile and blocks, or carry an explicit exemption [paper-trebuchet: full blocking for chassis/frame/wheels/winch/stand] | H |
| T6 | Decorative mechanism parts (rope, drum, hand cranks, indicators) are decoupled from dynamics: no force transfer, no collider that touches the throw, motion by kinematic mapping of the real state (arm angle -> rope length / drum rotation / direction sign) | change a decorative part; every launch readout must be unchanged; drag cocking and release must rotate the decoration in sync [paper-trebuchet: winch rope pure visual, A-end flush in ring tube, B-end in drum centre, hand cranks follow the arm] | M |
| T7 | Compound interactions complete in one pointer session without a required release/click in between | load the ball by pressing the cup, then keep the same press to drag and release to fire; no "load then click again to drag" gap [paper-trebuchet: load-ball fell through into the drag grab] | M |
| R1 | Report lists assumed and fitted quantities | read the report | B |
| R2 | Report lists what is not modeled | read the report | H |
| R3 | Verdict wording matches the evidence table in SKILL.md | compare | H |

## Audit procedure

1. Extract a Spec from the code (`source.kind = "code-extraction"`); list fitted formulas with file:line.
2. Run the items top to bottom; do S and M first because a failure there invalidates the rest.
3. For every Fail, attach the evidence (line, number, or solver output).
4. Propose changes and verify each with the reference solver before recommending it.
5. Record which findings the checklist predicted and which were new; add new ones as items. The checklist is
   only as good as the audits it has survived.
