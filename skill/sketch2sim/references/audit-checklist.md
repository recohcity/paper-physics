---
tags: [T3, T4, T5, G1, G3, G4, audit, self_check]
provenance: cases/trebuchet（audit V2-V5 修复）+ cases/newton-cradle
---

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
| M6 | Declared values actually reach the runtime bodies | trace construction and every slider handler; after build, read body.mass/geometry and compare with the Spec/UI default. A mismatch means the UI number never reached the physics body and the mechanism behaves at a stale default | H |
| P1 | Physics uses a fixed step independent of display rate; animation is time-based | search for per-frame constants (`dt = 0.016`); to confirm a suspected frame-rate bug, run in a throttled browser (e.g. Chrome DevTools CPU 4x) and compare flight time against a fixed-step build | H |
| P2 | Slow motion keeps smooth rendering | is render state interpolated when physics steps are skipped?; to confirm, record screen at 0.25x and count rendered frames vs physics steps | M |
| P3 | `v_max * dt` is below the smallest colliding feature, or CCD/substeps exist | arithmetic on the fastest body | H |
| P4 | Stack stability method declared; freeze/activation hacks listed as assumptions | read body-type switching code | M |
| P5 | Counted outcomes have written criteria | read the counting function; copy into Spec outputs | H |
| P6 | Runtime verification happens in a live tab | before concluding "mechanism does not move", confirm `document.visibilityState === "visible"` and world time is advancing; a background tab freezes rAF, halting both rendering and physics — a frozen "no release" is an artifact, not evidence [measured] | M |
| P7 | A projectile that starts overlapping the launcher releases cleanly under the slowest supported time scale | enable the slowest scale and fire; the projectile must fly, not get solver-pinned to ~0 velocity and "settle" instantly — staged collision activation (mask excludes the launcher at release, restored after a short window) is the fix | H |
| G1 | Sketch layer and 3D geometry come from the same data | perturb one dimension; both must change | H |
| G2 | Layer offsets defined for coplanar/overlapping parts | look for z-fighting workarounds, manual y offsets | M |
| V1 | Reference solver energy drift ~0 without dissipation | run the domain's reference solver; read its energy-drift metric | B |
| V2 | Engine build agrees with reference within ~5% | run the domain's reference-vs-engine cross-check on the same inputs; compare the key outputs. Treat an in-browser sample as carrying ~±7% sampling bias versus a fixed-step reference (release sampled on 60 Hz frames with interpolation), or sample from the fixed-step state | B |
| T1 | Annotation / hotspot anchors come from the rendered meshes' world positions, never hand-copied coordinates | grep the label anchor source; move the camera, labels must still touch their parts | H |
| T2 | Overlapping/crossing part labels are resolved by a deterministic layout (text-box push-out + leader-curve cross-check + same-column vertical-chain detection) | show all labels; none overlap, no leaders cross, no two labels stack in one column | M |
| T3 | Demo / replay steps have an explicit end condition (poll until the projectile leaves the scene or settles), not a fixed sleep | slow-mo replay must keep playing until the action ends, never pause right after touchdown. A rolling low-friction body may never trip a velocity threshold — cap the tail on the primary impact event (impact time + a few seconds) instead, keeping the generic timeout as safety | M |
| T4 | Tour end state is static: no auto-firing, no leftover animation from the previous step; reset to the manipulable idle state | click the final step; nothing fires, ball is back in the cup, previous step's motion has stopped | M |
| T5 | Every static world prop carries a real collider sized/posed from its mesh — including ones that look decorative | throw/roll a body at the prop; it stops the body instead of passing through. Classify each object dynamic-actor / static-world-prop / visual-follow at build time. Static props (ceiling bar, base, pencil, eraser, walls, table edges) have no actuator but ARE solid: the action body must collide with them. "Decorative" means "does not move", not "no collider". Only an explicitly declared exemption (e.g. a pure backdrop) may lack one | B |
| T6 | True visual-follow parts are decoupled: no independent body, no force transfer, no collider touching the action; motion by kinematic mapping of a dynamic state | move the body it follows; the mapping tracks exactly; change it and every readout is unchanged. (This is ropes/dial needles — NOT static props, which must collide per T5) | M |
| T7 | Compound interactions complete in one pointer session without a required release/click in between | load, drag and release in one continuous press; no intermediate "load then click again" gap | M |
| T8 | Self-checked before handoff, not by the user | Before the first user handoff, run headless (node or screenshot): rest state settles as drawn, no body clips a static prop, no body inverts/escapes, the action fires. The user finding a clip/inversion/loose collider means this was skipped | B |
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
