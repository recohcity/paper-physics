# Build Panel Layout Standards

Every custom model case has a build panel. These rules come from Newton's Cradle
iterations where the panel was reworked 15+ times. Follow them from the first
commit to avoid rework.

## 0. Prime directive: compact, space-saving

The build panel lives at the bottom of a 3D scene. Its job is to hold ALL
controls in the smallest footprint possible:
- Prefer 2 rows over 3 rows. Prefer side-by-side cards over stacked rows.
- Do not add rows "because there's room" — collapse related controls into the
  same row.
- Card padding: `8px 12px`. Button padding: `4px 8px`. Font: 11px.
- The panel should occupy a thin strip along the bottom edge, never a large
  block. If it covers more than ~15% of screen height, it's too tall.
- When adding a new control, first try to fit it into an existing card row
  before adding a new card or new row.

## 1. Card-per-responsibility

- Each functional group gets its own `.panel-section.throw-section` card.
- Do **not** mix unrelated controls in one card.
- Typical split for a physics demo:
  - Card A: experiment controls (sliders, toggles, mode buttons)
  - Card B: object parameters (material switches, per-actor toggles)
  - Card C: playback (Slow / Play / Reset / Sound)
- When the user says "独立卡片", that means a separate `.throw-section` div,
  not just another row inside the existing card.

## 1.5. Card map — mandatory GATE before writing HTML

Before writing ANY build panel HTML, produce a card map and get user sign-off:

```
Card 1 (flex:1): [name]
  - row 1: control A, control B
  - row 2: control C
Card 2 (flex:1): [name]
  - row 1: ...
Card 3 (flex:1): [name]
  - row 1: ...
  - row 2: ...
```

Save this map to `cases/<slug>/docs/interaction-nodes.md` (append to the
interaction section). This is the single source of truth for what goes where.
If the user later asks to move a control, update the doc first, then the HTML.
Never re-derive layout from memory across iterations.

## 2. Width: always flex, never fixed px

- Cards container: `display:flex; flex-direction:row; gap:6px;`
- Each card: `flex:1;` (equal share) — except a small icon-only card which
  can use `flex:0 0 auto`.
- Never write `width:320px` etc. unless the user explicitly asks.
- This makes the panel adapt to any window width.

## 3. Height: all cards equal

- Cards in the same row stretch to the tallest (`align-items:stretch` on the
  flex container).
- Inside each card, use `display:flex; flex-direction:column; justify-content:center;`
  so content is vertically centered regardless of which card is tallest.

## 4. Internal layout: top section + bottom section

- Inside a card: top = title + primary controls, bottom = secondary info
  (legends, hints).
- Title font: `font-size:11px; color:#8a7e6e; letter-spacing:1px;` — same as
  "Bidirectional" / "Material" labels.
- Legend row below controls: `white-space:nowrap` to prevent wrapping,
  left-aligned with the card title (no `padding-left` indent).

## 5. Button consistency

- Same card: same `padding:4px 8px; font-size:11px;` on all buttons.
- Primary action buttons (Play, Slow): `class="action-btn btn-primary"`.
- Secondary actions (Reset): `class="action-btn"`.
- Icon-only buttons (sound): `class="action-btn icon-only"`.
- Buttons in the same row use `flex:1` so they stretch equally.
- Reset and Slow must have identical height and width.

## 6. Before writing HTML — confirm the card map

Before touching index.html, write down and confirm:
```
Card 1 (flex:1): [title] — [controls]
Card 2 (flex:1): [title] — [controls] + [legend row]
Card 3 (flex:1): [title] — [buttons row 1] / [buttons row 2]
```
If the user has described the panel in words, parse each functional group into
its own card. Do not guess which controls go together.

## 7. Tour vs Build visibility

- The entire build panel has class `build-panel` and starts with `hidden`.
- Tour mode hides it automatically; Build mode shows it.
- Every button/slider/toggle that is not part of the guided tour must live
  inside this panel. Never add a floating control outside it that would leak
  into tour mode.
