# Changelog

All notable changes to this project will be documented in this file.

## [0.0.2] - 2026-09-27

### Added
- **Multi-stage sketch-to-model morph**: chained animation — pencil sketch on paper → paper-craft parts → white 3D model → textured wooden model, with paper sketch disappearing once 3D model appears.
- **Synchronized morph across all objects**: trebuchet, ball, and block pyramid transition through all stages together.
- **Pendulum & recoil physics**: counterweight pendulum swing during drag and launch, trebuchet recoil on ball release.
- **Drag-to-pull interaction**: continuous tilt sound proportional to drag speed, release restore sound on let-go.
- **Stainless steel hardware**: bearing pins, hanger lugs, and ball bearing ball with proper env-map reflections.
- **Integrated player scrubber**: moved into bottom control bar.
- **Auto-sleep physics**: blocks settle to STATIC after collision, no jitter on window resize.

### Changed
- **Layout**: bottom panel restructured — nav left, player center, build controls right; tour banner hidden in build mode.
- **Audio**: continuous drag tilt sound (400–800Hz sine), release triangle wave; click no longer triggers sound.
- **Paper**: 6mm thick box with correct shadow; sketch hidden once 3D model appears.
- **Camera**: auto-fit entire desk + paper + objects across all three views; zoom slider at 160% default.

### Fixed
- Blocks no longer fly away on second shot (fixed-timestep physics, proper activation timing).
- Ball no longer visible during sketch phase.
- Metal materials no longer render black (RoomEnvironment env map).
- Cup geometry wraps 3/4 of sphere.

## [0.0.1] - 2026-09-27

### Added
- **Core 3D & Physics Simulation**:
  - Implemented real-time trebuchet lever physics with gravitational counterweight drive using Three.js and Cannon-es.
  - Projectile ballistics simulation with drag, restitution, and collision callbacks.
  - 10-block target pyramid in a 4-3-2-1 structure with realistic dynamic collapse.
- **Sketch-to-Model Morphing**:
  - Seamless slider-driven transition from 2D pencil draft blueprint to realistic 3D textured balsa wood trebuchet model.
  - Handwritten-style dynamic trajectory arc (Flight path) and telemetry annotation overlay on 2D canvas.
- **Interactive Controls & Audio**:
  - Direct pointer drag on the cup/spoon to cock the lever, with release-to-fire mechanics.
  - Telemetry stats tracking: Speed (m/s), Angle (°), Range (mm), and Downed Blocks (X/10).
  - Web Audio sound effects for arm creak, release whoosh, projectile thud, and block collapses.
  - 0.25× slow motion toggle and multi-angle view switching (Hero, Side, Top).
- **Tour & Sandbox Modes**:
  - "Play the tour" narrative playback showing physical counterweight calibration.
  - "Build it yourself" full-control mode for custom experiments.

### Changed & Fixed
- **Cup & Cradle Geometry Refinement**:
  - Redesigned the wooden spoon cradle to completely wrap the underside of the bowl as a 3D hemispherical shell with an equatorial rim disc flush with the bowl rim.
  - Cleaned up obsolete overlapping 1/3 contour extrusion artifacts.
  - Aligned the cradle, bowl, and arm beam flush on the horizontal plane ($y = 0.021$).
- **Physical Ground Constraint (No Desk Penetration)**:
  - Solved analytical ground contact limits, restricting maximum cocking angle to $84.5^\circ$.
  - Prevented the wooden spoon from penetrating or sinking into the paper/table during mouse dragging.
- **Target Blocks Shape Standardization**:
  - Corrected target blocks from tall vertical rectangular prisms to uniform cubes ($0.088 \times 0.088 \times 0.088$).
  - Synchronized blueprint sketch illustrations in the texture generator to match the 3D cubes.
- **Repository Setup**:
  - Established project naming as `paper-trebuchet` matching the GitHub repository.
  - Unified version to `0.0.1` across `package.json`, `package-lock.json`, and release tags.
