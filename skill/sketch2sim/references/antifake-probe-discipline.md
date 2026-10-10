---
tags: [T1, T2, G0, G1, G2, G3, G4, hardcode, probe, resetAll, spec_single_source, resolveParams, verify_chain, whitelist]
provenance: 历史 audit 经验 7 条 + cases/trebuchet 重构零漂移 + cases/newton-cradle 无头 probe + selftest bad-5
---

# Anti-fake 与 probe 纪律（G1/G3/G4 出题与答卷的硬规矩）

本文件把「机器裁判不放水、物理不是手搓公式」这一类真实踩坑固化为可按标签检索的条目。
每条都来自一次 FAIL→修复或 selftest 拦截事件，不是凭空总结。Coordinator 唤醒
Agent-Auditor（T1）时取 `T1/G1/hardcode/verify_chain`，唤醒 Agent-Physics（T2）时取
`T2/G3/probe/resolveParams/spec_single_source`。

---

## E1. spec.json 是运行时唯一数字源，src/spec.js 只做转发不抄数

- **tags:** `[T2, G0, spec_json, single_source, runtime_resolve]`
- **provenance:** 历史经验 `spec-json-single-source` + `spec-json-single-source-runtime-check`；cases/trebuchet
- **规则：** `src/spec.js` 必须 `import spec from '../spec.json'` 并原样转发；任何载荷尺寸、质量、
  限位、重力都不得在 `src/*.js` 里以字面量第二次出现。改数字只改 `spec.json`，然后重签
  `requirements.lock`。G0 门禁会校验 `spec.js` 被实际引用且存在未引用的孤立常量即 FAIL。
- **反例：** 在 `mechanism.js` 里写 `const armLen = 0.62`，而 spec.json 里也有 `0.62`——两处迟早漂移。

## E2. 所有载荷常数由 resolveParams 纯函数派生，重构必须零漂移

- **tags:** `[T2, G4, resolveParams, refactor_zero_drift, pure_function]`
- **provenance:** 历史经验 `audit-gate-runtime-resolve-params`；cases/trebuchet（trebuchet.js 散落动力学 → 封装为标准 `mechanism.js` 事件）
- **规则：** 力学常数（由臂长、配重、绳长派生的 pivot、惯量、释放角）集中在一个**纯函数**
  `resolveParams(spec)` 里计算，输入 spec、输出参数包，不读 DOM、不缓存旧值。任何重构
  （散落文件 → 标准 `mechanism.js`）前后，必须重跑 G3/G4 + 既有 `test/verify.mjs` + 参考解算器，
  关键力学数值**逐位一致**（物理零漂移）。数值变了 = 重构引入了手抄常数，回滚。
- **为什么：** 纯函数可在无头 probe 里复算，也保证「改 spec 一定改结果」（原则 3）。

## E3. 硬编码检测方向 = 找与 spec 重复的数字，不是找"看起来魔法"的数字

- **tags:** `[T1, G4, hardcode, audit, grep_duplicate]`
- **provenance:** 历史经验 `audit-case-hardcode-duplicate-direction`
- **规则：** 判假动画 / 硬编码的正确方向是——取 spec.json 里每个载荷数字，到 `src/*.js` 里 grep，
  若同一数字在代码里出现为字面量（而不是被 import/派生），就是第二来源。**不要**反过来
  扫"所有常数"凭感觉判定。G4 扰动（±10%）时若 probe 输出零漂移，直接判 hardcode 假动画。
- **配套（E4 白名单）：** 不是代码里所有常数都是违规——物理常数属白名单。

## E4. 物理常数白名单：friction / restitution / damping 不按 hardcode 误报

- **tags:** `[T1, hardcode, whitelist, physics_constant, false_positive]`
- **provenance:** 历史经验 `audit-hardcode-false-positive-whitelist`
- **规则：** 以下类别的数值即使以字面量出现在代码里也**不算** spec 重复来源，应进白名单而非 FAIL：
  接触摩擦系数（friction）、恢复系数（restitution）、阻尼（damping/angularDamping）、
  重力加速度 9.82（世界常数）、求解器步长、阴影/渲染常量。判定 hardcode 时先排除白名单再下结论，
  否则会把正常的物理材质常数误报成硬编码。
- **注意：** 白名单常数本身仍要在 spec.json 的 `materials[]` 里带 provenance（见 spec-schema.md），
  只是不要求从 spec 字面量转发——两者不矛盾。

## E5. 无头 probe 契约：world/scene 可传 null，probe 自建 Cannon world 步进

- **tags:** `[T2, G3, probe, headless, cannon_world, dt_step]`
- **provenance:** cases/newton-cradle（无头 probe 自建 Cannon world 事件）；权威文档 §3.1
- **规则：** `Mechanism` 构造函数签名固定为 `constructor(world, scene, spec)`，`world` 与 `scene`
  在无头测试中允许传 `null`。`probe(options)` 内部必须**自建**一个无头 `CANNON.World`、装入刚体与
  约束、按纯 `dt` 离散步进（`stepCount`、`dt=1/60`、`perturb`），完全不依赖 DOM 或 Three.js 渲染器。
  测试框架只读 `probe()` 返回的特征包（kineticEnergy / potentialEnergy / totalEnergyDrift /
  momentumVector / primaryVelocity / restStateSettled / maxDisplacement / constraintSlack / propCollisions），
  不直接侵入私有属性。
- **为什么：** G3 断言与 G4 扰动都挂在 `probe()` 上；若 probe 依赖渲染器，Node 测试就无法跑。

## E6. 验证链 requirements-first：每个断言必须回溯到一条 intake 数字

- **tags:** `[T1, G1, verify_chain, requirements_first, traceability]`
- **provenance:** 历史经验 `verify-chain-requirements-first` + `audit-gate-verification-chain`；SKILL.md step11
- **规则：** 三件套必须按序锁定：(1) 需求 = `docs/intake-questions.md`（用户确认的 Q&A 原话）；
  (2) 断言 = `test/verify.mjs` 里**由该答案派生**的 `assert.*`；(3) 结果 = 运行实现是否匹配需求。
  G1 门禁校验：intake 里每个含数字的行都与某条断言 1:1 追踪，断言数 < 需求数即判「空心测试放水」
  （selftest bad-1 正是被 G1 拦截）。**绝不**为了让脚本通过而改 docs，也**绝不**写一条回溯不到
  intake 答案的断言。

## E7. resetAll 必须同时清零线速度与角速度（Bad-5）

- **tags:** `[T2, G2, resetAll, angular_velocity, state_leakage]`
- **provenance:** selftest bad-5（resetAll 漏清刚体角速度，切回 Tour 仍残余自旋）
- **规则：** Tour⇄Build 双向切换都调同一个 `resetAll()`，它必须把每个刚体的
  `velocity`（线）**和** `angularVelocity`（角速度）都归零，再恢复滑块/材质/相机默认。
  只清线速度、漏清角速度是经典状态泄漏（残余自旋）。G2 重置门禁按此校验，selftest bad-5 固化拦截。

## E8. 需求锁双文件哈希：改 spec.json 必须重签，否则 Exit 2 冻结

- **tags:** `[T0, hash_lock, requirements_lock, tamper, exit_code]`
- **provenance:** selftest bad-2（改了 spec.json 质量值却没重签 requirements.lock）；权威文档 §2.3.1
- **规则：** `requirements.lock` = `sha256(spec.json)` + `sha256(docs/intake-questions.md)` 双文件联合哈希。
  机器裁判启动即校验哈希，不匹配 = 契约被篡改，Exit 2 致命冻结（不是自修可解决的）。
  B 类合法需求变更走 deadlock-protocol：先改 spec.json + intake-questions.md，再**重新生成** lock，
  由 Coordinator 重置重试计数。LLM 严禁手改 `run-state.json`。

---

## 与既有文件的关系（避免重复）

- E1/E2 的架构纪律表化条目见 `architecture-checklist.md`（A1/A3/A4/A9）；本文件提供 FAIL 来源与命令方向。
- E6 的三件套流程见 SKILL.md step11 与 `project-delivery.md`；本文件提供 G1 判定口径。
- E7 的 resetAll 全量清单（物理/材质/滑块/相机）见 SKILL.md 原则 9 与 `case-onboarding.md` 第 15 条。
- E5 的完整 probe 返回包 schema 见权威文档 §3.1；本文件只记无头运行纪律。
