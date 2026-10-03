# sketch2sim project

Generated from `skill/sketch2sim/template/`.

## Run
```
npm install
npm run dev      # http://127.0.0.1:5500
```

## What you write
Only `src/mechanism.js` (the mechanism's geometry + physics) and the arrays in `src/spec.js`.
Everything else (desk, panel, tour/build mode, camera, slow-mo, render loop) is the shared shell.

## Before delivery
```
npm run verify  # must pass: no clip, no inversion, energy not injected, engine matches reference
```
