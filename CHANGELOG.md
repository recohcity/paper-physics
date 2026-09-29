# Changelog

All notable changes to this project will be documented in this file.

## [0.0.3] — 交互验证闭环 + 底座木构定稿 + 道具/装饰物理化（2026-09-28/29）

### 机构与物理（审计 F1–F5 修复落地）
- **真实铰链动力学**：投石臂与悬垂配重改为 Cannon-es 双 HingeConstraint 刚体，删除 `fire()` 内拟合公式（加速度/速度/32° 仰角）；臂 body 原点移至 CoM、固定步 1/240 Hz、solver 50 iter / 1e-7。方案 A 定稿：销轴 0.185→0.30、球 0.20→0.03 kg；拉格朗日解算器与 Cannon-es 交叉验证（V2：速度差 <1%、角度 <3.2%）。
- **单一尺度锚点**：声明 1 单位 = 1 m，重力/质量/显示单位统一由锚点推导，删除 environment.js A4 矛盾注释。
- **释放角由几何决定**：停止位 -1.00 rad（约 31° 释放，为命中优化偏离几何切线 39.8°）；每次发射角度相同且物理正确，flight path 不再标注角度。
- **配重箱悬停**：静止吊于挂杆、盒底与甲板保持 20 mm 间隙（apexY 0.576→0.5964）；发射后摆动衰减，删除旧"触底锁定"逻辑。
- **配重滑块 1.40–3.00 kg**（默认 2.60）：下限由动力学判定（<1.4 kg 机构反转）；透明箱沙量随滑块联动（满箱 = 3.0 kg）。
- **球滑块 0.30–0.60 kg**（默认 0.45）：球径按碗内径 100 mm 比例映射（0.45→60%、0.60→80%），金属质感渲染保持；调节即重建铰链（修复 `world.remove()` API 误用）。
- **方块 0.088³/0.14 kg → 0.11³/0.30 kg** 适配铁球正式撞击；块间摩擦 0→0.35、阻尼上调（消除"塑料感"漂移）；落点判定随球半径动态化；金字塔 center 0.92→0.84（31° 侧撞第 2 层）。

### 底座与木构（多轮用户迭代定稿）
- **密封箱体底座**：顶板承载支架、4 轮外露（z ±0.15）、2 根轴承从箱内穿过、甲板加厚、支架底横梁与甲板齐平；4 轮随轴承外移，腾出空间使 A 形支架与底座固定（消除悬空）。
- **配重落点 0 点在底座上**：碰撞组修正（mask=4|2 + 每帧托底）+ 支架高度连锁抬升；触底即锁定（KINEMATIC + 姿态水平校正），配重垂直平放不再后摆。
- **金属件规范**：轴承/螺栓/挂杆浅色金属，轴承衬套/螺帽深色 0x767c83；衬套补齐（轮外/轮内/摆杆/支架/挂杆）；脚梁螺栓六角螺帽与梁面齐平；挂杆轴承置于衬套外、固定于箱顶金属板 + 六角螺帽 + 四角嵌入式螺栓。
- **球真正装进碗里**：球贴碗内底，拖拽时自然滚到低侧碗壁。

### 交互与演示（tour 重构 8 步）
- **8 步序列**：图纸→轮廓高亮+纸片立起→白模→材质→部件标注→拖拽发射示意→慢镜回放→build it yourself（DONE 更名 BUILD）；scrubber 滑条手动跳步；点击热点仅播放该步骤后暂停。
- **PARTS 部件标注**：7 部件（配重箱/摆杆/底座/支架/球/轮/箱子）近距离贴件标注——锚点取真实 mesh 世界坐标（skill T1）；防重叠/防交叉确定性布局（文字包围盒外推 + 引线曲线交叉检测 + 同列垂直链检测）；蓝色抛物线引线 + 文字端小箭头 + 无白色卡。
- **S6 拖拽示意**：蓝色虚线轨迹随拖拽长度缩放、单弧无扭曲、无碗端箭头。
- **S7 完整回放**：0.25× 慢镜轮询至球出界/静止才结束（替代固定 sleep，不再"落地即停"）。
- **S8 静态终态**：复位球回杯、不自动 fire、无遗留动画。

### 渲染 / 读数
- **方块双态材质**：未击倒 = 投石机同款木材质（0xe6cdab），被击倒 = 0xf5eedc；变色与 DOWN 计数同一判据实时双向同步（变色数恒等于 DOWN x/10）。
- **面板**：SPEED(m/s) / POWER(撞击动量 kg·m/s) / RANGE(m) / DOWN，单位统一米制；角度隐藏。

### 场景装饰物物理化
- **铅笔/蓝白橡皮擦**：新增真实静态碰撞体（位置/尺寸由 mesh 推导），球与方块不再穿透（实测球可被铅笔阻挡）；铅笔缩短 80%、红橡皮头收敛圆顶、蓝白橡皮移纸右上角不碰铅笔、白橡皮淡灰（0xdedede）区分白纸。

### 架构与 skill 反哺
- **运行时单一数据源**：新增 `src/spec.js`（MECH / GEOM / UI），physics/trebuchet/main 全部 import；过时注释迁移至 CHANGELOG；重构前后发射数值一致（3.53 m/s / 31°）。
- **skill 反哺**：审计记录 V2–V5 落地；checklist 新增 M6/P6（V3）、A1-A9（V4）、T1-T5（V5）；pitfalls 增至 17 条（含装饰物碰撞、演示终止判据）。

## [0.0.2] - 2026-09-27

### Changed
- **Player Panel Integration**: The playback control bar is now integrated into the main bottom panel.

### Fixed
- Fixed the notification bar and optimized the playback panel.

## [0.0.1] - 2026-09-27

### Added
- **Core 3D & Physics Simulation**:
  - Implemented real-time trebuchet lever physics with gravitational counterweight drive using Three.js and Cannon-es.
  - Projectile ballistics simulation with drag, restitution, and collision callbacks.
  - 10-block target pyramid in a 4-3-2-1 structure with realistic dynamic collapse.
- **Sketch-to-Model Morphing**:
  - Seamless slider-driven transition from 2D pencil draft blueprint to realistic 3D textured balsa wood trebuchet model.
  - Handwritten-style dynamic trajectory arc (Flight path) and telemetry annotation overlay on 2D canvas.
- **Interactive Controls & Audio**:
  - Direct pointer drag on the cup/spoon to cock the lever, with release-to-fire mechanics.
  - Telemetry stats tracking: Speed (m/s), Angle (°), Range (mm), and Downed Blocks (X/10).
  - Web Audio sound effects for arm creak, release whoosh, projectile thud, and block collapses.
  - 0.25× slow motion toggle and multi-angle view switching (Hero, Side, Top).
- **Tour & Sandbox Modes**:
  - "Play the tour" narrative playback showing physical counterweight calibration.
  - "Build it yourself" full-control mode for custom experiments.

### Changed & Fixed
- **Cup & Cradle Geometry Refinement**:
  - Redesigned the wooden spoon cradle to completely wrap the underside of the bowl as a 3D hemispherical shell with an equatorial rim disc flush with the bowl rim.
  - Cleaned up obsolete overlapping 1/3 contour extrusion artifacts.
  - Aligned the cradle, bowl, and arm beam flush on the horizontal plane ($y = 0.021$).
- **Physical Ground Constraint (No Desk Penetration)**:
  - Solved analytical ground contact limits, restricting maximum cocking angle to $84.5^\circ$.
  - Prevented the wooden spoon from penetrating or sinking into the paper/table during mouse dragging.
- **Target Blocks Shape Standardization**:
  - Corrected target blocks from tall vertical rectangular prisms to uniform cubes ($0.088 \times 0.088 \times 0.088$).
  - Synchronized blueprint sketch illustrations in the texture generator to match the 3D cubes.
- **Repository Setup**:
  - Established project naming as `paper-trebuchet` matching the GitHub repository.
  - Unified version to `0.0.1` across `package.json`, `package-lock.json`, and release tags.
