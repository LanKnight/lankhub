# MCP 从 0 到 1（文章包）

这个目录是一篇「保姆级」MCP 教程的全部材料：正文 + 9 张示意图 + 3 个可直接运行的代码片段。

## 目录

```
docs/blog/mcp-from-zero/
├─ article.md                     正文（Markdown：表格 / 代码块 / 图片）
├─ images/                        9 张发布用图（1600 宽 PNG，43–69KB）
├─ diagrams/                      示意图 SVG 源（手写，改字重画）
│  ├─ overview.svg  四个角色           ├─ lifecycle.svg  协议生命周期
│  ├─ nm.svg        N×M 到 N+M         ├─ case-arch.svg  案例四层架构
│  ├─ chains.svg    两条调用链          ├─ gates.svg      五道闸门
│  ├─ transport.svg 两种传输            ├─ deploy-seq.svg 部署时序
│  └─ decision.svg  该不该写 MCP
└─ snippets/                      可运行代码
   ├─ mcp-server.mjs              零依赖 MCP Server（含 --selftest）
   ├─ run.sh                      服务器侧白名单脚本（脱敏版）
   └─ registration.yml            接到宿主的配置（Claude Desktop / 插件式）
```

## 自测片段（写文章时用来保证代码能跑）

```bash
# MCP Server：握手 / 列工具 / 两道部署闸门，共 4 项断言
node snippets/mcp-server.mjs --selftest

# 白名单脚本：上服务器前先过语法
bash -n snippets/run.sh

# 手工喂一帧，看服务器回什么（调试 MCP 最好用的招）
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}}}' \
  | node snippets/mcp-server.mjs
```

## 正文里的图片（9 张，按出现顺序）

| 文件 | 用在哪一节 | 建议图注 |
| --- | --- | --- |
| `nm.png` | 1. MCP 是什么 | 从 N×M 到 N+M |
| `overview.png` | 2. 四个角色 | 谁在想、谁在干、谁被干 |
| `chains.png` | 3. 与 Function Calling 的区别 | 两条调用链 |
| `transport.png` | 4.1 两种传输 | stdio 与 Streamable HTTP |
| `lifecycle.png` | 4.2 生命周期 | 一次握手，然后反复调用 |
| `case-arch.png` | 5. 手把手 | 案例四层架构 |
| `gates.png` | 5.3 五道闸门 | 任意一道不过就退出 |
| `deploy-seq.png` | 5.4 为什么不同步跑 | 触发 → 后台 → 轮询 |
| `decision.png` | 7. 该不该写 MCP | 四句话决策树 |

## 发布步骤

1. **先上传图片**：把 `images/` 里的 9 张传到站内（本站 CSP 是 `img-src 'self'`，外链图片会被拦）。
2. 把正文里 `images/xxx.png` 换成上传后的站内地址。
3. 粘贴进编辑器（支持 Markdown 粘贴：表格、代码块、图片都能转），然后核对三件事：表格没散、代码块没被吞、图片能显示。
4. 建议的发布信息：
   - 标题：从 0 到 1 做一个 MCP：把我服务器的部署权限，安全地交给 AI
   - 摘要：MCP 标准化的是「管子」而不是模型能力；Function Calling 管说、MCP 管送；附一个零依赖的可运行实现与五道部署闸门。
   - 标签：AI、MCP、工程实践、安全、运维
   - 封面：`images/overview.png` 或 `images/case-arch.png`

## 改图与改数字

- 改示意图：编辑 `diagrams/*.svg` 后重新导出（1600 宽、2 倍密度）：

  ```bash
  node -e "const s=require('sharp');s('diagrams/overview.svg',{density:144}).resize({width:1600}).png({compressionLevel:9,palette:true}).toFile('images/overview.png')"
  ```

- SVG 里的文字注意事项：**不要写 markdown 的 `**`**、也不要用 `<b>`（SVG 不认 HTML 标签），需要加粗就用 `font-weight="700"`。
- 所有数字（耗时、退出码、重启计数）都来自真实运行；改正文时如果重跑过一次部署，记得同步更新。

## 脱敏约定

正文与片段里统一使用这些占位符，发布前请确认没有把真实信息填回去：

`<服务器地址>` · `<用户>` · `<专用密钥>` · `<项目目录>` · `<白名单脚本>` · `ops.your-domain.example`
