# Mechanism domains（物理域模块）

入口开放：任何草图都能进入通用管线（识别 → 白模 → 材质 → 物理 → 交互，还原分级见
`capability-guide.md` 的 L0-L5）。**模块不按设备划分**——真实设备的多样性没有上限，按设备建目录
必然爆炸。真正决定工作量的是「要还原哪种物理理论」，所以划分为**物理域模块**，可组合：

- 每个域 = 一类物理/数学工具（gate + 参考实现 + 工具链）。
- 一个装置可以挂多个域：投石机 = `rigid_linkage`（单一）；磁石永动机 = `field_force` + `track_guided`；
  机械臂 = `rigid_linkage` × N 关节 + `control`（驱动/逆运动学）。
- **新增域模块的判据**：只有当草图需要**此前没有的物理理论或数学工具**时才新增——设备形状不同
  永远不是理由（那只是已有域的新组合实例）。

域模块在 workflow step 3（可行性 gate）按需挂载：先查本目录，匹配到的域提供 gate；无匹配且确认
是新物理域 → 按「Adding a new domain」沉淀。

## rigid_linkage（刚体连杆/铰链）

Sketch signature: 刚性部件通过铰链/销/滑动副连接，运动由多刚体动力学决定。投石机族、机械臂、
折叠机构、剪刀机构、连杆传动均属此域——它们共享同一套动力学数学与 gate。

- Spec fields: `mechanism`（臂/杯/配重几何）、`joints`（铰链/销）。
- Gate: 静态平衡（驱动力矩 vs 载荷+结构力矩贯穿行程）+ 能量预算（`v <= sqrt(2E/m)`）。两者
  尺度无关（质量比 × 力臂比）。
- Tooling: `scripts/mech2d.mjs`（参考解算器）、`cannon_trebuchet.mjs` + `xcheck_suite.mjs`
  （引擎交叉验证）、`sweep_trebuchet.mjs` / `search_fix.mjs`（扫描/搜索）。多体组合（机械臂）需要
  把参考解算器推广为 N 刚体拉格朗日 + 逆运动学（D-H/旋量）——通用数学，非新域。
- Cases: paper-trebuchet（单刚体，`examples/trebuchet.spec.json`）；机械臂为下一个组合压测。

## field_force（非接触场）

Sketch signature: 一个部件跨间隙对另一部件施加非接触力（磁、静电、图注写明"吸/斥"），载荷沿轨道
被场拉动。永动机"磁石与球"是经典案例；同一形状覆盖任何"场拉载荷越过场源、重力复位"的声称。

- Spec fields: `fields[]`（源、`monotonicity`）、`guides[]`（轨道）、`world`（重力）。无 `joints`。
- Gate（无需数值工具、无需尺度锚点、存在性证明）：设 r 为源到载荷距离，场随 r 单调（真实点/偶极
  源均成立）。机构同时需要：爬升最远点（r 最大、场最弱）场拉力 > 重力分量，否则爬升不开始；通过点
  （r 最小、场最强）场拉力 < 重力，否则不释放。两要求在**同一条单调曲线的两端**——任何单一强度
  无法同时满足。**非存在性证明，不是参数搜索**。例外：非单调场（工程整形）或机械式释放（真实活板门
  ——那是 joint/guide 事件，模型变了，此闸门不再适用）。
- Report wording: "Not feasible as a field-only device; scale/strength-independent (monotonic field)."
- Tooling: 无——闸门已解析性定案；若要演示失败（如球卡住/飞出），只做 demonstration-grade。
- Case: 1648 Wilkins lodestone perpetual motion（verdict 达成，未建 Spec/report 文件）。

## track_guided（轨道约束）

Sketch signature: 载荷沿固定轨道/斜面/滑槽/滑轮靠自身动力学运动（重力、接触、动量），非销接。
常与 field_force / rigid_linkage 组合出现（永动机案例即 field + track）。

- Spec fields: `guides[]`（轨道路径）。
- Gate: 待沉淀——第一步先问"载荷能否保持在轨道上（几何）+ 轨道摩擦是否支配运动（动力学）"；
  首个专门案例出现时把闸门形式化并补回本目录。
- Tooling: 通用刚体引擎（cannon-es）即可表达；参考解算器视案例复杂度决定是否需要。

## 未来域（预告，未实现）

- `control`（驱动/电机/关节角/反馈）：机械臂压测时引入；沉淀 L2 通用运动学（D-H/旋量/雅可比）与
  力矩驱动参考实现。
- `elastic`（弹簧/弹性元件）、`hydro_aero`（流体/空气动力学）、`material_specific`（柔性/断裂）：
  每类都对应一组新物理理论，届时按本目录流程沉淀。

## Adding a new domain

新域模块的触发条件是**可行性问题形状的变化**（新的物理/数学工具），不是新数字也不是新设备：
"是否存在某组参数可行"（rigid_linkage：数值扫描型）vs "是否没有任何参数可行"（field_force：
结构非存在性证明型）——两种 gate 形状都有效。沉淀时记录：草图签名、Spec 字段
（`joints`/`guides`/`fields`/其他）、gate、工具链、案例。命名按物理域，不按具体设备。
