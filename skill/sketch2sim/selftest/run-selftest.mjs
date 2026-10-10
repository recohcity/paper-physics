#!/usr/bin/env node
// run-selftest.mjs — self-test harness for the sketch2sim machine referee.
//
// Proves that skill/sketch2sim/scripts/run-gates.mjs is NOT a "green-by-default"
// bug: for each known bad sample it must be intercepted at the SPECIFIC gate it
// was designed to catch, with the SPECIFIC exit code from §4 of
// docs/sketch2sim-multi-agent-architecture.md.
//
//   exit codes from run-gates.mjs:
//     0 PASS, 1 A-class (impl != req), 2 contract (hash lock),
//     3 C-class fuse, 4 B-class change channel.
//
// Usage:
//   node skill/sketch2sim/selftest/run-selftest.mjs
//
// Exit: 0 if every bad sample is CAUGHT at its expected gate/exit, 1 otherwise.
// Pure Node ESM, no third-party deps.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gates = path.join(__dirname, '..', 'scripts', 'run-gates.mjs');

// Each bad fixture lives next to this runner. Expectations mirror §4:
//   gate = the FIRST gate that must print FAIL (or 'hash' for the pre-gate).
//   exit = the exact process exit code run-gates.mjs must return.
const CASES = [
  { name: 'bad-1', title: '空心测试 (hollow verify, no assert)', gate: 'G1', exit: 1 },
  { name: 'bad-2', title: '篡改哈希锁 (spec.json changed, not re-signed)', gate: 'hash', exit: 2 },
  { name: 'bad-3', title: '假物理 (probe returns constant, no perturb drift)', gate: 'G4', exit: 1 },
  { name: 'bad-4', title: '破坏 tour 步骤名 (legacy PLAY step)', gate: 'G2', exit: 1 },
  { name: 'bad-5', title: 'resetAll 漏清角速度', gate: 'G2', exit: 1 },
];

// Run run-gates.mjs fresh (drop any stale run-state.json so a prior fuse cannot
// mask the fresh verdict) and return { exit, firstFail, output }.
function runCase(dir) {
  const stateFile = path.join(dir, 'run-state.json');
  try { fs.rmSync(stateFile, { force: true }); } catch {}

  let stdout = '';
  let exit = 0;
  try {
    stdout = execFileSync(process.execPath, [gates, dir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    stdout = (e.stdout || '') + (e.stderr || '');
    exit = typeof e.status === 'number' ? e.status : 1;
  }

  // First FAIL line wins (gates run in order; lastFailGate keeps the first).
  const failRe = /^FAIL\s+([A-Za-z0-9-]+)\s*:/m;
  const m = stdout.match(failRe);
  let firstFail = m ? m[1] : null;

  // The hash pre-gate does not print a "FAIL hash:" line; it prints a FATAL
  // MISMATCH and exits 2. Map that onto the 'hash' gate label.
  if (!firstFail && /MISMATCH|hash contract broken|hash verification failed/i.test(stdout)) {
    firstFail = 'hash';
  }
  return { exit, firstFail, output: stdout };
}

let allCaught = true;
const rows = [];

for (const c of CASES) {
  const dir = path.join(__dirname, c.name);
  if (!fs.existsSync(dir)) {
    console.error(`!! fixture missing: ${dir}`);
    allCaught = false;
    rows.push({ c, status: 'ESCAPED', reason: 'fixture missing' });
    continue;
  }
  const r = runCase(dir);
  const gateOk = r.firstFail === c.gate;
  const exitOk = r.exit === c.exit;
  const caught = gateOk && exitOk;
  if (!caught) allCaught = false;

  const tag = caught ? 'CAUGHT' : 'ESCAPED';
  const detail = caught
    ? `gate=${r.firstFail} exit=${r.exit}`
    : `expected gate=${c.gate}/exit=${c.exit} but got gate=${r.firstFail}/exit=${r.exit}`;
  console.log(`${tag.padEnd(8)} ${c.name} (${c.title}) -> ${detail}`);
  rows.push({ c, status: tag, detail });
}

console.log('');
console.log('--- summary ---');
for (const r of rows) {
  console.log(`  ${r.status.padEnd(8)} ${r.c.name}: ${r.detail}`);
}
console.log('');
if (allCaught) {
  console.log(`selftest: ${CASES.length}/${CASES.length} bad samples CAUGHT — referee is not green-by-default.`);
  process.exit(0);
} else {
  const escaped = rows.filter((r) => r.status !== 'CAUGHT').map((r) => r.c.name);
  console.error(`selftest: ESCAPED = ${escaped.join(', ')}`);
  process.exit(1);
}
