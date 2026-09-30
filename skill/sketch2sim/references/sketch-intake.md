# Sketch intake (workflow steps 0-2)

This is the step the skill never had a real procedure for: every case run so far used
`source.kind: "code-extraction"` (Spec pulled from existing code), never `source.kind: "sketch"`. This file
is that procedure. It replaces the "planned" status on workflow step 1.

Three parts, run in order: **A. view requirements** (what to ask the user for before starting), **B.
recognition pass** (how Claude reads the sketch and what it outputs), **C. ambiguity confirmation** (how
that output turns into questions the user actually answers). None of this needs a CV/OpenCV pipeline —
Claude's native vision does the semantic + rough-coordinate read; script code only does the arithmetic
(pixel-to-metre conversion, Spec assembly, later the overlay check). Keep it that way; do not add an image
pipeline dependency unless the recognition pass proves too imprecise without one.

## A. View requirements

Ask for these up front; do not start recognition on a single unclear photo.

| Requirement | Minimum | Better | Why |
|---|---|---|---|
| Views | 1 (front/side, whichever shows the most parts) | + a second view (top or the other side) | A single 2D view cannot fix depth/thickness; every such dimension becomes `assumed` instead of `measured` |
| Scale anchor | One labeled real dimension, OR a reference object of known size in frame (ruler, coin, A4/Letter sheet, grid paper) | A labeled dimension on the longest visible part | Without this `scale.status` cannot leave `CONFLICT`; nothing downstream is trustworthy |
| Legibility | Contour lines distinguishable from background and from each other at the resolution provided | Clean line drawing, minimal shading/clutter, even lighting, close to orthogonal (not a steep-angle photo) | Perspective distortion and low contrast are the main causes of wrong pixel coordinates |
| Multiple views | If more than one image, say which is which (front/side/top) | Keep a consistent orientation across views (same "up") | Otherwise Claude cannot correlate the same part across views |
| Dimension notes | None required | Any handwritten measurements on the sketch | Every noted dimension becomes `declared`, not `assumed` — free accuracy |

If what's provided fails Legibility or has no Scale anchor candidate at all, stop and ask for a redraw/rescan
or a stated anchor before running the recognition pass — do not silently guess a scale.

When the person hands over a sketch, treat asking for these as the start of Intake (workflow step 0), not a
separate gate: ask in one message, accept what's already sufficient (e.g. a stated anchor makes a reference
object unnecessary), and proceed with whatever was provided, flagging gaps as `assumed` rather than blocking
indefinitely.

## B. Recognition pass (step 1)

Read the sketch **part by part**, not as one holistic description. Produce this JSON (no script needed to
produce it — Claude writes it directly from looking at the image(s)):

```json
{
  "template_guess": "hinged_lever_with_hanging_counterweight | four_bar_linkage | ... | custom",
  "template_confidence": 0.0,
  "scale_anchor_candidate": { "description": "...", "real_mm": 0, "px": 0, "view": "front", "confidence": 0.0 },
  "parts": [
    { "id": "arm", "label": "long throwing arm", "shape_guess": "extruded rect, ~constant thickness",
      "bbox_px": { "view": "front", "x": 0, "y": 0, "w": 0, "h": 0 },
      "material_guess": "wood", "role": "moving", "confidence": 0.0 }
  ],
  "joints": [
    { "id": "pivot", "between": ["arm", "frame"], "type_guess": "hinge", "axis_guess": "out-of-page",
      "anchor_px": { "view": "front", "x": 0, "y": 0 }, "limits_guess": null, "confidence": 0.0 }
  ],
  "guides": [
    { "id": "ramp", "constrains": "ball", "shape_guess": "curved track, payload stays on its surface",
      "path_px": { "view": "front", "points": [[0,0]] }, "confidence": 0.0 }
  ],
  "fields": [
    { "id": "lodestone_field", "source_part": "lodestone", "acts_on": ["ball"],
      "kind_guess": "magnetic_attraction | gravity | electrostatic", "monotonicity": "decreasing_with_distance",
      "confidence": 0.0 }
  ],
  "ambiguities": []
}
```

`joints` is for two parts rigidly pinned/sliding against each other (hinge, slider, fixed, ball). Two other
kinds of constraint show up in sketches and are NOT joints — give them their own arrays so the recognition
pass doesn't force-fit them into a joint type that doesn't apply:

- **`guides`**: a payload follows a fixed track/channel/surface under its own dynamics (gravity, contact,
  momentum) rather than being pinned to it — a ramp, a chute, a rail a ball rolls along. The part list still
  gets an entry for the track itself (`role: "fixed"` guide geometry); `guides[]` records which payload
  follows which track and the rough path.
- **`fields`**: a part exerts a non-contact force on another across a gap — magnetic, electrostatic, a stated
  "pulls/repels" in the sketch's caption. Record `monotonicity` (does the force increase or decrease with
  distance — true of essentially every real field source) even when the exact force law is unknown; that one
  property is usually enough to reason about feasibility (see `references/mechanism-templates.md`, the
  monotonic-field gate) without needing the field's magnitude at all.

A single sketch can use joints, guides and fields together; classify each constraint into whichever array
actually describes it, and leave the others empty rather than stretching `joints` to cover a track or a
magnet.

Rules for filling it in:

- One entry per visually distinguishable part; do not merge parts that could move independently even if
  drawn touching.
- `bbox_px` is a rough bounding region read off the image, not a traced outline — precise enough to convert
  to metres with the scale anchor, nothing more at this stage.
- Every joint (anywhere two parts meet or one clearly pivots on another) gets an entry, defaulting
  `type_guess` to `"hinge"` only when rotation is visually obvious (a drawn pin, circle, or hatch mark);
  otherwise `"assumed:fixed"` and flag it — 2D sketches under-specify joints more than anything else.
- Before writing a new template, check `references/mechanism-templates.md` for one that already matches —
  it names the feasibility gate to use so step 3 doesn't have to be derived from scratch every time.
- `confidence` is Claude's own calibrated estimate (not a placeholder): a labeled dimension or an unambiguous
  drawn pin is high confidence (>0.85); a part whose thickness, material or exact boundary is not visible is
  low (<0.6).
- Populate `ambiguities[]` with every field below confidence 0.8 automatically as you go — do not do a
  separate re-scan for this; it is a filter over what you already produced.

## C. Ambiguity confirmation (step 2, before writing the Spec)

Turn `ambiguities[]` into questions the user actually answers — this is what makes an `assumed` value become
`declared`, or confirms it should stay `assumed` on record.

- Batch by kind, not by part: one round for joint types, one for hidden dimensions/thickness, one for
  materials, rather than 20 separate part-by-part questions.
- Every question states Claude's best guess and asks for a correction, not an open-ended "what is this":
  "The arm pivot looks like a pin joint (rotates freely) — correct, or is it fixed?" beats "what kind of
  joint is this?".
- Use `interaction.ask` (the `ask` tool) for anything with a small enumerable answer set (joint type, material class,
  which view is front); use plain text questions only for numeric corrections (an actual thickness in mm).
- Anything the user doesn't answer or explicitly says "you decide" stays `assumed` in the Spec, listed in the
  report per the provenance rules in `spec-schema.md` — never silently upgraded to `declared`.
- Do not ask about anything above the 0.8 confidence threshold; re-litigating high-confidence reads wastes
  the user's attention and teaches them to stop reading the questions.
- After this round, `scale.status` must be `"OK"` (anchor confirmed) before writing the rest of the Spec —
  everything else can proceed with `assumed` entries, scale cannot.

## Output of this stage

A Spec with `source.kind: "sketch"`, `source.images: [...]`, every `parts[]`/`joints[]` dimension carrying
`measured` (from confirmed pixel coords) or `assumed` (confirmed-as-assumed or unanswered) provenance. This
feeds workflow step 3 (feasibility gate) exactly like a code-extracted Spec does — nothing downstream
changes based on where the Spec came from.

## What this does not cover yet

- **Overlay fidelity check** (render the 3D build from the same view, diff against the sketch) is still
  planned, not built. It is a separate, later step (after step 5, engine build) — it checks the *build*
  against the *sketch*, not the recognition pass against anything. Do not conflate the two.
- This procedure has not been run end-to-end on a real sketch yet (paper-trebuchet's Spec was always
  code-extracted). Treat it as a first draft to be corrected by that first real run, not as validated.
