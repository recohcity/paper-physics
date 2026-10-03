# Capability guide (what this skill can and cannot validate)

Read this before handing a new sketch to the workflow — it decides fast whether this skill is the right
tool, which physics domain(s) apply, how deep to restore the physics, and how strong the verdict can be.

## Positioning: 入口开放，模块指定

- **入口开放**：任何草图（连杆机构、机械臂、场力装置、折叠机构、历史图纸……）都能进入通用管线——
  识别 → 白模 → 材质模型 → 物理装配 → 交互。通用管线不挑设备。
- **模块指定**：物理层按「物理域模块」按需挂载（`references/mechanism-templates.md`）——每个域提供
  gate + 参考实现 + 工具链，可组合。设备只是域模块的组合实例，不是模板。
- 对任意草图只回答两个问题：**还原到哪一级（L0-L5）？需要哪几个域模块？**

## What this skill does

Turns a hand-drawn sketch of a mechanism into a checkable Spec + interactive 3D physics build, and answers
one question: **can this mechanism physically do what it claims?** The deliverable is a feasibility verdict
with provenance, not a pretty model. See `SKILL.md` for the full workflow (steps 0-9).

## 物理特性还原分级（L0-L5）

每次任务先声明还原到哪一级——它决定工作量的量级，也决定结论能声称什么。

| 级 | 还原内容 | 通用性 | 案例 |
|---|---|---|---|
| L0 | 几何白模（识别+尺度+3D） | 全通用 | 任何草图 |
| L1 | 材质模型（渲染） | 全通用 | 任何草图 |
| L2 | 运动学（关节/自由度/约束/正逆解） | 通用数学（D-H/旋量/雅可比） | 机械臂正逆运动学 |
| L3 | 刚体动力学（力/力矩/能量） | 通用（拉格朗日+RK4 参考解算器） | 抛射/举升/平衡类机构 |
| L4 | 摩擦/碰撞/阻尼（接触物理） | 通用刚体引擎 | 堆积、滚动、冲击 |
| L5 | 场/驱动/控制 | **每引入一个新物理域才加模块** | 磁悬浮、电机机械臂 |

还原物理特性是**选择性地引入真实物理效应**（摩擦、阻尼、弹性、场、驱动），不是无中生有；装饰性
特性（绳索视觉跟随等）按原则 7 与动力学解耦。还原到 L3 的装置不能声称验证了 L5 的行为。

## Physics domains（现有与规划）

Check `references/mechanism-templates.md` for the current catalog. 摘要：

| 域模块 | 覆盖 | Gate 形状 | 工具链 | 状态 |
|---|---|---|---|---|
| `rigid_linkage` | 抛射机构、多关节臂、折叠机构、连杆 | 数值型：静平衡+能量预算 / 逐关节力矩包络 | 参考解算器+引擎交叉验证+扫描 | 已在存储释放类机构与单臂案例压测 |
| `field_force` | 磁/静电/引力场 | 结构型：单调场闸门（存在性证明） | 无需数值工具 | 已用单调场存在性证明定案 |
| `track_guided` | 斜面/滑槽/滑轮 | 待沉淀 | 通用刚体引擎 | 常组合出现 |
| `control` / `elastic` / `hydro_aero` / … | 驱动控制 / 弹性 / 流体 | 未实现 | — | 未来域，遇新物理理论再沉淀 |

## What this skill CANNOT validate

- **Strength / fatigue / thermal / fluid / manufacturing tolerance.** Rigid-body physics does not cover
  these; they need FEA or specialized analysis. The workflow states this at every report (principle 5).
- **Purely decorative 3D** with no mechanism to check — no feasibility question exists; another tool
  (a 3D modeler) fits better.
- **Mechanisms that need a numeric gate but arrive without a scale anchor.** `scale.status` must leave
  `CONFLICT` before `measured` provenance is possible; if the person cannot supply an anchor (labeled
  dimension or known-size reference object), stop and ask — do not guess (workflow step 0, `sketch-intake.md`).
  Exception: structural arguments (monotonicity, symmetry, conservation) do not need an anchor at all.
- **A physical domain with no module yet** — e.g. `control` (motor-driven arms), `elastic`,
  `hydro_aero`: 没有 gate、参考解算器、引擎模板。遇到时按「Adding a new domain」沉淀（新物理/数学
  工具才是新域；四连杆只是 rigid_linkage 的新组合，不是新域）。
- **Soft bodies, ropes-as-dynamics, fluids, or anything Cannon-es rigid bodies cannot represent.** Note
  the project's rope/winch are decorative visual-follow (principle 7), not simulated cables.

## How to choose (decision order)

1. **Is there a mechanism to validate, or is this decoration / analysis-only?** Decoration → not this skill;
   FEA-class questions → say so and point to the right analysis.
2. **Decide the restore level L0-L5 first**, and say it out loud — it sets the workload and the honest
   ceiling for the verdict.
3. **Match the sketch to physics domains** in `mechanism-templates.md`（可多域组合）。Matched → use each
   domain's gate and tooling. Unmatched → decide whether a *new physical theory / math tool* is needed
   (warrants a new domain) or it is just a new composition of existing domains.
4. **Does the gate need numbers?** If yes, establish the scale anchor up front (`sketch-intake.md` part A);
   if the argument is structural (monotonicity, symmetry, conservation), proceed without one and say so.
5. **Run the gate before building anything** (workflow step 3). If it fails, report the failure with the
   numbers / argument — do not build a "working" demo of a dead mechanism. A demonstration-grade model may
   still be built to *show* the failure, but it must carry the demonstration badge and no feasibility claim.

## What the verdict can claim (honest ceilings)

- Gate passes + reference-vs-engine agreement + sweeps with margin → "Feasible within the modeled
  assumptions".
- Structural non-existence proof → "Not feasible as a <field-only / this-class> device; scale-independent".
- Any load-bearing `fitted` quantity, or a demo-only build → "Demonstration only. Not a feasibility result."
- Verdicts are scoped to the declared restore level: a build that stops at L2 kinematics claims nothing
  about L3-L5 dynamics.

## Current maturity (what is still not proven)

- **A sketch that runs end to end through steps 2 onward** (ambiguity confirmation → Spec → build)
  has not happened yet: prior cases ran partly from extracted code or resolved at the gate without
  needing steps 2+. The next design handed as a sketch will be the first full run.
- **Overlay fidelity check** (render the build from the sketch's view and diff against it) is designed
  in principle but not built.
- **Genuinely new gates** beyond the existing families have been exercised only sparsely.
- **Multi-domain composition** (e.g. a multi-joint arm: `rigid_linkage` × N × `control`) is the planned
  next pressure test — it is the first case that combines domains and needs L2 kinematics math.
- Everything validated is **single-case**; the checklist generalizes only as far as the audits it survived.

When in doubt about whether this skill fits a sketch, say what you can validate and what you cannot, and
propose the cheapest path to a verdict rather than starting a build.
