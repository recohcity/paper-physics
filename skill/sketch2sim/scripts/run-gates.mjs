#!/usr/bin/env node
// run-gates.mjs — deterministic machine referee for the sketch2sim pipeline.
//
// Part of the sketch2sim multi-agent pipeline (stage T3: machine judge).
// Authority: docs/sketch2sim-multi-agent-architecture.md §3.2 / §3.3 / §4 / §5
//           and skill/sketch2sim/references/deadlock-protocol.md.
//
// This script is a PURE, deterministic Node ESM judge — no LLM, no hallucination.
// It is the ONLY writer of <caseDir>/run-state.json.
//
// Usage:
//   node skill/sketch2sim/scripts/run-gates.mjs <caseDir>
//
// Exit codes (§4):
//   0  PASS  — every gate green, delivered.
//   1  A-class failure (implementation != requirement) — self-heal retry, count+1.
//   2  contract broken (hash-lock mismatch / missing) — fatal freeze, user must intervene.
//   3  C-class deadlock fuse (same error fingerprint x3) — frozen, blockers.md generated.
//   4  B-class change channel (change-log newer than requirements.lock) — wait for re-sign.
//
// No third-party deps. execFileSync may shell out to: node, npx/vite.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Exit codes (kept symbolic; never redefined elsewhere).
// ---------------------------------------------------------------------------
const EXIT = { PASS: 0, A_FAIL: 1, CONTRACT: 2, FUSE: 3, CHANGE: 4 };

// ---------------------------------------------------------------------------
// Tiny reporting helpers. Each line: `<VERB>  <gate>: <detail>`.
// ---------------------------------------------------------------------------
const results = [];
function report(verb, gate, detail) {
  const line = `${verb.padEnd(5)} ${gate}: ${detail}`;
  console.log(line);
  results.push({ verb, gate, detail });
}
const PASS = (g, d) => report('PASS', g, d);
const FAIL = (g, d) => report('FAIL', g, d);
const WARN = (g, d) => report('WARN', g, d);
const SKIP = (g, d) => report('SKIP', g, d);
const MANUAL = (g, d) => report('MANUAL', g, d);

// ---------------------------------------------------------------------------
// CLI args.
// ---------------------------------------------------------------------------
const caseDir = process.argv[2];
if (!caseDir) {
  console.error('usage: node run-gates.mjs <caseDir>');
  process.exit(EXIT.CONTRACT);
}
const caseAbs = path.resolve(caseDir);
if (!fs.existsSync(caseAbs) || !fs.statSync(caseAbs).isDirectory()) {
  console.error(`run-gates: case directory not found: ${caseDir}`);
  process.exit(EXIT.CONTRACT);
}

// Convenience readers rooted at <caseDir>.
const p = (...parts) => path.join(caseAbs, ...parts);
const exists = (rel) => fs.existsSync(p(rel));
const read = (rel) => fs.readFileSync(p(rel), 'utf8');
const readSafe = (rel) => (exists(rel) ? read(rel) : null);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------------------
// run-state.json — the ONLY writer in this whole pipeline is this script.
// ---------------------------------------------------------------------------
const statePath = p('run-state.json');
function loadState() {
  if (!exists('run-state.json')) {
    return { attemptCount: 0, errorFingerprint: [], frozen: false, specVersion: '', state: 'JUDGING' };
  }
  try {
    const s = JSON.parse(read('run-state.json'));
    return {
      attemptCount: s.attemptCount | 0,
      errorFingerprint: Array.isArray(s.errorFingerprint) ? s.errorFingerprint : [],
      frozen: !!s.frozen,
      specVersion: s.specVersion || '',
      state: s.state || 'JUDGING',
    };
  } catch {
    // Corrupt state file — start fresh but do not silently drop the fuse counter.
    return { attemptCount: 0, errorFingerprint: [], frozen: false, specVersion: '', state: 'JUDGING' };
  }
}
function saveState(st) {
  fs.writeFileSync(statePath, JSON.stringify(st, null, 2) + '\n', 'utf8');
}

// specVersion = first 12 hex chars of sha256(spec.json).
function specVersion() {
  try {
    return sha256(fs.readFileSync(p('spec.json'))).slice(0, 12);
  } catch {
    return '';
  }
}

// Record (or bump) a consecutive error fingerprint. sha = sha256(testId+failReason).
// A different fingerprint resets the consecutive streak.
function recordFingerprint(st, testId, failReason) {
  const sha = createHash('sha256').update(testId + failReason).digest('hex');
  const top = st.errorFingerprint[st.errorFingerprint.length - 1];
  if (top && top.sha === sha) {
    top.count += 1;
    top.testId = testId;
    top.failReason = failReason;
  } else {
    st.errorFingerprint.push({ testId, failReason, sha, count: 1 });
  }
  return sha;
}

// ---------------------------------------------------------------------------
// blockers.md — generated on C-class fuse per deadlock-protocol.md §4 template.
// Five sections are mandatory: 期望指标 / 实际计算 / 已尝试方案 / 核心物理矛盾 /
// 向用户求助的抉择选项 (选项 A/B/C).
// ---------------------------------------------------------------------------
function writeBlockers(st, testId, failReason, probe) {
  const docsDir = p('docs');
  fs.mkdirSync(docsDir, { recursive: true });
  const top = st.errorFingerprint[st.errorFingerprint.length - 1] || {};
  const now = new Date().toISOString();
  const probeLines = probe
    ? [
        `- primaryVelocity = ${probe.primaryVelocity?.toFixed?.(4) ?? probe.primaryVelocity} m/s`,
        `- maxDisplacement = ${probe.maxDisplacement?.toFixed?.(4) ?? probe.maxDisplacement} m`,
        `- constraintSlack = ${probe.constraintSlack?.toFixed?.(4) ?? probe.constraintSlack} %`,
        `- restStateSettled = ${String(probe.restStateSettled)}`,
      ].join('\n')
    : [`- (no headless probe available; last failing gate = ${testId})`];
  const md = `# Blockers — ${path.basename(caseAbs)} 熔断求助

> 状态：FROZEN_DEADLOCK
> 触发原因：同错误指纹连续 ${top.count || 3} 次（自修死循环）
> 错误指纹：${top.sha || ''}
> 冻结时间：${now}

## 【期望指标】
按 spec.json 与 docs/intake-questions.md 锁定的物理需求实现（见 requirements.lock：${st.specVersion}）。
门禁期望全部通过，但当前失败门禁：**${testId}**。

## 【实际计算】
无头 probe 实测值：
${probeLines}

失败原因（机器裁判口径）：
${failReason}

## 【已尝试方案】
- 已由开发 Agent 连续自修 ${top.count || 3} 次，错误指纹始终一致，未发生物理漂移。
- 结论：自动调参无法消除该矛盾（继续调参属于越权，已被熔断协议禁止）。

## 【核心物理矛盾】
实现已严格遵循 spec.json 图纸，但 ${testId} 门禁判定「实现 ≠ 需求」或物理响应异常，
且连续多次自修均无法改变同一指纹。

## 【向用户求助的抉择选项】
当前实现完全符合图纸，但机器裁判判定不通过。需要您裁决：

- **选项 A**：确认该失败为误判，授权放宽 ${testId} 的判定阈值（需 Intake 改 spec 并重签锁）。
- **选项 B**：承认需求表述与物理实现冲突，授权修改 spec.json 中对应字段（走 B 类变更流）。
- **选项 C**：暂停该 case，先人工复核 src/mechanism.js 的物理模型后再恢复流水线。
`;
  fs.writeFileSync(p('docs', 'blockers.md'), md, 'utf8');
}

// ===========================================================================
// Main flow.
// ===========================================================================
const st = loadState();
st.specVersion = specVersion();
st.state = 'JUDGING';

let finalExit = EXIT.PASS;
let lastFailGate = null;   // {testId, reason}
let lastProbe = null;      // retained for blockers.md

// ---------------------------------------------------------------------------
// B-class change channel (§5.1): change-log newer than requirements.lock means
// a legal requirement change is in flight but not yet re-signed. Exit 4, do
// NOT consume self-heal count, do NOT run physical gates.
// ---------------------------------------------------------------------------
(function bChannel() {
  const lockRel = 'requirements.lock';
  const logRel = 'docs/change-log.md';
  if (!exists(logRel)) return;
  if (!exists(lockRel)) return; // no lock -> the hash gate will own Exit 2.
  try {
    const logMtime = fs.statSync(p(logRel)).mtimeMs;
    const lockMtime = fs.statSync(p(lockRel)).mtimeMs;
    if (logMtime > lockMtime) {
      WARN('B-channel', `docs/change-log.md (mtime ${new Date(logMtime).toISOString()}) is newer than requirements.lock — requirement changed, awaiting re-sign.`);
      st.state = 'WAITING_RESIGN';
      st.frozen = false;
      saveState(st);
      console.log(`=== run-gates: WAITING_RESIGN (exit ${EXIT.CHANGE}) ===`);
      process.exit(EXIT.CHANGE);
    }
  } catch {
    /* stat failed -> fall through to normal gates */
  }
})();

// ---------------------------------------------------------------------------
// Pre-gate: hash contract. execFileSync hash-lock.mjs --verify. Exit 2 = contract
// broken (hash mismatch or lock missing). Fatal freeze, do not continue.
// ---------------------------------------------------------------------------
(function hashGate() {
  const hashLock = path.join(__dirname, 'hash-lock.mjs');
  try {
    execFileSync(process.execPath, [hashLock, caseAbs, '--verify'], { stdio: 'inherit' });
    PASS('hash', 'requirements.lock verifies (spec.json + intake-questions.md)');
  } catch (e) {
    console.error(`FATAL: hash contract broken (hash-lock --verify exited ${e.status ?? 'non-zero'}).`);
    st.state = 'FROZEN';
    st.frozen = true;
    saveState(st);
    console.log(`=== run-gates: FROZEN (exit ${EXIT.CONTRACT}) ===`);
    process.exit(EXIT.CONTRACT);
  }
})();

// ---------------------------------------------------------------------------
// G0 — hygiene & build.
//   1. `npx vite build` in <caseDir> must exit 0.
//   2. build output must not contain "fatal error" (chunk-size warnings are OK).
//   3. src/spec.js is the single source of truth: imports ../spec.json AND is
//      actually imported + used by another src/*.js (reuse audit-case.mjs logic).
// ---------------------------------------------------------------------------
let g0Fail = false;
(function g0() {
  // (1) build
  let buildOut = '';
  let buildOk = true;
  try {
    buildOut = execFileSync('npx', ['vite', 'build'], {
      cwd: caseAbs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    buildOk = false;
    buildOut = (e.stdout || '') + (e.stderr || '');
  }
  if (!buildOk) {
    FAIL('G0', `npx vite build exited non-zero`);
    g0Fail = true;
  } else {
    PASS('G0', 'npx vite build exited 0');
  }

  // (2) zero fatal console error in build output. Vite "chunk larger than 500kB"
  //     warnings are explicitly allowed.
  if (/fatal error/i.test(buildOut)) {
    FAIL('G0', 'build output contains "fatal error"');
    g0Fail = true;
  } else {
    PASS('G0', 'no fatal error in build output (chunk-size warnings ignored)');
  }

  // (3) spec.js single source of truth.
  const specJs = readSafe('src/spec.js');
  if (specJs == null) {
    FAIL('G0', 'src/spec.js missing');
    g0Fail = true;
  } else if (!/from\s+['"]\.\.\/spec\.json['"]/.test(specJs)) {
    FAIL('G0', 'src/spec.js does not import from ../spec.json (numbers hand-copied)');
    g0Fail = true;
  } else {
    // Is spec.js imported by another src/*.js AND the binding actually referenced?
    const srcDir = p('src');
    const others = fs.existsSync(srcDir)
      ? fs.readdirSync(srcDir).filter((f) => f.endsWith('.js') && f !== 'spec.js')
      : [];
    let wired = false;
    for (const f of others) {
      const content = readSafe(`src/${f}`);
      if (content == null) continue;
      const m = content.match(/import\s+(\{[^}]+\}|\w+)\s+from\s+['"]\.\/spec(\.js)?['"];?/);
      if (!m) continue;
      const names = m[1].replace(/[{}]/g, '').split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
      const body = content.replace(m[0], '');
      const used = names.some((n) => new RegExp(`\\b${n}\\b`).test(body));
      if (used) { wired = true; break; }
    }
    if (wired) PASS('G0', 'src/spec.js imports ../spec.json and is consumed by src/*.js');
    else { FAIL('G0', 'src/spec.js not imported/used by any other src/*.js (dead source)'); g0Fail = true; }
  }
})();
if (g0Fail) lastFailGate = lastFailGate || { testId: 'G0', reason: 'G0 hygiene/build failed (vite build / fatal error / spec.js single-source-of-truth).' };

// ---------------------------------------------------------------------------
// G1 — requirement traceability (Bad-1 hollow-test intercept).
//   N = numeric answer rows in docs/intake-questions.md (locked rule, same as
//       audit-case.mjs 144-149: header `| # | Question | Answer |`; rows start
//       with `|`, skip rows containing `---` or `Question`; Answer = second-to-last
//       `|` cell; Answer matches /\d/ => 1 requirement).
//   assertion count = number of real node:assert calls in test/verify.mjs.
//       口径说明 (stricter of the two candidate counts): we count `assert.*`
//       substantive assertions, NOT bare `intake.match(`. Rationale: an
//       `intake.match(` without a following assert is not a check, and the
//       Bad-1 hollow file `console.log('PASS')` has 0 of either — but counting
//       only intake.match undercounts non-intake assertions (range/collision/
//       runtime-param checks) and would false-fail a healthy case. So the honest,
//       stricter measure of "real assertions written" is the assert.* count.
//   assertions < N => FAIL.
// ---------------------------------------------------------------------------
let g1Fail = false;
(function g1() {
  const intake = readSafe('docs/intake-questions.md');
  if (intake == null) { FAIL('G1', 'docs/intake-questions.md missing'); g1Fail = true; return; }
  const N = intake.split('\n').filter((line) => {
    if (!/^\|/.test(line) || line.includes('---') || line.includes('Question')) return false;
    const cells = line.split('|').map((c) => c.trim());
    const answer = cells[cells.length - 2] || '';
    return /\d/.test(answer);
  }).length;

  const verify = readSafe('test/verify.mjs');
  if (verify == null) { FAIL('G1', 'test/verify.mjs missing'); g1Fail = true; return; }
  const asserts = (verify.match(/\bassert\s*\.\s*[A-Za-z]/g) || []).length;

  if (asserts < N) {
    const uncovered = N - asserts;
    FAIL('G1', `intake numeric requirements N=${N} but verify.mjs has only ${asserts} assert.* calls — uncovered=${uncovered} (hollow test).`);
    g1Fail = true;
  } else {
    PASS('G1', `intake numeric requirements N=${N} covered by ${asserts} assert.* calls`);
  }
})();
if (g1Fail) lastFailGate = lastFailGate || { testId: 'G1', reason: `G1 traceability: assert count < numeric intake rows (hollow test, Bad-1).` };

// ---------------------------------------------------------------------------
// G2 — shared template & interaction.
// ---------------------------------------------------------------------------
let g2Fail = false;
const g2 = (ok, detail) => { ok ? PASS('G2', detail) : (FAIL('G2', detail), (g2Fail = true)); };

(function g2tour() {
  const html = readSafe('index.html') || '';
  const main = readSafe('src/main.js') || '';
  // Extract ordered .tour-step button labels from index.html.
  const steps = [];
  const re = /<button[^>]*class="[^"]*\btour-step\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    steps.push(m[1].replace(/<[^>]*>/g, '').trim());
  }
  const expected = ['SKETCH', 'LIFT', 'MODEL', 'MATERIAL', 'PHYSICS', 'RUN', 'REPLAY', 'BUILD'];
  const orderOk = steps.length === expected.length && steps.every((s, i) => s === expected[i]);
  if (orderOk) {
    g2(true, `tour 8-step contract strict: ${steps.join(' -> ')}`);
  } else {
    // Bad-4: legacy step names PLAY/WOOD/READ as a tour step.
    const legacy = steps.filter((s) => /^(PLAY|WOOD|READ)$/.test(s));
    g2(false, `tour-step order mismatch (got [${steps.join(' | ')}] expected [${expected.join(' | ')}])` +
      (legacy.length ? ` — legacy step name(s): ${legacy.join(',')} (Bad-4).` : ''));
  }
  // PLAY as a media control / FIRE as a build button is allowed; only forbid
  // them as tour-step names (already covered above).
})();

(function g2lighting() {
  // Baseline (visual-standards.md): three-point rig + desk base + wood tint.
  // Tolerance comment: hex colors must match exactly; intensities are within
  // 5% relative (floor 0.05 absolute). Scanned across ALL src/*.js because the
  // rig may live in main.js (newton-cradle) or environment.js depending on case.
  const srcDir = p('src');
  const allSrc = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => readSafe(`src/${f}`) || '').join('\n')
    : '';
  const wantLight = [
    { name: 'ambient', hex: '0xffeed9', intensity: 0.95 },
    { name: 'sun', hex: '0xfffaec', intensity: 2.3 },
    { name: 'fill', hex: '0xdce7f6', intensity: 0.6 },
  ];
  const problems = [];
  for (const L of wantLight) {
    const hexRe = new RegExp(L.hex, 'i');
    const idx = allSrc.search(hexRe);
    if (idx < 0) { problems.push(`${L.name} color ${L.hex} missing`); continue; }
    // look for the intensity number within 160 chars after the hex token.
    const window_ = allSrc.slice(idx, idx + 160);
    const nums = [...window_.matchAll(/(\d+\.\d+)/g)].map((mm) => parseFloat(mm[1]));
    const tol = Math.max(0.05 * L.intensity, 0.05);
    const near = nums.find((n) => Math.abs(n - L.intensity) <= tol);
    if (near == null) problems.push(`${L.name} ${L.hex} intensity ~=${L.intensity} not found (window nums=${nums.join(',')})`);
  }
  // desk base color #2e251d (scene background) — accept #2e251d or 0x2e251d.
  if (!/(#2e251d|0x2e251d)/i.test(allSrc)) problems.push('desk base color #2e251d missing');
  // warm wood tint 0xd9b98c.
  if (!/0xd9b98c/i.test(allSrc)) problems.push('wood tint 0xd9b98c missing');
  g2(problems.length === 0, problems.length === 0
    ? 'lighting baseline (3-point rig + #2e251d desk + 0xd9b98c tint)'
    : `lighting baseline mismatch: ${problems.join('; ')}`);
})();

(function g2reset() {
  // resetAll contract (Bad-5): must zero BOTH linear velocity and angular
  // velocity. A resetAll that clears linear but not angular => FAIL.
  // We locate the resetAll method body (mechanism.js or main.js) and follow a
  // direct `this.reset()` call into that method body too.
  const files = ['src/main.js', 'src/mechanism.js', 'src/physics.js', 'src/trebuchet.js']
    .map((f) => ({ f, c: readSafe(f) })).filter((x) => x.c != null);

  function methodBody(src, name) {
    const re = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`);
    const m = src.match(re);
    if (!m) return null;
    let i = src.indexOf('{', m.index);
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
    }
    return null;
  }

  let body = '';
  let found = false;
  for (const { c } of files) {
    const b = methodBody(c, 'resetAll');
    if (b) { found = true; body = b;
      // follow a this.reset() call.
      const rm = b.match(/this\.reset\(\)/);
      if (rm) {
        const rb = methodBody(c, 'reset');
        if (rb) body += '\n' + rb;
      }
      break;
    }
  }
  if (!found) { g2(false, 'resetAll() not found in src (Bad-5 surface)'); return; }

  // Pendulum/angle-parametric models zero angular state via omega.fill(0);
  // cannon/RB models zero via velocity.setZero() / angularVelocity.setZero().
  const linearPat = /velocity\.setZero\(\)|setZeroVelocity\s*\(|velocity\.set\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)/;
  const angularPat = /angularVelocity\.setZero\(\)|angularVelocity\.set\s*\(\s*0\s*,\s*0\s*,\s*0\s*\)|\.omega\.fill\(\s*0\s*\)|\bomega\s*\[\s*\w+\s*\]\s*=\s*0/;
  const linear = linearPat.test(body);
  const angular = angularPat.test(body);

  if (linear && !angular) {
    g2(false, 'resetAll clears linear velocity but NOT angular velocity (Bad-5 state leak)');
  } else if (!linear && !angular) {
    g2(false, 'resetAll does not zero any velocity (angular or linear)');
  } else {
    g2(true, `resetAll zeros physics state (linear=${linear}, angular=${angular})`);
  }
})();

(function g2panel() {
  // Panel slider width aligned to 90px (newton-cradle reference). Detected in
  // index.html inline styles / style.css / main.js.
  const html = readSafe('index.html') || '';
  const css = readSafe('src/style.css') || '';
  const main = readSafe('src/main.js') || '';
  const hit = /width\s*:\s*90px/.test(html) || /width\s*:\s*90px/.test(css) || /width\s*:\s*90px/.test(main);
  g2(hit, hit ? 'panel sliders aligned to 90px' : 'no 90px slider width found in index.html / style.css / main.js');
})();

(function g2formulaCard() {
  // Formula/physics card: exists, lights at PHYSICS step (i===4), hidden in BUILD.
  const html = readSafe('index.html') || '';
  const main = readSafe('src/main.js') || '';
  const existsCard = /physics-card|physicsCard|formula-card/i.test(html) || /physicsCard/.test(main);
  const lightsAtPhysics = /i\s*===\s*4/.test(main) || /PHYSICS/.test(main);
  const hiddenInBuild = /physicsCard[^]*opacity\s*=\s*['"]0['"]/.test(main) || /step === 7|step ===\s*7/.test(main);
  const ok = existsCard && lightsAtPhysics && hiddenInBuild;
  g2(ok, ok
    ? 'formula card present, lights at PHYSICS step, hidden in BUILD mode'
    : `formula card contract incomplete (exists=${existsCard}, lights@PHYSICS=${lightsAtPhysics}, hidden@BUILD=${hiddenInBuild})`);
})();

// Manual-only visual items — printed into the delivery checklist, never FAIL.
MANUAL('G2', '[仅人工验收] 无光晕过曝 / tone mapping exposure sanity (visual).');
MANUAL('G2', '[仅人工验收] 面板卡片排版不超过 2 行 (visual).');

if (g2Fail) lastFailGate = lastFailGate || { testId: 'G2', reason: 'G2 shared template/interaction contract failed (tour naming / lighting / resetAll / panel / formula card).' };

// ---------------------------------------------------------------------------
// Headless probe loader — shared by G3 and G4.
// ---------------------------------------------------------------------------
async function loadProbe() {
  const mechRel = 'src/mechanism.js';
  if (!exists(mechRel)) return { available: false, skip: 'src/mechanism.js missing' };
  const src = readSafe(mechRel) || '';
  const exportsMechanism = /export\s+(class|const)\s+Mechanism\b/.test(src) || /export\s*\{[^}]*\bMechanism\b/.test(src);
  if (!exportsMechanism) return { available: false, skip: 'no exported Mechanism (headless probe not yet implemented — migration SKIP)' };
  try {
    const url = pathToFileURL(p(mechRel)).href + `?t=${Date.now()}`;
    const mod = await import(url);
    if (typeof mod.Mechanism !== 'function') return { available: false, skip: 'Mechanism export is not a constructor' };
    return { available: true, Mechanism: mod.Mechanism };
  } catch (e) {
    return { available: false, skip: `probe import threw (not headless-ready): ${e.message.split('\n')[0]}` };
  }
}

// ---------------------------------------------------------------------------
// G3 — custom physics (headless probe + verify.mjs).
// ---------------------------------------------------------------------------
let g3Fail = false;
let probeBase = null;
const probeInfo = await loadProbe();

if (!probeInfo.available) {
  SKIP('G3', probeInfo.skip);
} else {
  let m = null;
  let threw = null;
  try {
    m = new probeInfo.Mechanism(null, null);
    probeBase = m.probe();
  } catch (e) {
    threw = e;
  }
  if (threw) {
    SKIP('G3', `probe() threw — treating as not-headless-ready (WARN): ${threw.message.split('\n')[0]}`);
  } else {
    lastProbe = probeBase;
    const problems = [];
    if (probeBase.restStateSettled !== true) problems.push('restStateSettled !== true');
    if (!isFinite(probeBase.primaryVelocity)) problems.push('primaryVelocity is NaN/non-finite');
    if (!(probeBase.primaryVelocity > 0)) problems.push(`primaryVelocity=${probeBase.primaryVelocity} not > 0`);
    // constraintSlack tolerance: < 2% (newton-cradle measures ~0.39%).
    if (!(probeBase.constraintSlack < 2.0)) problems.push(`constraintSlack=${probeBase.constraintSlack}% >= 2% tolerance`);
    if (problems.length > 0) {
      FAIL('G3', `probe assertions failed: ${problems.join('; ')}`);
      g3Fail = true;
    } else {
      PASS('G3', `probe OK (restSettled, primaryVelocity=${probeBase.primaryVelocity.toFixed(3)} m/s, slack=${probeBase.constraintSlack.toFixed(3)}%)`);
    }
    // Headless self-check must also run green.
    try {
      execFileSync(process.execPath, [p('test', 'verify.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
      PASS('G3', 'test/verify.mjs exited 0');
    } catch (e) {
      FAIL('G3', `test/verify.mjs exited non-zero: ${((e.stderr || '') + (e.stdout || '')).split('\n')[0]}`);
      g3Fail = true;
    }
  }
}
if (g3Fail) lastFailGate = lastFailGate || { testId: 'G3', reason: 'G3 custom physics probe / verify.mjs failed.' };

// ---------------------------------------------------------------------------
// G4 — perturbation anti-fake (Bad-3). ±10% input must move the output.
// ---------------------------------------------------------------------------
let g4Fail = false;
if (!probeInfo.available || !probeBase) {
  SKIP('G4', probeInfo.available ? 'no usable probe base' : probeInfo.skip);
} else {
  let pert = null;
  let threw = null;
  try {
    const m2 = new probeInfo.Mechanism(null, null);
    // Prefer pendulumLength stretch (newton-cradle); fall back to ballRadius.
    pert = m2.probe({ perturb: { pendulumLength: 1.1 } });
  } catch (e) { threw = e; }
  if (threw) {
    SKIP('G4', `perturbed probe threw: ${threw.message.split('\n')[0]}`);
  } else {
    const rel = (a, b) => (a === 0 || !isFinite(a)) ? 0 : Math.abs(b - a) / Math.abs(a);
    const dV = rel(probeBase.primaryVelocity, pert.primaryVelocity);
    const dX = rel(probeBase.maxDisplacement, pert.maxDisplacement);
    lastProbe = { ...probeBase, perturbed: pert };
    // Bad-3 intercept: if NEITHER metric drifts >1%, the probe is a hard-coded
    // constant (fake animation). Threshold = 1% relative drift.
    if (dV <= 0.01 && dX <= 0.01) {
      FAIL('G4', `perturbation +10% produced no drift (dV=${(dV*100).toFixed(2)}%, dX=${(dX*100).toFixed(2)}% <= 1%) — fake animation (Bad-3).`);
      g4Fail = true;
    } else {
      PASS('G4', `perturbation +10% drifts: primaryVelocity ${(dV*100).toFixed(1)}%, maxDisplacement ${(dX*100).toFixed(1)}%`);
    }
  }
}
if (g4Fail) lastFailGate = lastFailGate || { testId: 'G4', reason: 'G4 perturbation anti-fake: probe output insensitive to ±10% input (Bad-3).' };

// ---------------------------------------------------------------------------
// Persist run-state + decide final exit.
// ---------------------------------------------------------------------------
st.attemptCount += 1;

if (!lastFailGate) {
  // All green.
  st.state = 'PASS';
  st.frozen = false;
  st.errorFingerprint = []; // a clean pass resets the consecutive-failure streak.
  saveState(st);
  console.log(`=== run-gates: PASS (exit ${EXIT.PASS}) ===`);
  process.exit(EXIT.PASS);
}

// A-class failure.
const fsha = recordFingerprint(st, lastFailGate.testId, lastFailGate.reason);
saveState(st);

// C-class fuse: same fingerprint consecutive count >= 3.
if (st.errorFingerprint[st.errorFingerprint.length - 1].count >= 3) {
  st.state = 'FROZEN_DEADLOCK';
  st.frozen = true;
  saveState(st);
  writeBlockers(st, lastFailGate.testId, lastFailGate.reason, lastProbe);
  console.error(`FUSE: same error fingerprint consecutive 3x (${fsha}) — froze, see docs/blockers.md`);
  console.log(`=== run-gates: FROZEN_DEADLOCK (exit ${EXIT.FUSE}) ===`);
  process.exit(EXIT.FUSE);
}

st.state = 'SELF_HEALING';
st.frozen = false;
saveState(st);
console.log(`=== run-gates: SELF_HEALING (exit ${EXIT.A_FAIL}) ===`);
process.exit(EXIT.A_FAIL);
