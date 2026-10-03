# Lobby 图纸规范

路径：`public/lobby-assets/`

## 文件命名
- `{model-name}.jpg` 或 `.png`（小写短横线）
- 例：`trebuchet.png`、`newton-cradle.jpg`

## 尺寸
- 推荐分辨率：1600 × 1100 px（A4 比例 1.45:1）
- 最小不低于 1200 × 850
- 背景：纯白 `#f7f4ea`
- 线稿：深灰 `#333`，居中，占画面 70%

## 配置
在 `lobby.html` 的 `cardDefs` 数组加一项：
```js
{ url: 'http://localhost:51xx/', x: -0.55, z: 0.15, yaw: -0.12, tex: '文件名' }
```
- `x/z`：桌面位置（米），两张图纸左右错开
- `yaw`：旋转角度（弧度），轻微不规则摆放
