# sketch2sim 需求变更与死循环熔断协议（deadlock-protocol）

> **权威来源**：`docs/sketch2sim-multi-agent-architecture.md` v2 §5.1 / §5.2 / §2.3.2 与修订说明 §1 / §3。
> 本文件固化两条异常通道：**B 类变更流**（非熔断下的需求合法演进）与 **C 类熔断**（自修死循环 / 物理矛盾跑不通）。
> 配套状态文件 `cases/<slug>/run-state.json` 由 `run-gates.mjs` **唯一写入**，任何 LLM 角色只读。

---

## 1. 通道总览

| 通道 | 触发时机 | 是否冻结编辑 | 谁来写 | 是否清零自修计数 |
| :--- | :--- | :---: | :--- | :---: |
| **B 类变更** | 用户提出参数变更 / 澄清，未触发物理矛盾 | 否（走重签流） | Intake 改 spec + 重签锁 | **是**（新锁合法后） |
| **C 类熔断** | 同错误指纹连续 3 次 / 需求满足但物理跑不通 | **是** | run-gates 写 `FROZEN_DEADLOCK`；Intake 生成 `blockers.md` | 不适用（已冻结） |

---

## 2. B 类变更流（§5.1）

适用场景：用户在日常开发中提出需求参数变更或澄清，但**未**触发物理矛盾（机构仍可解、数值不发散）。

### 2.1 三步流
1. **写变更日志**：由 Intake 在 `cases/<slug>/docs/change-log.md` 追加一条记录，字段必须包含：
   - **变更时间**（ISO 8601，如 `2026-10-10T14:32+08:00`）
   - **旧值**（变更前的 spec 字段值或 intake 原表述）
   - **新值**（变更后的字段值）
   - **变更理由**（用户原话摘要）
2. **重签需求锁**：Agent-Intake 修改 `spec.json` 与 `docs/intake-questions.md`，重新生成 `requirements.lock`：
   ```text
   <sha256(spec.json)>  spec.json
   <sha256(docs/intake-questions.md)>  docs/intake-questions.md
   ```
3. **Coordinator 校验并清零**：
   - Coordinator 读取更新后的 `requirements.lock`，校验哈希合法（即 `spec.json` 与 `intake-questions.md` 的当前实际哈希与锁内记录一致）。
   - 校验通过后，Coordinator 通知 run-gates 在下次落盘时**重置 `run-state.json` 中的自修计数器 `attemptCount` 与错误指纹队列 `errorFingerprint`**。
   - 状态机回到 `REQUIREMENTS_LOCKED`，流水线重新进入 T1（Auditor 出新卷）或 T2（开发 Agent 按新 spec 答卷）。

### 2.2 B 类变更的退出码语义
- 触发 B 类变更时，run-gates 返回 **Exit Code 4**（B 类变更触发，需求发生合法演进，等待重签哈希锁）。
- Exit 4 期间**不消耗自修计数**，也**不写入熔断状态**。

### 2.3 严禁行为
- 严禁跳过 `change-log.md` 直接改 `spec.json`。
- 严禁 Physics / Shell 自行调整 spec 字段（spec 唯一作者是 Intake）。
- 严禁在未重签 `requirements.lock` 的情况下修改 `spec.json`（这会被 run-gates 判为 **Exit 2 契约破坏**）。

---

## 3. C 类熔断（§5.2）

### 3.1 触发条件（任一满足即触发）
1. **自修死循环**：`run-state.json` 中记录的错误指纹 `sha256(TestID + FailReason)` **连续出现 3 次完全相同**。
2. **物理矛盾跑不通**：代码中的几何尺寸与质量**完全满足** `spec.json` 需求，但在无头仿真中：
   - 机构静止不动；
   - 无法完成触发（如投石机释放后不出石、牛顿摆碰撞球不弹起）；
   - 求解器数值发散（出现 `NaN`、速度/位置指数爆炸）。

> **数字硬上限**：全生命周期自修次数上限为 **3 次**（由 §2.3.2 规定）。到达上限且指纹仍未变化即触发熔断。

### 3.2 熔断执行动作（顺序不可乱）
1. **run-gates.mjs 落盘冻结**：写 `run-state.json`，`state = "FROZEN_DEADLOCK"`，`frozen = true`，并返回 **Exit Code 3**。
2. **Coordinator 冻结所有编辑权限**：暂停所有专业 Agent 的写路径，不允许任何 `src/*`、`test/*`、`spec.json`、`requirements.lock` 的进一步修改。
3. **唤醒 Agent-Intake 生成 `docs/blockers.md`**：按 §4 模板填写，向用户发起结构化求助。
4. **用户答复后**：Intake 统一更新 `spec.json` 并重新签署 `requirements.lock`（走 B 类变更流），Coordinator 校验合法后**解除冻结**，清零计数与指纹队列，恢复流水线。

### 3.3 熔断期间禁止事项
- 禁止 Physics / Shell 继续"再调一调参数"——任何调参都被视为越权。
- 禁止 Coordinator 自行"猜"用户意图改 spec——spec 只能由 Intake 改。
- 禁止 run-gates 在冻结状态下重跑门禁"看看能不能碰巧过"。

---

## 4. `docs/blockers.md` 模板（照 §5.2 投石机示例）

```markdown
# Blockers — <case-slug> 熔断求助

> 状态：FROZEN_DEADLOCK
> 触发原因：<同错误指纹连续 3 次 / 需求满足但物理跑不通>
> 错误指纹：<sha256(TestID + FailReason)>
> 冻结时间：<ISO 8601>

## 【期望指标】
<按 spec.json 摘录，例如：投石机抛石初速需达到 ≥ 12 m/s。>

## 【实际计算】
<由 probe(spec) 实际测得，例如：引擎刚体动力学实际初速仅为 3.4 m/s。>

## 【已尝试方案】
- <尝试 1，例如：微调释放角 40° ~ 55°>
- <尝试 2，例如：优化滑槽摩擦力>
- <结论：均无法达标。>

## 【核心物理矛盾】
<例如：短臂长度受限，在 50 kg 配重下产生的角加速度已达力矩物理上限。>

## 【向用户求助的抉择选项】
当前实现完全符合图纸，但真实物理仿真跑不通。需要您裁决：

- **选项 A**：<例如：允许将配重由 50 kg 提升至 120 kg>
- **选项 B**：<例如：允许将短臂长度延长 20%>
- **选项 C**：<例如：将目标初速要求下调至 5 m/s>
```

### 4.1 模板字段铁律
- 五个字段（期望指标 / 实际计算 / 已尝试方案 / 核心物理矛盾 / 抉择选项）**缺一不可**。
- 抉择选项必须以 **选项 A / 选项 B / 选项 C** 格式给出，且每个选项必须是"可被 Intake 直接翻译成 spec.json 字段变更"的具体动作，禁止写"您看怎么办"这类开放问。
- 数字必须带单位（m/s、kg、m、°、%），与 `spec.json` 的量纲一致。

---

## 5. `run-state.json` 字段定义

> 路径：`cases/<slug>/run-state.json`
> **唯一写入者**：`run-gates.mjs`。Coordinator / Intake / Auditor / Physics / Shell 一律只读。

| 字段 | 类型 | 含义 |
| :--- | :--- | :--- |
| `attemptCount` | `number` | 全生命周期已消耗的 A 类自修次数。**硬上限 3**；到达上限且指纹未变化即触发 C 类熔断。 |
| `errorFingerprint` | `Array<{ hash: string, testID: string, failReason: string, count: number }>` | 错误指纹队列。每个指纹 = `sha256(TestID + FailReason)`，`count` 为该指纹连续出现次数。**同一指纹连续 `count = 3` 即熔断**。 |
| `frozen` | `boolean` | 是否处于冻结态。C 类熔断时置 `true`，Intake 重签锁 + Coordinator 校验合法后置 `false`。 |
| `specVersion` | `string` | 当前 `requirements.lock` 对应 spec 的版本标识（通常为锁文件内的 sha256 前 12 位或自增版本号）。B 类重签后必须更新。 |
| `state` | `enum` | 状态机标识。取值集合见 §5.1。 |

### 5.1 `state` 枚举值
| 值 | 含义 |
| :--- | :--- |
| `REQUIREMENTS_LOCKED` | T0 完成，spec + intake-questions 已签署 requirements.lock，等待 Auditor 出卷。 |
| `TEST_LOCKED` | T1 完成，`test/verify.mjs` + `test/verify.lock` 已落锁，等待开发答卷。 |
| `DEVELOPING` | T2 进行中，Physics / Shell 正在按 spec 实现。 |
| `JUDGING` | T3 进行中，run-gates 正在跑 G0~G4。 |
| `SELF_HEALING` | Exit 1 后，Coordinator 正在调度开发 Agent 自修（`attemptCount < 3`）。 |
| `PASS` | Exit 0，全门禁通过，进入交付验收。 |
| `FROZEN_DEADLOCK` | Exit 3，C 类熔断，所有编辑权限冻结，等待用户通过 blockers.md 裁决。 |
| `WAITING_RESIGN` | Exit 4，B 类变更触发，等待 Intake 重签 requirements.lock。 |

### 5.2 状态迁移图（文字版）
```
REQUIREMENTS_LOCKED ──► TEST_LOCKED ──► DEVELOPING ──► JUDGING
                                                          │
            ┌─────────────────────────────────────────────┤
            ▼                                             ▼
       Exit 0: PASS                              Exit 1: SELF_HEALING ──► (attemptCount+1) ──► DEVELOPING
                                                          │
                                                          │ attemptCount ≥ 3 或同指纹 count = 3
                                                          ▼
                                                Exit 3: FROZEN_DEADLOCK
                                                          │
                                                          │ 用户裁决 → Intake 重签锁
                                                          ▼
                                                回到 REQUIREMENTS_LOCKED（清零计数与指纹）

       Exit 2: 契约破坏 ──► 立即冻结并通知用户（不进入 SELF_HEALING）
       Exit 4: WAITING_RESIGN ──► Intake 重签锁 ──► REQUIREMENTS_LOCKED（清零计数与指纹）
```

---

## 6. 一致性铁律（与 v2 规范逐字对齐）
1. **退出码五态**：`0 / 1 / 2 / 3 / 4`。本协议不引入任何新退出码。
2. **自修全生命周期上限 = 3 次**：`attemptCount` 硬上限；到达上限且指纹仍在重复 → C 类熔断，不再自修。
3. **错误指纹口径**：`sha256(TestID + FailReason)`，**连续 3 次相同**才熔断；中间若出现不同指纹，队列重置。
4. **`run-state.json` 唯一写入者 = run-gates.mjs**：Coordinator 只读并据此调度；Intake / Auditor / Physics / Shell 一律只读。
5. **测试文件名 = `test/verify.mjs` + `test/verify.lock`**：`custom.test.mjs` 在本协议与全项目中字符残留数为 **0**。
6. **B 类变更必须先写 `docs/change-log.md` 再重签锁**；**C 类熔断必须先写 `FROZEN_DEADLOCK` 再生成 `blockers.md`**；顺序颠倒即视为协议违反。
