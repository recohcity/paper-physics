# sketch2sim skill CHANGELOG

Evolver (T5) 反哺记录。每次项目交付（exit 0 + 人工签字）后跑一次轻量复盘，按 §2.4 四原则
（不重复 / 不冗余 / 有价值 / 有出处）审核后回写 references/、template/、SKILL.md。

---

## [0.9.0] — T5 首跑：存量经验全面复审打标 + 新经验入库 + template 探针契约对齐（2026-10-10）

### 背景
权威文档 `docs/sketch2sim-multi-agent-architecture.md` 升 v3，新增 §2.4 经验标签系统与
T5 反哺时序。本条目是 v3 落地后首次对 `references/` 全部存量的全面复审，并把 7 条历史
audit 经验与两 case 真实事件提炼入库。

### 新增 references 条目
- **新建 `references/antifake-probe-discipline.md`**（8 条带 provenance 的条目）：
  - E1 spec.json 运行时唯一数字源 / src/spec.js 只转发不抄数 —— provenance: 历史 `spec-json-single-source(-runtime-check)` + trebuchet
  - E2 载荷常数由 resolveParams 纯函数派生，重构零漂移 —— provenance: 历史 `audit-gate-runtime-resolve-params` + trebuchet mechanism.js 重构事件
  - E3 硬编码检测方向 = 找与 spec 重复的数字 —— provenance: 历史 `audit-case-hardcode-duplicate-direction`
  - E4 物理常数白名单（friction/restitution/damping 不按 hardcode 误报）—— provenance: 历史 `audit-hardcode-false-positive-whitelist`
  - E5 无头 probe 契约：world/scene 可 null，probe 自建 Cannon world 步进 —— provenance: newton-cradle 无头 probe 事件 + 权威文档 §3.1
  - E6 验证链 requirements-first：每个断言回溯一条 intake 数字 —— provenance: 历史 `verify-chain-requirements-first` + `audit-gate-verification-chain`
  - E7 resetAll 必须同时清零线速度与角速度 —— provenance: selftest bad-5
  - E8 requirements.lock 双文件哈希，改 spec 必重签否则 Exit 2 —— provenance: selftest bad-2 + §2.3.1

### 存量复审处置（14 文件，全部保留打标；无废弃/无降级）
全部 14 个 references 文件加 YAML frontmatter（`tags: [T*, G*, 主题, 物理域]` + `provenance`）。
逐条过四原则：均为跨 case 通用规律、有真实 FAIL/audit 出处，无 case 专属参数、无裸散文。
处置动作详见交付结论表；无一条达到废弃或降级为 case 附录的标准。

### template 通用型检查
- 逐文件审查 `template/src/`（environment/textures/audio/style/main/mechanism/spec/test）：
  **未发现任何 case 专属部件代码**（无投石机配重/连杆、无牛顿摆碰撞参数），无需剥离。
- 唯一对齐项：`template/src/mechanism.js` 桩接口由旧 `constructor(scene, spec)` 更新为 v3
  冻结契约 `constructor(world, scene, spec)` + `probe(options)`，并同步 `main.js` 调用点为
  `new Mechanism(null, scene, spec)`。这是跨 case 通用外壳修正，非 case 代码注入。

### SKILL.md
- References 索引补登 `antifake-probe-discipline.md`、`agent-roles.md`、`deadlock-protocol.md`；
  template 条目注明冻结的 `(world, scene, spec)` + `probe()` 契约。

### 回归闸门（必过，已通过）
- `run-gates.mjs cases/newton-cradle` → exit 0（primaryVelocity 1.109 m/s，G4 漂移 15.1%/15.7%，与基线一致）
- `run-gates.mjs cases/trebuchet` → exit 0（primaryVelocity 3.843 m/s，G4 漂移 7.3%/50.5%，与基线一致）
- `selftest/run-selftest.mjs` → 5/5 bad samples CAUGHT（bad-1 G1 / bad-2 hash exit2 / bad-3 G4 / bad-4 G2 / bad-5 G2）
- 反哺前后两 case 关键物理数值零漂移。
