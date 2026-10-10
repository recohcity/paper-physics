---
tags: [T0, T1, T2, T3, T4, T5, G0-G4, agent_roles, handoff, exit_code]
provenance: docs/sketch2sim-multi-agent-architecture.md v3 §2（多 Agent 角色矩阵）
---

# sketch2sim 多 Agent 角色分工与执行协议（agent-roles）

> **权威来源**：`docs/sketch2sim-multi-agent-architecture.md` v2 §2.1 / §2.2 / §2.3 与修订说明 §1~§3。
> 本文件把 §2.2 的角色职责矩阵落成**可直接派发的 agent 分工说明**，并固化 T0→T4 时序、交接协议与退出码五态语义。
> 任何与本文件冲突的口头约定均以本文件为准；若需调整，必须先改权威规范再回写本文件。

---

## 0. 总览

系统由 **4 位专业 LLM Agent** + **1 个常驻协调者（Coordinator）** + **1 个确定性机器裁判（run-gates.mjs）** 组成：

| 编号 | 角色 | 性质 | 是否写代码 | 是否写测试 |
| :--- | :--- | :--- | :---: | :---: |
| ① | Agent-Intake | LLM 专业 Agent（出题） | 否（仅写 spec/QA/锁） | 否 |
| ② | Agent-Auditor | LLM 专业 Agent（出卷/唯一报告签署人） | 否（严禁替开发改代码） | **是（唯一）** |
| ③ | Agent-Physics | LLM 专业 Agent（刚体动力学 + 无头 probe） | **是** | 否 |
| ④ | Agent-Shell | LLM 专业 Agent（外壳/8 步 Tour/resetAll/面板） | **是** | 否 |
| ⑤ | run-gates.mjs | 确定性机器脚本（非 LLM，无幻觉） | 否 | 否 |
| 常驻 | Coordinator | 常驻轻量控制进程（状态机唯一持有者） | **否** | **否** |

核心原则：**专业 Agent 用完即销毁，状态全部落盘 `cases/<slug>/run-state.json`**，由常驻 Coordinator 持有与驱动。

---

## 1. Agent-Intake（需求与监督 Agent，出题）

### 1.1 核心职责
- 视觉初审 `public/sketch.*` 草图，组织 **≤3 个核心 Q&A**，把控 3 个用户确认门禁。
- 生成 `spec.json` 与 `docs/intake-questions.md`，并执行命令写入**双文件联合哈希锁** `requirements.lock`：
  ```text
  <sha256(spec.json)>  spec.json
  <sha256(docs/intake-questions.md)>  docs/intake-questions.md
  ```
- 派发指标基准给下游（Auditor / Physics / Shell）。
- 遇到 C 类熔断时叫停项目，向用户发起结构化求助，生成 `docs/blockers.md`。
- B 类变更流中：修改 `spec.json` 与 `docs/intake-questions.md`，重新签署 `requirements.lock`。

### 1.2 读路径白名单
- `public/sketch.*`
- `references/*`
- `docs/blockers.md`

### 1.3 写路径白名单
- `docs/intake-questions.md`
- `spec.json`
- `requirements.lock`
- `docs/blockers.md`

### 1.4 严禁触碰路径
- `src/*`（任何源码，含 `mechanism.js` / `physics.js` / `main.js` / `environment.js` 等）
- `test/*`（含 `test/verify.mjs`、`test/verify.lock`）
- `run-state.json`（**任何 LLM 角色严禁修改，唯一写入者为 run-gates.mjs**）

### 1.5 工具白名单
- `ask_question`、`view_file`、`write_to_file`
- `run_command`（**仅用于计算 sha256 并落锁**，严禁用于构建/测试）

---

## 2. Agent-Auditor（质量审计 Agent，出卷/唯一报告签署人）

### 2.1 核心职责
- **独立考官**，依据标准 `probe(spec)` 契约编写 `test/verify.mjs`。
- 生成并锁定 `test/verify.lock`。
- **唯一报告签署人**：生成最终交付报告 `docs/report.md` 与 `docs/verify.log`。
- 职责已在修订说明 §3 收敛：**不再承担"调度系统"职责**；自修唤醒、熔断冻结、B 类重签清零全部交由 Coordinator。

### 2.2 读路径白名单
- `requirements.lock`
- `src/*`（只读，用于理解被测接口）
- `index.html`
- `docs/*`

### 2.3 写路径白名单
- `test/verify.mjs`
- `test/verify.lock`
- `docs/report.md`
- `docs/verify.log`

### 2.4 严禁触碰路径
- `src/*`（**严禁替开发改代码**，发现实现问题只能通过 Exit 1 由 Coordinator 调度 Physics/Shell 自修）
- `run-state.json`
- `spec.json`、`requirements.lock`（锁由 Intake 签署，Auditor 只读）

### 2.5 工具白名单
- `view_file`、`write_to_file`

---

## 3. Agent-Physics（物理与建模 Agent，刚体动力学 + 无头 probe）

### 3.1 核心职责
- 编写刚体动力学 `mechanism.js` 与 `physics.js`。
- 划分 **Dynamic / Static / Follow** 三类实体。
- **拒绝伪造动画**，严格基于刚体动力学；所有力学常数统一由 `resolveParams` 纯函数派生，严禁手抄常数。
- 导出标准**无头 `probe(spec)` 物理状态探针**：
  - 构造函数允许 `Mechanism(null, null, spec)`；
  - `probe(options)` 内部必须自建无头 `CANNON.World`，按固定 `dt`（如 1/60 s）执行离散步进，**完全不依赖 DOM 或 Three.js 渲染器**。
- 维护 `docs/mesh-roster.md`（刚体网格清单）。

### 3.2 读路径白名单
- `spec.json`
- `requirements.lock`
- `test/verify.mjs`（只读，理解断言口径；**严禁修改**）

### 3.3 写路径白名单
- `src/mechanism.js`
- `src/physics.js`
- `src/spec.js`
- `docs/mesh-roster.md`

### 3.4 严禁触碰路径
- `test/*`（**禁止改测试**，尤其禁止为了让 `test/verify.mjs` 通过而回写断言）
- `requirements.json`（正确名称为 `requirements.lock`，且只读）
- `src/environment.js`（外壳环境资产归 Agent-Shell）
- `run-state.json`
- `index.html`、面板/Tour 相关文件（归 Agent-Shell）

### 3.5 工具白名单
- `view_file`、`write_to_file`、`replace_file_content`、`multi_replace_file_content`

---

## 4. Agent-Shell（UI 与交互 Agent，外壳/8 步 Tour/resetAll/面板）

### 4.1 核心职责
- 装配标准环境（暖木色桌、暗胡桃背景 `#2e251d`、微调色 `0xd9b98c`、三点光源、无过曝光源）。
- 严格执行 **8 步 Tour 契约**：`SKETCH(0) → LIFT(1) → MODEL(2) → MATERIAL(3) → PHYSICS(4) → RUN(5) → REPLAY(6) → BUILD(7)`。
  - `PLAY` 仅作为控件名，`FIRE` 仅作为 Build 模式操作按钮，**严禁作为步骤名**。
- 实现无状态残留的 `resetAll()`：Tour ⇄ Build 切换后，刚体线速度与角速度必须为 0，滑块与材质覆盖恢复默认。
- 实现规范面板（参数滑块宽度严格对齐 **90px**，卡片排版不得超过 **2 行**）与公式卡片（PHYSICS 步亮起、BUILD 模式隐藏、点击标题弹窗 5 秒自动消失）。
- 负责 `npx vite build` 打包。

### 4.2 读路径白名单
- `spec.json`
- `src/mechanism.js`（**只读接口**，用于装配；严禁改写物理实现）
- `references/visual-standards.md`

### 4.3 写路径白名单
- `src/main.js`
- `src/environment.js`
- `src/textures.js`
- `src/annotations.js`
- `src/style.css`
- `index.html`
- `docs/interaction-nodes.md`

### 4.4 严禁触碰路径
- `src/mechanism.js`
- `src/physics.js`
- `test/*`
- `run-state.json`

### 4.5 工具白名单
- `view_file`、`write_to_file`、`replace_file_content`、`multi_replace_file_content`
- `run_command`（**仅用于构建打包**，不得跑测试）

---

## 5. run-gates.mjs（确定性机器裁判，非 LLM）

### 5.1 核心职责
- **纯 Node.js 无头脚本，非 LLM、无幻觉**。
- 校验文件哈希锁完整性（`requirements.lock`、`test/verify.lock`）。
- 串联执行门禁：**G0 卫生 → G1 追踪 → G2 公共 → G3 自定义 → G4 扰动**。
- 计算错误指纹 `sha256(TestID + FailReason)`，维护错误指纹队列。
- **全项目唯一有权写入 `run-state.json` 的角色**。
- 输出标准退出码（见 §7）。

### 5.2 读路径白名单
- **全项目文件只读**（含 `src/*`、`test/*`、`spec.json`、`index.html`、`docs/*` 等）。

### 5.3 写路径白名单
- `cases/<slug>/run-state.json`（**唯一写入者**）

### 5.4 严禁触碰路径
- 不修改任何源码、测试、文档、锁文件；只判定与落盘状态。

---

## 6. Coordinator（常驻协调者，状态机唯一持有者）

### 6.1 核心职责
- **常驻轻量控制进程**，生命周期贯穿整个流水线；**不参与具体代码或测试编写**。
- **状态机唯一持有者**：维护重试计数器、计算错误指纹历史、调度唤醒专业 Agent、执行 B 类变更重签、触发 C 类熔断与冻结。
- 状态持久化于 `cases/<slug>/run-state.json`（由 run-gates.mjs 唯一写入，Coordinator 只读并据此决策）。
- 专业 Agent 上下文销毁后，Coordinator 是流水线状态不丢失的唯一保障。

### 6.2 读路径白名单
- `cases/<slug>/run-state.json`
- `requirements.lock`、`test/verify.lock`
- `spec.json`、`docs/intake-questions.md`
- run-gates.mjs 输出的诊断摘要（结构化，非全量历史）

### 6.3 写路径白名单
- **无直接文件写权限**（Coordinator 通过调度 Agent 与 run-gates 间接落盘）。

### 6.4 严禁触碰路径
- **不写代码**：严禁直接修改 `src/*`。
- **不写测试**：严禁直接修改 `test/*`。
- **不直接写 `run-state.json`**（该文件由 run-gates.mjs 唯一写入）。
- 不替 Intake 重签 `requirements.lock`（仅在 Intake 完成重签后读取新锁、校验合法、清零计数）。

---

## 7. T0 → T4 时序与交接协议

```
T0  Agent-Intake（出题）
    只读草图 → ≤3 问 Intake Q&A → 落盘 spec.json + docs/intake-questions.md
         → 写入 requirements.lock（双文件联合 sha256）
    【交接】Intake 上下文销毁。Coordinator 推进状态：REQUIREMENTS_LOCKED。
            │
            ▼
T1  Agent-Auditor（出卷）
    Coordinator 仅注入：requirements.lock + spec.json + 纯净 template
    Auditor 依据 probe(spec) 契约 → 落盘 test/verify.mjs + test/verify.lock
    【交接】Auditor 上下文销毁。Coordinator 推进状态：TEST_LOCKED。
            │
            ▼
T2  Agent-Physics & Agent-Shell（答卷，并行）
    Physics：仅接收 spec.json → 实现 src/mechanism.js，导出无头 probe(spec)
    Shell ：接收 spec.json + mechanism.js 接口 → 装配 8 步 Tour + resetAll + 面板
            │
            ▼
T3  run-gates.mjs（机器裁判）
    Coordinator 调用纯 Node.js 机器裁判
    执行 G0→G1→G2→G3→G4，计算错误指纹，写 run-state.json，返回退出码
            │
            ▼
T4  反馈与自愈
    若 Exit = 1（A 类）：Coordinator 提取 run-gates 诊断摘要作为全新输入，
                         唤醒开发 Agent（Physics / Shell）。
                         【铁律】绝不透传全量历史，只喂"诊断摘要 + 相关白名单"。
    若 Exit = 2：契约破坏，致命冻结，通知用户。
    若 Exit = 3：C 类熔断，写 FROZEN_DEADLOCK，唤醒 Intake 生成 blockers.md。
    若 Exit = 4：B 类变更，等 Intake 重签 requirements.lock 后清零计数再重启。
    若 Exit = 0：PASS，进入交付验收，唤醒 Auditor 签署 docs/report.md。
```

### 7.1 交接协议（"用完即销毁"铁律）
1. 每个专业 Agent 在自己的写路径白名单内完成落盘后，**立即销毁上下文**，不保留历史。
2. 跨阶段传递**只允许白名单内的产物文件**，不允许把上一阶段的"思考过程"塞进下一阶段上下文（防思维污染）。
3. Coordinator 唤醒开发 Agent 时，**只喂 run-gates 诊断摘要 + spec.json + 相关源码切片**，禁止透传全量对话历史。
4. 所有"我做了几次、错在哪一步"这类状态，**一律从 `run-state.json` 读**，不从 LLM 记忆读。

---

## 8. 退出码五态（与修订说明 §1 逐字一致）

| Exit Code | 名称 | 语义 | Coordinator 后续动作 |
| :---: | :--- | :--- | :--- |
| **0** | PASS | 全部门禁通过，进入交付验收 | 唤醒 Auditor 签署 `docs/report.md`；流水线进入交付态 |
| **1** | A 类失败（实现 ≠ 需求） | 契约未被破坏，但实现未达断言 | 调度对应开发 Agent（Physics / Shell）自修，**重试计数 +1** |
| **2** | 契约完整性被破坏（哈希篡改或缺失） | 系统致命错误（如改了 `spec.json` 却未重签 `requirements.lock`） | **立即冻结并通知用户介入**，不允许自修 |
| **3** | C 类熔断 | 连续 3 次相同错误指纹 **或** 需求满足但物理卡死跑不通 | 写 `FROZEN_DEADLOCK`，冻结所有编辑权限，唤醒 Intake 生成 `docs/blockers.md` |
| **4** | B 类变更触发 | 用户合法调整需求，等待重签哈希锁 | 等 Intake 改 `spec.json` + `intake-questions.md` 并重签 `requirements.lock`，随后**清零自修计数与错误指纹队列** |

### 8.1 一致性铁律
- 全文档统一为 **0 / 1 / 2 / 3 / 4** 五态；旧 `0/1/3/4` 四态写法已废弃。
- 测试文件名统一为 **`test/verify.mjs`** 与 **`test/verify.lock`**；`custom.test.mjs` 在全项目字符残留数必须为 **0**。
- `run-state.json` 在全项目中**只能由 run-gates.mjs 写入**，任何 LLM 角色（Intake / Auditor / Physics / Shell / Coordinator）一律只读。
