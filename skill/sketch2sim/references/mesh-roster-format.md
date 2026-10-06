# Mesh Roster Format

Every case's `docs/mesh-roster.md` must classify **every mesh** in the GLB into
exactly one of three roles, with clear properties. This is the Step 6 user-gate
document — the user confirms before you build physics.

## Required structure

### 1. DYNAMIC — moves with physics
Group meshes by rigid assembly (e.g. one pendulum = ball + sockets + caps).
For each assembly, list:
- Which mesh is the actual **collision body** (carries mass, integrates motion)
- Which meshes are **rigid-follow** (move with the body but have no mass themselves)
- What it **collides with**

Format:
```
### Assembly N (name)
| Mesh | Type | Property |
|---|---|---|
| Ball_N | collision body | dynamic, collides with X |
| Part_A | rigid-follow | follows Ball_N |
```

### 2. STATIC — fixed world, never moves
List every mesh that stays put. Group by purpose (frame, props, root nodes).
State: receive shadow, zero velocity, no collision response.

### 3. VISUAL-FOLLOW — kinematic, no physics
List meshes that are positioned every frame by code (ropes, arms, cables).
State: no mass, no collision, what they connect.

## Rules
- **Every mesh in the GLB must appear exactly once** — no orphans.
- Total count must add up (e.g. 25 dynamic + 28 static + 10 follow = 63 total).
- A mesh is never both dynamic and static.
- If a mesh starts static and later becomes dynamic, note the transition.
- Include calibration values (measured radius, string length, spacing).

## CRITICAL — no pass-through
This is the most repeated bug across cases: **objects visually pass through each other
because collision bodies were never created for them.**

Before declaring step 6 done:
- Every **dynamic** mesh listed must have a matching physics body (collider shape + mass).
- Every **static** mesh that dynamic objects hit must have a static collider
  (walls, floor, beams, frames).
- **Visual-follow** meshes (ropes, cables) do NOT need colliders — they are decorative.
- Do not rely on "it looks like they touch" — verify in a headless run that dynamic
  bodies actually stop at static boundaries, not tunnel through.
- If a dynamic object can swing past a visual boundary (e.g. ball above beam),
  that boundary MUST have a collider or an explicit angular clamp.

## Reference example
See `cases/newton-cradle/docs/mesh-roster.md` — 5 pendulums × 5 meshes = 25 dynamic,
28 static frame/hooks, 10 ropes visual-follow.
