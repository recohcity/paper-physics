# Changelog

All notable changes to this project will be documented in this file.

## [0.6.0] — Build panel polish + SPEC runtime wiring + intake cross-check (2026-10-07)

### Newton's cradle build panel
- Three side-by-side cards: Bidirectional / Material / Playback, all `flex:1`
- Material card: 123/45 per-ball buttons + Steel/Plastic legend (gray #c8ccd2 / amber #d4a017)
- Playback card: Slow/Play row, Reset/🔊 row
- Reset button restores sliders (34°), Sync checkbox, AND all balls back to steel material
- `panel-layout-standards.md`: new skill reference — compact cards, flex width, card-map gate before writing HTML

### SPEC actually drives runtime
- mechanism.js no longer hardcodes physics values — reads from SPEC (pendulumLength, gravity, ballRadius, restitution, airDrag, angleLimit, densities)
- audit-case.mjs upgraded: checks imported binding is actually referenced, not just that an import line exists
- Rename `inputs[].ballCount` → `ballsPerSide` (was ambiguous with total ballCount)
- Trebuchet: removed dead imports (GEOM from main.js, UI from physics.js)

### Intake-to-spec cross-check
- test/verify.mjs now parses `docs/intake-questions.md` and asserts SPEC values match confirmed answers
- Newton cradle: ballCount=5, restitution=0.97 cross-checked
- Trebuchet: leverRatio=4.0, CW range 1.4–10kg/4.8 default, 3 blocks × 0.14kg cross-checked

### Trebuchet arm naming fix
- Long arm (throwing/-X) = 0.596 m, short arm (CW/+X) = 0.17 m — consistent across spec.json, trebuchet.js, mesh-roster.md

### Template backport
- Cream loading overlay (anti black flash)
- Reset also restores panel sliders
- build-panel is flex-row container for cards
- Removed old `skill/template/` (superseded by `skill/sketch2sim/template/`)

## [0.5.0] — Project rename + mechanical audit gate + docs backfill (2026-10-06)

### Rename
- Project renamed from `paper-trebuchet` to `paper-physics` (now a sketch-to-simulation platform, not just a trebuchet demo)
- GitHub repo: `recohcity/paper-physics`
- Vercel deployment auto-follows

### Mechanical delivery gate
- **`scripts/audit-case.mjs`**: exit 0/1 gate script. Checks spec.json, spec.js wiring, docs/ six artifacts, test/verify.mjs — no reliance on memory.
- **Step 11 gate** in SKILL.md: audit-case.mjs must exit 0 before handoff
- **case-onboarding.md**: script-checked items marked, human review only subjective items

### Docs backfill
- Newton's cradle: spec.json + docs/ six files + test/verify.mjs — now passes audit
- Trebuchet: spec.json + docs/ six files + test/verify.mjs — now passes audit
- **mesh-roster-format.md**: required mesh classification (dynamic/static/visual-follow), no-pass-through rule
- **Pitfall #44**: objects passing through each other (missing colliders)

### Template cleanup
- Template aligned to newton-cradle baseline, zero model-specific code
- Removed stats-grid (data cards), added textures.js, warm desk lighting

## [0.4.0] — Newton's cradle full completion + cross-case visual alignment + skill v2 (2026-10-06)

### Newton's cradle case
- **双向实验**：L/R 角度独立滑块（5°–60°）+ Sync 联动，1 ball / 2 balls 对撞
- **材质+质量切换**：5 球独立切换钢（7850 kg/m³）/ 琥珀塑料（1050 kg/m³，约 1/7.5），质量加权弹性碰撞公式
- **音效区分**：钢-钢清脆 thump，含塑料球时闷响 sine 低频
- **面板两卡片布局**：Bidirectional（角度+球数）和 Material+Playback（MAT 按钮+Slow/Play/Reset+🔊），左右并排
- **球间距校准**：GLB 加载后延迟 3s 用 Box3 测包围盒，5 球紧贴
- **Tour/build 复位**：切换时 resetAll() 清物理+材质+拖拽；Physics 卡片 PHYSICS 步出现后持续到 BUILD
- **README**：聚焦物理特性和交互，弱化架构

### Lobby
- **图纸卡片可拖拽/旋转**：左键移动，Shift+拖动旋转，点击跳转（dragMoved 区分拖拽vs点击）
- **假接触阴影**：堆叠图纸重叠区用 canvas 生成柔和阴影，不依赖实时阴影
- **卡片高度分层**：底层 y=0.001，上层 y=0.004，hover 抬到 25mm，另一张微降 1mm 按压感
- **卡片对齐修复**：URL/纹理对应修正，renderOrder 强制上层置顶

### 跨案例视觉标准化
- **灯光统一**：ambient 0xffeed9/0.95, sun 0xfffaec/2.3/(-2.5,4.5,3.2), fill 0xdce7f6/0.6/(3,2,-1)
- **阴影参数**：2048 map, bias -0.0002, radius 12, blurSamples 16
- **桌面材质**：color 0xd9b98c warm tint（lobby 和 trebuchet 补上，原来偏白）
- **Tour banner**：全部改为 no-op，不显示文字提示

### Trebuchet
- Tour 提示栏删除（no-op banner）
- Physics 卡片公式改为用户可见参数（4:1 Lever / Energy Conversion / Trajectory / Parameters）
- README 重写聚焦物理特性

### Skill v2 改造
- **12 步工作流**（0-11），每步标注必读 pitfalls [stepN] 标签
- **3 个用户确认门**：intake Q&A / mesh roster / interaction nodes，文档存 docs/
- **新增 references**：visual-standards.md（灯光/桌面/面板标准）、case-onboarding.md（23项交付清单）
- **新增 pitfalls #37-#43**：GLB延迟测量、灯光复制、假接触阴影、拖拽vs点击、材质切换、hover高度、物理卡片公式风格
- **template 纯净化**：以牛顿摆为基线，无任何模型特有代码，新 case 只写 mechanism.js + spec.js
- **反哺机制**：新坑必须打 step 标签，模板级问题同步改 template/

### 清理
- 删除 newton-cradle 的 docs/ scripts/ plastic.exr
- 删除根目录旧 src/ dist/（投石机源码已在 cases/trebuchet/）
- 删除 .DS_Store 和未引用图片

## [0.3.0] — Newton's cradle clean rebuild + shell standardization (2026-10-05)

### 牛顿摆 case 重建
- 从 `skill/template/` 全新克隆，无投石机残留
- 8 步 tour：SKETCH → LIFT → MODEL → MATERIAL → PHYSICS → PLAY → REPLAY → BUILD
- 动态按钮门控：MODEL/MATERIAL 等白模加载后开启，PHYSICS/PLAY/REPLAY/BUILD 等交互就绪后开启
- 物理：5 钢球等质量弹性碰撞，restitution 0.95，V 形双绳约束 2D 平面
- PLAY 自动：Ball_0 左拉 20° 释放 → 一个来回 → reset；REPLAY 0.25× 慢镜
- Build 面板：拖拽任意球、Reset 复位静止、Side 默认视角

### Shell 标准化（反哺 template）
- 灯光/阴影/铅笔/橡皮/纸张从投石机 case 复制统一
- A4 纸 castShadow，桌面 receiveShadow
- 白模阶段 metalness=0 / roughness=1 / map=null
- LIFT cutout 高度 0.35 对齐白模
- 全英文 UI

### skill
- `references/project-delivery.md` 补：tour step 对称规则、PHYSICS 卡片规范、全英文 UI

## [0.2.0] — 多 case 大厅架构 + 牛顿摆端到端压测 + skill 双工作线（2026-10-03）

### 架构
- **多 case 目录结构**：`cases/trebuchet/`、`cases/newton-cradle/`、`cases/lobby/` 平级独立 vite 项目
- **大厅首页**：桌面场景两张图纸（投石机/牛顿摆），hover 浮起，点击跳转对应模型
- **Vercel 多页部署**：`vercel.json` 配置 build + rewrite，大厅 `/`、模型 `/trebuchet/`、`/newton-cradle/`

### 牛顿摆（newton-cradle）
- Blender MCP 建模：U 型木结构一体、L 形金属挂片、5 金属球、无弹性绳
- Tour 四阶段：SKETCH → LIFT（cutout 立起）→ MODEL（scale.z 0→2 拉宽）→ MATERIAL
- 环境贴图：GSG_PRO_STUDIOS_METAL_016_sm.exr + PMREMGenerator
- 笔/橡皮擦 visible 绑定图纸（show/hidePaperSketch 联动）

### skill 双工作线
- **Workstream A**（后台）：分析图纸+需求，生成问题清单
- **Workstream B**（前台）：立即起 template，SKETCH/LIFT 可见，其他按钮按 readiness 动态启用
- Step gating：SKETCH/LIFT 始终可用，MODEL/MATERIAL/PARTS/PLAY/REPLAY/BUILD 按完成度启用

### 公共素材标准化
- 桌面/木纹/灯光/env.exr/铅笔/橡皮擦 100% 复用 template
- 音效复用（playPickup/playDrop/playPaperSlide）

## [0.1.3] — skill 全量一致性审计 + 代码限位/注释核清 + 全对象碰撞音效（2026-10-02）

### skill 一致性审计（12 文件，术语与证据全部对齐物理域架构）
- **物理域术语统一（template → domain）**：recognition JSON `template_guess` → `domains[]`（可多域组合）；spec-schema `mechanism` 块改为 domain-specific；SKILL.md workflow step 5 与 scripts 注释、audit-checklist V2、两份 spec 的 `mechanism.type`（→ `rigid_linkage`）统一术语。
- **physics-pitfalls 过时代码引用更新**（教训保留、证据校正）：#1 拟合公式行号、#2 A4 尺度矛盾、#4 84.5° 限位（现 135°）、#5 硬编码 32°、#7 帧率步长、#9 纹理硬编码 —— 全部对照当前代码逐条验证后标注「历史案例 + Update(2026-10-02) 当前状态」；#3/#14 旧参数数字标注「当时」。
- **SKILL.md Feasibility gate 补规则缺口**：「gate 形状取决于物理域，先查 mechanism-templates，可多域组合」（原来只描述 rigid_linkage 一种 gate，与 field_force 单调场闸门矛盾）；Verdict 表补「结论限于声明的 L0-L5 还原级别」。
- **audit/paper-trebuchet-audit.md 加历史快照注记**：「演示级/V2 Unverified」等早期结论已被 0.1.0 推翻，避免误导。

### 代码层限位与注释核清（84.5° 之谜）
- **84.5° 是旧几何（4:1 之前 cradle 触纸角）残留，当前生效限位是 135°**（下拉 135° = 与支架 45°，最大能量 [user:2026-09-29]）。修复：`spec.js` UI.pull `{max:84.5}` → `{min:0,max:135,value:0,step:0.5}`（与 index.html 滑条一致，单一数据源归位）；`main.js` MAX_PULL_DEG 旁 84.5 矛盾注释、`physics.js`「纸接触是下拉物理下限」注释（现为解析 clamp 135°，纸接触仅安全网）全部更正。
- **配重残留注释清理**：`main.js` 3 处 2.6/2.60 kg → 默认 4.8 kg（M6 bug 案例标「当时 2.60」）；`physics.js` 头注释上限 1.40-4.00 → **1.40-10.0（默认 4.8）**，旧浏览器基线（2.6 kg → 3.53 m/s/31°）标注历史、待按当前默认重新实测。
- 全链路验证：84.5° 残留 0 处；135° 在 main.js/trebuchet.js/spec.js/index.html 全部一致；`npm run build` 通过。

### 全对象碰撞音效（2026-10-01，自 0.1.1 条目移入——0.1.1 已发布，本功能在 0.1.3 才合入 git）
- **球撞遍物理世界都有声**：新增 `playHit(kind)` 通用碰撞音效并按被撞对象材质分音色——铅笔「轻木嗒」、蓝白橡皮「橡胶闷咚」、整台投石机「硬木/金属哐」、球架「木架嗒」；积木方块保持原有 `playBlockHit` 不变。
- **按碰撞体分发**：各物理体打 `userData.hit` 标记（blocks/propBodies/球架/机架/臂/配重），球的 collide 监听按标记分发音效，`relVel > 0.3 m/s` 才发声、强度随撞击速度缩放；未标记对象（纸面/桌面等）回退原有木块声。

## [0.1.2] — sketch intake 流程落地 + 能力引导（skill 0.1.1/0.1.2 合并，2026-10-02）

### sketch-intake.md 新增（workflow 第 0–2 步从 "planned" 转为具体流程）
- **A 视图要求**：单视图是下限（缺侧视/俯视的维度一律标 `assumed` 而非 `measured`）；尺度锚点必须有（标注尺寸或已知参照物），没有就先问、绝不悄悄猜；清晰度判据（轮廓可辨、近正交、低明暗干扰）与多视图对应规则（标注 front/side/top、保持同向）。
- **B 识别方式**：Claude 原生视觉直接逐部件输出 parts/joints/ambiguities JSON（含 shape/bbox_px/material/role/confidence），脚本只做像素转米与 Spec 组装——不再设想 CV/OpenCV 管线。
- **C 歧义确认**：按类别批量提问（关节一轮/隐藏尺寸一轮/材质一轮）、guess-first 让用户改错而非开放式提问；置信度 ≥0.8 不问（避免用户学会不看题）；未答保持 `assumed` 写入报告，绝不静默升级 `declared`；`scale.status` 必须 `"OK"` 才继续写 Spec。

### 首次真实草图压测（1648 Wilkins 磁石永动机）
- **guides[]/fields[] 加入识别 schema**：真实草图暴露 `joints` 不适用于轨道约束与非接触力——新增 `guides[]`（斜面/滑槽/轨道，载荷靠自身动力学跟随）与 `fields[]`（磁/静电等非接触力，带 `monotonicity` 属性，无需精确力律即可推理可行性）；spec-schema.md 顶层字段同步。
- **单调场闸门（新模板）**：磁石引力随距离单调递减，"爬升最远点所需最小场强"与"通过点允许最大场强"处于同一曲线两端，任何单一强度都无法同时满足——尺度无关的非存在性证明，与 Wilkins 1648 原文一致；机械式活板门释放属另一机制、不适用此闸门。
- **验证了 provenance 规则的边界**：存在性证明类判定不依赖尺度锚点；此前六轮均为数值敏感型（投石机），未测试到这一点。

### 新增引导文档
- **mechanism-templates.md**：模板目录——铰链杠杆+悬挂配重（投石机族，数值敏感、静态平衡+能量预算 gate、完整工具链）与单调场重力回路（永动机族，尺度无关、存在性证明、无需数值工具）；"gate 形状变化才算新模板，换数字不算"。
- **capability-guide.md**：能力边界引导——能验证的草图类型表、不能验证的（FEA 类强度/疲劳/热/流体/公差、纯装饰、无锚点数值型、模板外机构类、柔体/流体）、选型决策顺序、结论措辞上限、当前成熟度诚实声明。

### 合并修复与保留
- **补回 V6 原则 6–7**（zip 基于旧基线缺失）：尊重自然力学不用 guard code、装饰件 visual-follow 不 force-follow。
- **恢复 workflow 7 的 P7/T3 慢镜指引**（0.1.1 zip 简化时丢失）。
- **工具名修正**：`ask_user_input_v0` → `interaction.ask`。
- **search_fix.mjs 保留 Spec 驱动版**（zip 为旧硬编码 [0.75,1.05]）；清理 references/ 下旧版 sweep/xcheck .mjs 残留。
- **Status 如实更新**：0–1 步首次真实草图跑通；步骤 2 歧义确认与后续建模尚未完整跑过（该案例在步骤 3 即判死刑）；下一张可行设计草图将是首次完整流程。

## [0.1.1] — 装弹抛物线飞行特效（2026-10-01）

### 装弹视觉闭环（球不再凭空出现）
- **球从球架抛物线飞入发射杯**：点击 Fire、点击球架上的球、点击发射杯、以及 tour 的 FIRE 步骤，球都以 300ms 的快节奏沿二次贝塞尔（严格抛物线）从球架抛入发射杯——上升拱起、越过杯口再落入碗底，全程清晰可见球来自球架。
- **飞行期间球不被吸附**：`updateBallInCup()` 增加飞行守卫，每帧不再把球钉回球架/发射杯；飞行只驱动 mesh，物理体保持停泊在球架（mask 0），落碗瞬间才落座，发射时序零改动。
- **异步装弹时序**：`loadBall()`/`fire()` 改为异步并互相等待——Fire 按钮在球落碗后才释放机构；点击装球后同一手势继续拖拽发射不受影响；拖拽中快速松手也会等球落碗再发射。
- **点击与拖拽分离**：快速点击球/球架/发射杯 = 仅装球（不误触拖拽）；按住不松 = 装球后直接进入拖拽，松开时若拉幅足够才发射。
- **Reset / 进入 build 打断飞行**：中途重置会立即停球回架，不会出现球滞留空中或装弹卡死。
- **新增抛物线呼啸音效** `playLoadWhoosh()`：轻快上行的带通噪声，与装球动作同步；**发射（球从发射杯飞出）也改用同一音效**，替换原来的大炮轰鸣（`playLaunch` 保留为备选）。
- **发射音效时序**：点 Fire 的完整音序为「装弹呼啸（球架→杯）→ 落杯后摆杆自动回拉的刻度声（`playTilt`）→ 臂摆到限位的瞬间再响起同款呼啸（杯→飞出）」——摆杆声与弹射呼啸落在真实机械动作点上，前后呼应。

### 残影修复（2026-10-01）
- **修复球架残影闪现**：飞行 tween 完成瞬间，同帧的每帧吸附逻辑曾看到"飞行已结束、球尚未落座"，把球钉回球架渲染 1 帧（表现为落杯后继续拖拽/发射时"杯球消失 → 球架闪现 → 回杯"）。现在飞行标记改由落座方（`loadBall()` / tour FIRE 步骤）在 `updateBallInCup()` 落座前清除，微任务间隙内每帧吸附仍被守卫挡住，球全程停在落杯位置、无任何跳变；tour 暂停 / 重置回第一帧也会立即终止飞行，杜绝飞行状态残留。

## [0.1.0] — 真实控制机关 + 天平装弹 + tour 回放闭环（2026-09-30/10-01）

### 力学与参数
- **配重滑块放开至 1.40–10.0 kg**（默认 4.8；tour 演示档 6.0/0.60 保证可击倒方块）；0.0.3 的 1.40–3.00（默认 2.60）上限废弃。透明箱沙量随滑块联动（最大值 = 满箱）。
- **球 0.30–0.60 kg**（默认 0.45）保持不变，球径按碗内径 100 mm 的 60%–80% 映射。
- **摆杆 4:1 力臂定稿**：碗心至轴承支点 L、支点至配重挂点 1/4 L；下拉最大限位 45°（与底座夹角），松手在摆杆垂直位弹射；配重默认力矩 > 球+摆杆力矩（无球/有球默认右倾就绪）。
- **天平装弹逻辑**：点球/球架/投射杯装球进碗；若球+摆杆力矩大于配重，摆杆自然左倾（真实物理，不做人为压制），需用户自行匹配球/配重组合。

### 真实控制机关（绳索卷筒）
- **摆杆底部金属圆环**（直径 < 摆杆宽 1/2，垂直连接螺栓固定）：绳索 A 端绳头嵌于环管内、不凸出环管壁。
- **底座单绳缠绕式卷筒**（与摆杆垂直对齐、底座水平居中）：绳索 B 端固定于卷筒中心不凸出；卷筒两侧铰盘，拖拽下拉逆时针、回弹顺时针，转速与摆杆同步；绳索全程绷紧直线显示（纯视觉，不传递作用力、不参与碰撞）。

### tour 流程闭环（零秒退）
- **FIRE 严格 2 秒进 REPLAY**（不再等球落地）。
- **REPLAY 慢镜仅覆盖发射→碰撞**：碰撞（撞击动量触发）瞬间恢复常速；碰撞后 5 秒兜底结束（修复球低速滚动 20s+ 卡停）；慢镜期间强制显示 flight path。
- **REPLAY 秒退根因修复**：FIRE 残留拉杆角 135° 使 REPLAY 从 REST 直接释放（ω≈0）——REPLAY 前重置拉杆角强制重新拉满。
- **REPLAY 结束 3s 复位对齐 fire**，随后自动进入 BUILD 并清理演示场景（球回架/方块复位/DOWN 清零）。
- **releaseBall 分段碰撞激活**：释放瞬间 mask 只撞方块+桌面（600ms），防慢镜物理步长把球压停。
- **刷新默认 READ 页清理球架/绳索**（初始蓝图态仅图纸+纸笔道具）；**分步点击 build 清理 tour 场景**（方块复位 + DOWN 清零）；**build 场景恢复球架/绳索**（不被 READ 清理误伤）。

### 场景与交互
- **球架双层设计定稿**：正方形底座 + 顶层薄托盘嵌 1/3 球面木碗凹坑（与木板齐平、凹坑直径大于球），球嵌入无光缝；球架置于图纸左下方（不阻挡方块弹开区域）。
- **装球即拖拽**：点击投射杯/球/球架装球后无需松开鼠标，同一手势继续拖拽下拉发射。
- **所有物件真实物理阻挡**：投石机（底座/支架/车轮/卷筒）、球架、铅笔、蓝白橡皮均为静态碰撞体，球与方块不可穿透；球发射后 3 秒自动复位回球座。
- **底部面板双行布局**：分区间距统一、滑条同一水平线对齐（zoom/ball/throw/sketch-model）、title 与数值高度对齐、按钮高度/长短统一（slow motion & flight path 左右排列、Fire 拉长右对齐）、信息区 2×2（SPEED/POWER/RANGE/DOWN）；品牌文字放大。

### skill 反哺（审计闭环）
- **sweep_trebuchet.mjs / xcheck_suite.mjs 参数网格更新为当前真实滑块区间**（配重 1.40–10.0、球 0.30–0.60）并重跑，替换已废弃的方案 A 网格（0.20–0.02/0.30–1.00）。
- **examples/trebuchet.spec.json**：release 如实标注 `fitted`（31° 释放角为命中优化标定，非理想几何）；`fitted_quantities_in_current_project` 清空已删除的旧拟合公式。
- **physics-pitfalls.md** 新增通用坑：验证过某组参数 ≠ 验证了当前所有参数——滑块范围一变，旧 PASS 必须重跑，不能默认仍成立。
- **本轮物理特性反哺（V6）**：
  - SKILL.md 新增原则 6「尊重自然力学，不用 guard code 伪造状态」（就绪/倒转由真实力矩与碰撞限位决定，配重默认参数保证右倾）+ 原则 7「装饰件 visual-follow，不 force-follow」（绳索/卷筒/铰盘只做运动学跟随，不传力、不带碰撞）。
  - physics-pitfalls.md 新增 21–23：装饰机构与动力学解耦；发射物与机体重叠被 solver 钳速（releaseBall 分段碰撞激活 600ms）；低速滚动球永不 settle（碰撞事件 + 5s 兜底，事件驱动优于速度阈值）。
  - audit-checklist.md 新增 P7（最慢时间尺度下干净释放）、T6（装饰件改动不影响发射读数）、T7（复合交互单指针会话完成），扩展 T3（事件驱动回放终止）、T5（全场景阻挡：机体/球架/卷筒均不可穿透）。

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
