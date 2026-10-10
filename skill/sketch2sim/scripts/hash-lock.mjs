#!/usr/bin/env node
// hash-lock.mjs — sign / verify requirements.lock (dual-file sha256)
//
// Part of the sketch2sim multi-agent pipeline (stage ①: requirements lock).
// Authority: docs/sketch2sim-multi-agent-architecture.md §2.3.1.
//
// The lock signs exactly two files of a case together:
//   - spec.json
//   - docs/intake-questions.md
// Lock file format (two spaces between hash and path, one line per file):
//   <sha256(spec.json)>             spec.json
//   <sha256(docs/intake-questions.md)>  docs/intake-questions.md
//
// Usage:
//   node hash-lock.mjs <caseDir> --write     generate / re-sign requirements.lock
//   node hash-lock.mjs <caseDir> --verify   check current files against the lock
//
// Exit codes:
//   0  all current file hashes match the lock (or lock written successfully)
//   2  usage error, lock missing/unreadable, any file missing, or any hash mismatch
//
// No third-party dependencies; Node >= 14 with node:crypto / node:fs / node:path.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Files covered by the lock, in lock-file order. Paths are relative to <caseDir>.
const LOCKED_FILES = ['spec.json', 'docs/intake-questions.md'];

const EXIT_OK = 0;
const EXIT_FAIL = 2;

function die(msg) {
  console.error(`hash-lock: ${msg}`);
  process.exit(EXIT_FAIL);
}

function sha256Hex(fileAbs) {
  const buf = fs.readFileSync(fileAbs);
  return createHash('sha256').update(buf).digest('hex');
}

function computeEntries(caseAbs) {
  const entries = [];
  for (const rel of LOCKED_FILES) {
    const abs = path.join(caseAbs, rel);
    if (!fs.existsSync(abs)) die(`locked file missing: ${rel}`);
    entries.push({ rel, hash: sha256Hex(abs) });
  }
  return entries;
}

function cmdWrite(caseAbs, lockPath) {
  const entries = computeEntries(caseAbs);
  const text = entries.map((e) => `${e.hash}  ${e.rel}`).join('\n') + '\n';
  fs.writeFileSync(lockPath, text, 'utf8');
  for (const e of entries) console.log(`${e.hash}  ${e.rel}`);
  console.log(`hash-lock: wrote ${path.relative(process.cwd(), lockPath)}`);
  process.exit(EXIT_OK);
}

function cmdVerify(caseAbs, lockPath) {
  if (!fs.existsSync(lockPath)) die(`requirements.lock missing: ${lockPath}`);
  const raw = fs.readFileSync(lockPath, 'utf8');
  const expected = new Map();
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // Split on the double-space separator "<hash>  <relpath>".
    const m = t.split(/\s{2,}/);
    if (m.length !== 2 || !/^[0-9a-f]{64}$/.test(m[0])) {
      die(`malformed lock line: ${JSON.stringify(line)}`);
    }
    expected.set(m[1], m[0]);
  }

  let ok = true;
  for (const rel of LOCKED_FILES) {
    const want = expected.get(rel);
    if (want === undefined) {
      console.error(`hash-lock: lock has no entry for ${rel}`);
      ok = false;
      continue;
    }
    const abs = path.join(caseAbs, rel);
    if (!fs.existsSync(abs)) {
      console.error(`hash-lock: file missing on disk: ${rel}`);
      ok = false;
      continue;
    }
    const got = sha256Hex(abs);
    if (got === want) {
      console.log(`ok    ${got}  ${rel}`);
    } else {
      console.error(`MISMATCH ${rel}\n  want ${want}\n  got  ${got}`);
      ok = false;
    }
  }
  // Any extra entries in the lock point to files no longer covered.
  for (const rel of expected.keys()) {
    if (!LOCKED_FILES.includes(rel)) {
      console.error(`hash-lock: lock has unexpected entry: ${rel}`);
      ok = false;
    }
  }
  if (!ok) die('hash verification failed (lock out of date or tampered)');
  console.log('hash-lock: all locked files match requirements.lock');
  process.exit(EXIT_OK);
}

function main() {
  const [caseDir, mode] = process.argv.slice(2);
  if (!caseDir || (mode !== '--write' && mode !== '--verify')) {
    console.error('usage: node hash-lock.mjs <caseDir> --write|--verify');
    process.exit(EXIT_FAIL);
  }
  const caseAbs = path.resolve(caseDir);
  if (!fs.existsSync(caseAbs)) die(`case directory not found: ${caseDir}`);
  const lockPath = path.join(caseAbs, 'requirements.lock');
  if (mode === '--write') cmdWrite(caseAbs, lockPath);
  else cmdVerify(caseAbs, lockPath);
}

main();
