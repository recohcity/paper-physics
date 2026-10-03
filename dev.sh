#!/bin/bash
# Start all sketch2sim dev servers
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting trebuchet (5173)..."
cd "$ROOT/cases/trebuchet" && npm run dev -- --port 5173 &

echo "Starting newton-cradle (5174)..."
cd "$ROOT/cases/newton-cradle" && npm run dev -- --port 5174 &

echo "Starting lobby (5175)..."
cd "$ROOT/cases/lobby" && npm run dev -- --port 5175 &

wait
