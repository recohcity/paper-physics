# Spec schema v0

One JSON file describes the design. Sketch textures, 3D geometry, physics bodies, UI ranges and the report
are all generated from it. Full worked example: `examples/trebuchet.spec.json`.

## Provenance (required on every quantity that affects dynamics)

```json
{ "value": 0.20, "provenance": "declared | measured | derived | assumed | fitted", "note": "..." }
```

| Tag | Meaning | Report treatment |
|---|---|---|
| declared | user stated it | list |
| measured | read from sketch using the scale anchor; include `px` and `confidence` | list if confidence < 0.8 |
| derived | computed from other Spec values (volume x density, geometric limit) | no flag |
| assumed | Claude's choice to fill a gap (thickness, density, restitution) | **always list, user confirms** |
| fitted | tuned so the behaviour looks right | **always list; blocks a feasibility verdict** |

## Top-level fields

- `spec_version`, `name`, `source` (`sketch` with image paths, or `code-extraction` for audits)
- `scale`: `{ unit_definition, anchor: { description, real_mm, px }, status: "OK" | "CONFLICT" }`.
  One definition of what 1 scene unit means. Simulation units, display units and any texture/paper scale
  must all follow it. `CONFLICT` blocks everything downstream.
- `world`: gravity (already in scene units), ground/table height, origin conventions
- `parts[]`: id, shape (primitive, extruded contour with `thickness`, or lathe), dimensions, material id,
  `role` (`fixed | moving | payload | target`)
- `materials[]`: id, density, friction/restitution pairs (`provenance` each)
- `joints[]`: id, type (`hinge | slider | fixed | ball`), parts, axis, anchor points, limits, `provenance`
  (joint types are the most ambiguous thing in a 2D drawing; default to `assumed` and ask)
- `guides[]`: id, the payload part it constrains, the track/channel part providing the surface, and a rough
  path (points or curve description) in scene units. Use for a part that follows a fixed surface under its
  own dynamics (ramp, chute, rail) rather than being pinned to it — do not encode these as `joints`.
- `fields[]`: id, `source_part`, `acts_on` (parts affected), `kind` (`magnetic | electrostatic | gravity |
  other`), `monotonicity` (`increasing_with_distance | decreasing_with_distance | constant`), `provenance`.
  The exact force law is usually `assumed` or unknown; `monotonicity` alone is frequently enough to reach a
  feasibility verdict (see `references/mechanism-templates.md`) without ever measuring field strength.
- `mechanism`: domain-specific block (see `references/mechanism-templates.md` for the physics domain).
  The sub-block shape follows the domain's reference implementation — e.g. `rigid_linkage` (hinged lever)
  in the example, `field_force` for a field-driven payload, `track_guided` for a payload on a rail. A
  device may draw on several domains; `mechanism` holds the geometry they share.
- `inputs[]`: id, range, `range_provenance` (prefer `derived`: e.g. cocking angle limited by ground contact)
- `outputs[]`: id, unit, and for counted outcomes an explicit **criterion** (e.g. what "knocked down" means)
- `target`/`environment`: arrangements the mechanism acts on
- `fitted_quantities_in_current_project[]`: audit mode only, lists formulas standing in for physics, with file:line

## Validation rules (a Spec must pass before any build)

1. `scale.status == "OK"` and one unit definition.
2. Every mass, inertia, density, friction, restitution and length used by the solver has provenance.
3. No `fitted` entry on a load-bearing quantity unless the build is labelled demonstration-grade.
4. Every input range is either declared or derived; derived ranges name the geometric reason.
5. Every counted output has a criterion.
6. Every joint has axis, anchor and limits (or an explicit "unlimited").
7. Masses come from density x volume unless declared; if declared, check the implied density is plausible for
   the material.
8. Sketch-derived textures and 3D geometry read the same Spec fields (test by perturbing one dimension and
   confirming both change).
