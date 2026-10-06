#!/usr/bin/env node
// audit-case.mjs — mechanical gate for "is this case actually delivered per SKILL.md/project-delivery.md".
// This replaces hand-run checklist items (case-onboarding.md) with a script that exits non-zero on any
// failure, so delivery no longer depends on an agent remembering to check. Run before calling a case done:
//
//   node scripts/audit-case.mjs cases/<slug>
//
// Exit 0 = every required artifact present and non-trivial, spec.js is actually wired in, verify.mjs runs
// and passes. Exit 1 = at least one hard failure (see FAIL lines). Warnings do not fail the run but are
// printed — they flag things this script can check only heuristically (e.g. hard-coded numbers that might
// belong in spec.json).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const caseDir = process.argv[2];
if (!caseDir) {
  console.error('usage: node audit-case.mjs <case-dir>');
  process.exit(2);
}
if (!fs.existsSync(caseDir) || !fs.statSync(caseDir).isDirectory()) {
  console.error(`FAIL  case directory does not exist: ${caseDir}`);
  process.exit(1);
}

let failures = 0;
let warnings = 0;
const pass = (msg) => console.log(`PASS  ${msg}`);
const fail = (msg) => { console.log(`FAIL  ${msg}`); failures++; };
const warn = (msg) => { console.log(`WARN  ${msg}`); warnings++; };

const p = (...parts) => path.join(caseDir, ...parts);
const exists = (rel) => fs.existsSync(p(rel));
const read = (rel) => fs.readFileSync(p(rel), 'utf8');
const sizeOf = (rel) => (exists(rel) ? fs.statSync(p(rel)).size : 0);

// A file existing with near-zero content (an empty dir placeholder, or just the template's own stub
// comment copied verbatim) does not count as delivered. Threshold is deliberately low — this is a floor,
// not a quality bar; it only catches "nothing was written here at all".
const MIN_BYTES = 40;
function requireNonTrivialFile(rel, label) {
  if (!exists(rel)) { fail(`${label} missing: ${rel}`); return false; }
  const size = sizeOf(rel);
  if (size < MIN_BYTES) { fail(`${label} exists but is empty/trivial (${size} bytes): ${rel}`); return false; }
  pass(`${label} present (${size} bytes): ${rel}`);
  return true;
}

console.log(`\n=== audit-case: ${caseDir} ===\n`);

// --- 1. Spec is the single source of truth (principle 1) ---------------------------------------------
console.log('-- Spec --');
const hasSpecJson = requireNonTrivialFile('spec.json', 'spec.json');
if (hasSpecJson) {
  try {
    const spec = JSON.parse(read('spec.json'));
    if (spec?.scale?.status === 'OK') pass('spec.json scale.status = "OK"');
    else fail(`spec.json scale.status is "${spec?.scale?.status}", expected "OK"`);
  } catch (e) {
    fail(`spec.json is not valid JSON: ${e.message}`);
  }
}

const specJsRel = 'src/spec.js';
if (exists(specJsRel)) {
  const specJsContent = read(specJsRel);
  if (/no physics yet|reserved;? not built|workstream b/i.test(specJsContent)) {
    fail(`${specJsRel} still contains placeholder/stub language — never filled in for real`);
  }
  // Is spec.js actually imported anywhere outside itself? If not, it is decorative.
  const srcFiles = fs.existsSync(p('src'))
    ? fs.readdirSync(p('src')).filter((f) => f.endsWith('.js') && f !== 'spec.js')
    : [];
  const importers = srcFiles.filter((f) => /from\s+['"]\.\/spec(\.js)?['"]/.test(read(`src/${f}`)));
  if (importers.length === 0) {
    fail(`src/spec.js exists but is not imported by any other src/*.js file — it is dead code, not a source of truth`);
  } else {
    pass(`src/spec.js is imported by: ${importers.join(', ')}`);
  }
} else {
  warn(`${specJsRel} not found (ok if this domain genuinely has no runtime-tunable spec, otherwise should exist)`);
}

// --- 2. The three user gates must have left a record ---------------------------------------------------
console.log('\n-- Gate artifacts (docs/) --');
for (const [rel, label] of [
  ['docs/intake-questions.md', 'Step 0 gate (intake Q&A)'],
  ['docs/mesh-roster.md', 'Step 6 gate (mesh roster)'],
  ['docs/interaction-nodes.md', 'Step 8 gate (interaction nodes)'],
  ['docs/report.md', 'Step 11 delivery report'],
  ['docs/verify.log', 'headless self-check output'],
  ['docs/feedback.md', 'post-mortem / lessons'],
]) {
  requireNonTrivialFile(rel, label);
}

// --- 3. Headless self-check must exist, not be the template stub, and must actually pass --------------
console.log('\n-- test/verify.mjs --');
const verifyRel = 'test/verify.mjs';
if (!exists(verifyRel)) {
  fail(`${verifyRel} missing — no headless self-check for this case`);
} else {
  const verifyContent = read(verifyRel);
  if (/PASS \(stub\)/.test(verifyContent) || verifyContent.trim().length < MIN_BYTES) {
    fail(`${verifyRel} is still the template placeholder — no real assertions were written`);
  } else {
    pass(`${verifyRel} has project-specific content (${verifyContent.length} bytes)`);
    try {
      const out = execFileSync('node', [p(verifyRel)], { encoding: 'utf8', timeout: 30000 });
      pass(`${verifyRel} ran and exited 0`);
      if (out.trim()) console.log(out.trim().split('\n').map((l) => `      ${l}`).join('\n'));
    } catch (e) {
      fail(`${verifyRel} failed to run or exited non-zero: ${e.message.split('\n')[0]}`);
    }
  }
}

// --- 4. Heuristic: hard-coded numbers in mechanism.js that don't trace to spec.json --------------------
console.log('\n-- Heuristic: possible hard-coded quantities (warnings only) --');
const mechRel = 'src/mechanism.js';
if (exists(mechRel) && hasSpecJson) {
  const mech = read(mechRel);
  const specValues = new Set(
    JSON.stringify(JSON.parse(read('spec.json'))).match(/-?\d+\.\d+/g) || []
  );
  const mechNumbers = [...mech.matchAll(/(?<![\w.])-?\d+\.\d{2,}(?![\w])/g)].map((m) => m[0]);
  const untraced = mechNumbers.filter((n) => !specValues.has(n));
  const uniqueUntraced = [...new Set(untraced)];
  if (uniqueUntraced.length > 0) {
    warn(`${mechRel} has ${uniqueUntraced.length} decimal literal(s) not found anywhere in spec.json — ` +
      `may be fine (tolerances, epsilons) or may be quantities that should be declared. Sample: ` +
      `${uniqueUntraced.slice(0, 8).join(', ')}${uniqueUntraced.length > 8 ? ', …' : ''}`);
  } else {
    pass(`no untraced decimal literals found in ${mechRel}`);
  }
}

// --- Summary ---------------------------------------------------------------------------------------
console.log(`\n=== ${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s), ${warnings} warning(s) ===\n`);
process.exit(failures === 0 ? 0 : 1);
