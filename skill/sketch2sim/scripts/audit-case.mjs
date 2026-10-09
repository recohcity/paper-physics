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
  // R1: spec.js must import from '../spec.json' (single source of truth), not hand-copy numbers
  if (!/from\s+['"]\.\.\/spec\.json['"]/.test(specJsContent)) {
    fail(`${specJsRel} does not import from '../spec.json' — numbers are hand-copied, principle 1 violated`);
  } else {
    pass(`${specJsRel} imports from spec.json (single source of truth)`);
  }
  // Is spec.js actually imported anywhere outside itself? If not, it is decorative.
  const srcFiles = fs.existsSync(p('src'))
    ? fs.readdirSync(p('src')).filter((f) => f.endsWith('.js') && f !== 'spec.js')
    : [];
  const importers = [];
  const importedButUnused = [];
  for (const f of srcFiles) {
    const content = read(`src/${f}`);
    const importLineMatch = content.match(/import\s+(\{[^}]+\}|\w+)\s+from\s+['"]\.\/spec(\.js)?['"];?/);
    if (!importLineMatch) continue;
    importers.push(f);
    const namesRaw = importLineMatch[1].replace(/[{}]/g, '');
    const boundNames = namesRaw.split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
    const bodyWithoutImportLine = content.replace(importLineMatch[0], '');
    const unusedNames = boundNames.filter((name) => {
      const usageRe = new RegExp(`\\b${name}\\b`);
      return !usageRe.test(bodyWithoutImportLine);
    });
    if (unusedNames.length > 0) importedButUnused.push({ file: f, names: unusedNames });
  }
  if (importers.length === 0) {
    fail(`src/spec.js exists but is not imported by any other src/*.js file — it is dead code, not a source of truth`);
  } else if (importedButUnused.length > 0) {
    for (const { file, names } of importedButUnused) {
      fail(`src/${file} imports {${names.join(', ')}} from spec.js but never references them again — the import is decorative.`);
    }
  } else {
    pass(`src/spec.js is imported AND the binding is actually referenced in: ${importers.join(', ')}`);
  }
} else {
  warn(`${specJsRel} not found`);
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

// --- 4. Heuristic: hard-coded numbers in src/*.js that DUPLICATE spec.json values -------------------
// Principle 1: physics numbers live in spec.json only. If the same decimal appears in a src/*.js
// file (other than spec.js which imports it), it's likely a hand-copied duplicate that will drift.
console.log('\n-- Heuristic: hard-coded duplicates of spec values (warnings only) --');
if (hasSpecJson) {
  const specStr = JSON.stringify(JSON.parse(read('spec.json')));
  const specNumbers = new Set(
    (specStr.match(/-?\d+\.\d+/g) || []).map(Number)
  );
  // Filter out common constants that legitimately appear everywhere
  const COMMON = new Set([0, 1, 2, 0.5, 0.01, 0.02, 0.1, 0.2, 0.3, 0.95, 0.97, 0.98, 1.5, 9.81, 9.82]);
  const meaningfulSpecNumbers = [...specNumbers].filter(n => !COMMON.has(n) && Math.abs(n) > 0.001);
  const srcFiles = fs.existsSync(p('src'))
    ? fs.readdirSync(p('src')).filter((f) => f.endsWith('.js') && f !== 'spec.js')
    : [];
  let totalDups = 0;
  for (const f of srcFiles) {
    const content = read(`src/${f}`);
    const literals = [...content.matchAll(/(?<![\w.])-?\d+\.\d{2,}(?![\w])/g)].map((m) => parseFloat(m[0]));
    const dups = [...new Set(literals.filter(n => meaningfulSpecNumbers.some(sn => Math.abs(n - sn) < 0.001)))];
    if (dups.length > 0) {
      warn(`src/${f} hard-codes ${dups.length} value(s) that match spec.json: ${dups.slice(0,5).join(', ')}${dups.length > 5 ? ', …' : ''} — should use SPEC.* instead`);
      totalDups += dups.length;
    }
  }
  if (totalDups === 0) pass('no hard-coded spec duplicates found in src/*.js');
}

// --- 5. Tour stage naming must use SKETCH/LIFT/MODEL/MATERIAL (not legacy READ/WOOD) ----
console.log('\n-- Tour stage naming --');
for (const f of ['src/main.js', 'index.html']) {
  if (!exists(f)) continue;
  const content = read(f);
  const legacy = [];
  if (/\b'READ'\b/.test(content) || /\b"READ"\b/.test(content)) legacy.push('READ');
  if (/\b'WOOD'\b/.test(content) || /\b"WOOD"\b/.test(content)) legacy.push('WOOD');
  if (legacy.length > 0) {
    fail(`${f} still uses legacy tour stage name(s): ${legacy.join(', ')} — must be SKETCH/MATERIAL per visual-standards.md`);
  } else {
    pass(`${f} uses standardized tour stage names`);
  }
}

// --- Summary ---------------------------------------------------------------------------------------
console.log(`\n=== ${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} failure(s), ${warnings} warning(s) ===\n`);
process.exit(failures === 0 ? 0 : 1);
