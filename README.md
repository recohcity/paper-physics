# paper-physics

![banner](assets/banner.png)

Turn a hand-drawn sketch into an interactive 3D physics model.

## Cases

| Case | Physics |
|---|---|
| **Trebuchet** | 4:1 lever counterweight drive, cannon-es rigid body, adjustable CW/ball weight/release angle, block pyramid knockdown |
| **Newton's Cradle** | V-string double-pendulum constraint, mass-weighted elastic collisions, steel/plastic material switch (density table), bidirectional collision experiments |

## Workflow

Submit a sketch → answer 3 confirmation gates (requirements / mesh roster / interaction nodes) → auto-build → review. No code or testing required from the user.

## Core principles

- **Spec is the contract**: sketch, 3D, and physics all derive from one spec
- **Physics from rigid bodies, not hardcoded formulas**: change a dimension, results follow
- **Feasibility before UI**: unworkable designs get killed in minutes
- **Declare what is not modeled**: rigid bodies don't cover strength/fatigue/fluids — state it honestly
- **Standardized lighting/desk/panel**: all cases share one visual baseline

## Run locally

### Preview built version

```bash
git clone https://github.com/recohcity/paper-physics.git
cd paper-physics
npx vite
```

Open http://localhost:5175/ to enter the lobby, click a drawing to enter a case.

### Dev mode (hot reload)

```bash
./dev.sh
```

Starts three dev servers: trebuchet 5173, newton-cradle 5174, lobby 5175.

## Project structure

```
cases/
├── lobby/          # Lobby entry (draggable drawing cards)
├── trebuchet/      # Trebuchet
└── newton-cradle/  # Newton's Cradle
skill/
└── sketch2sim/     # Reusable template + standards (12-step workflow,
                    # pitfalls, visual standards, audit gate script)
```

## License

MIT
