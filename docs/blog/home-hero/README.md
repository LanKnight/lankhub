# 首页改造文章包（发布说明）

这个目录是**《把首页换成两幅水墨画》**这篇博客的素材与源文件。正文是 Markdown，
图片是可直接上传的成品，示意图还留着 SVG 源，改字重画都行。

## 目录

```
docs/blog/home-hero/
├─ article.md          ← 正文（Markdown，含表格、代码块、图片引用）
├─ metrics.csv         ← 所有实测数字，按「指标/改前/改后/测法/备注」一行一条
├─ images/             ← 发布用图（WebP 截图 + PNG 示意图）
└─ diagrams/           ← 示意图 SVG 源（与 images/ 里的 PNG 一一对应）
```

## 正文里的图片（共 12 张）

| 文件 | 用在哪一节 | 建议图注 |
| --- | --- | --- |
| `hero-snow.webp` | 0. 先说结论 | 正常态：雪山、梅枝、行书题字 |
| `layers.png` | 2. 架构 | 首屏的层结构：从底图到文字 |
| `wheel-lock.png` | 3. 滚轮切屏 | 一次「锁 → 滚 → 解」的时序 |
| `scene-state.png` | 4. 两套场景 | 两个状态、四条输入 |
| `hero-mobile.webp` | 5. 字体 | 手机端是另出的竖版，不是缩放 |
| `hero-jianghu.webp` | 6. 动态 | 江湖态：夜色、月晕、归鸟、灯火 |
| `birds-before-after.webp` | 7. 擦鸟 | 4× 放大：擦除前后 |
| `ink-60ms.webp` / `ink-140ms.webp` | 8. 墨晕转场 | 墨团在 60ms / 140ms 时的半径 |
| `perf.png` | 9. 性能 | CLS / LCP / 帧间隔 改前改后 |
| `reduced-motion.webp` | 9. 性能 | 开启「减少动画」后的样子 |
| `ai-loop.png` | 10. 协作 | 我这边的工作循环 |

## 发布步骤（重要：图片必须先上传到站内）

站点的 CSP 是 `img-src 'self'`，**外链图片会被拦掉**（编辑器粘贴 markdown 时也会把外链图片换成一句提示）。
所以顺序是：

1. **先上传图片**：后台 → 相应上传入口，把 `images/` 里的文件传上去（支持 JPG/PNG/WebP，单张 ≤10MB）。
2. 记下返回的地址，形如 `/api/images/<filename>`（图片体积已经压过：截图 5–42KB，示意图 38–74KB）。
3. 在正文里把 `images/xxx.webp` 批量替换成上面的地址。
   - 在编辑器里粘贴 markdown 时，`![图注](images/xxx.webp)` 这种相对路径**不会**被自动处理，必须换成站内地址。
4. 粘贴后确认三件事：表格正常、代码块没被吞、图片能显示。

## 建议的发布信息

- **标题**：把首页换成两幅水墨画：一次前端改造的技术记录，以及我和 AI 协作的方式
- **摘要**：一个 HTML 属性切换整套首屏视觉；滚轮切屏怎么不跟浏览器抢控制权；13KB 的按字裁剪中文书法体；位图修补与遮罩转场；以及这一轮 AI 结对里真正有效的做法。
- **标签**：前端、Next.js、CSS、性能优化、AI 协作
- **封面**：用 `images/hero-snow.webp` 或 `images/hero-jianghu.webp`（16:10，1200×750）

## 需要调整时

- **改示意图**：编辑 `diagrams/*.svg`（纯手写 SVG，没有依赖），再按 1600 宽、2 倍密度导出 PNG。
  一行命令就够（项目里已有 sharp）：

  ```bash
  node -e "const s=require('sharp');s('diagrams/layers.svg',{density:144}).resize({width:1600}).png({compressionLevel:9,palette:true}).toFile('images/layers.png')"
  ```

  注意中文行长：`font-size: 16` 时一行别超过约 60 个汉字，否则会溢出画布（`wheel-lock` 与
  `scene-state` 都因为这个问题返工过一次）。
- **改截图**：截图来自 headless Edge + CDP，重拍后按 1200 宽、WebP q84 压一遍即可（当前每张 6–49KB）。
- **改数字**：所有数字都来自 `metrics.csv`，改正文时同步改它，避免两处对不上。
- **裁剪**：`hero-*.webp` 是 1200×750，可直接当封面；`perf.png` 与 `wheel-lock.png` 上下留白较多，若排版太挤可裁掉底部 8%。
