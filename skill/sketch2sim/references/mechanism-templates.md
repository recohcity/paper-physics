# Physics-domain modules（物理域模块）

入口开放：任何草图都能进入通用管线（识别 → 白模 → 材质 → 物理 → 交互，还原分级见
`capability-guide.md` 的 L0-L5）。**模块不按设备划分**——真实设备的多样性没有上限，按设备建目录
必然爆炸。真正决定工作量的是「要还原哪种物理理论」，所以划分为**物理域模块**，可组合：

- 每个域 = 一类物理/数学工具（gate + 参考实现 + 工具链）。
- 一个装置可挂多个域：一个存储能量抛出物体的机构 = `rigid_linkage` 单一；一个靠场拉物体
  越障碍的装置 = `field_force` + `track_guided`；一串电机驱动的关节臂 = `rigid_linkage` × N + `control`。
- **新增域的判据**：只有当草图需要**此前没有的物理理论或数学工具**时才新增——设备形状不同
  永远不是理由（那只是已有域的新组合实例）。

域模块在 workflow step 3（可行性 gate）按需挂载：先查本目录，匹配到的域提供 gate；无匹配且
确认是新物理域 → 按「Adding a new domain」沉淀。

## rigid_linkage（刚体连杆/铰链）

Sketch signature: 刚性部件通过铰链/销/滑动副连接，运动由多刚体动力学决定。抛射机构、关节臂、
折叠机构、剪刀机构、连杆传动均属此域——共享同一套动力学数学。

- Spec fields: `mechanism`（臂/构件几何）、`joints`（铰链/销）、`actuators`（若有驱动）。
- Gate: 静态平衡（驱动力矩 vs 载荷+结构力矩贯穿行程）+ 能量预算（`v <= sqrt(2E/m)`）。两者
  尺度无关（质量比 × 力臂比）。
- Tooling: 参考解算器（拉格朗日多刚体 + RK4 + 能量漂移检查）、引擎交叉验证、扫描/搜索脚本。
  多体组合需要把参考解算器推广为 N 刚体拉格朗日——通用数学，非新域。脚本按域自带，不跨域复用。

## control（驱动/电机/关节角）

Sketch signature: 一串刚体由电机/舵机/步进通过铰链串联，目标是**在指定姿态或笛卡尔位姿下
保持/运动**，而不是储存能量后抛出。机械臂、关节义肢、多轴云台属此域，常与 `rigid_linkage` 组合。

- Spec fields: `joints[]`（revolute/prismatic，含轴、限位）**+ `actuators[]`**（每个电机：
  额定扭矩/推力、`gear_ratio`、`efficiency`，并接到它驱动的 joint；一个 joint 可由多个 actuator
  并联驱动）。
- Gate（静态力矩包络）：对每个关节 i，在**全姿态网格**上取最坏值（通常臂水平伸直、负载在
  最远指尖）：`|τ_gravity,i(θ)| = Σ_{i 下游所有件 k} m_k·g·r_k(θ)`，要求
  `τ_gravity,i ≤ τ_motor,i · gear_ratio_i · efficiency_i`。各关节 margin 最小值即瓶颈；
  margin < 1 = 该姿态下垂/丢步。
  - 这与抛射能量不等式、单调场存在证明都不同：逐关节、姿态扫描、静态持扭矩。
  - **持住 vs 运动分开判**：静态持矩只要求保持扭矩；动态加速/惯性、电机高速矩频衰减、背隙/
    柔性不在本 gate 内（归入 not-modeled）。
  - **传动比敏感性**：`gear_ratio` 常为 unknown（齿数没数）。只要它是 load-bearing 的 `assumed`，
    就禁止下 feasible 结论（provenance 规则直接定 verdict 等级），并在报告里给出 margin 随该比的
    翻转点。官方图不标齿数时，不要从爆炸轴测图死磕数齿——标 low-confidence，给范围。
- Tooling: 姿态网格扫描（从 Spec 连杆长度 + 质量生成关节角网格，找 max 下游扭矩）。L2 运动学
  （D-H 参数表 / 雅可比 / 可达工作空间）是本域另一半，首个需要它的案例再沉淀。

## field_force（非接触场）

Sketch signature: 一个部件跨间隙对另一部件施加非接触力（磁、静电、图注写明"吸/斥"），载荷沿
轨道被场拉动。

- Spec fields: `fields[]`（源、`monotonicity`）、`guides[]`（轨道）、`world`（重力）。无 `joints`。
- Gate（无需数值工具、无需尺度锚点、存在性证明）：设 r 为源到载荷距离，场随 r 单调。机构同时
  需要：爬升最远点（r 最大、场最弱）场拉力 > 重力分量；通过点（r 最小、场最强）场拉力 < 重力。
  两要求在**同一条单调曲线的两端**——任何单一强度无法同时满足。**非存在性证明，不是参数搜索**。
  例外：非单调场（工程整形）或机械式释放（真实活板门——那是 joint/guide 事件，此闸门不再适用）。
- Report wording: "Not feasible as a field-only device; scale/strength-independent."
- Tooling: 无——闸门已解析性定案；若要演示失败，只做 demonstration-grade。

## track_guided（轨道约束）

Sketch signature: 载荷沿固定轨道/斜面/滑槽/滑轮靠自身动力学运动（重力、接触、动量），非销接。
常与 field_force / rigid_linkage 组合出现。

- Spec fields: `guides[]`（轨道路径）。
- Gate: 待沉淀——第一步先问"载荷能否保持在轨道上（几何）+ 轨道摩擦是否支配运动（动力学）"；
  首个专门案例出现时把闸门形式化并补回本目录。
- Tooling: 通用刚体引擎即可表达；参考解算器视案例复杂度决定是否需要。

## 未来域（预告，未实现）

- `elastic`（弹簧/弹性元件）、`hydro_aero`（流体/空气动力学）、`material_specific`（柔性/断裂）：
  每类对应一组新物理理论，届时按本目录流程沉淀。

## Adding a new domain

新域模块的触发条件是**可行性问题形状的变化**（新的物理/数学工具），不是新数字也不是新设备：
"是否存在某组参数可行"（数值扫描型）vs "是否没有任何参数可行"（结构非存在证明型）vs
"每个持力矩够不够"（逐关节姿态包络）——都是有效 gate 形状。沉淀时记录：草图签名、Spec 字段、
gate、工具链、案例代号（案例细节不写在本文件）。
