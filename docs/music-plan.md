# 清弦（`/music`）在线播放功能 · 方案与实测记录

> 本文档记录**实测**结论，不是照抄 `musicFunctionDevDoc.md`。
> 实测中发现了若干与那份文档不一致的地方，凡是影响设计的都记在下面。

## 一、API 实测结论

基础地址 `https://music-api.gdstudio.xyz/api.php`，无需登录、无需 Key。
实测时间：2026-10，由 `scripts/_probe-music-api*.py` 逐个验证（脚本已删除）。

| 验证项 | 结果 |
| --- | --- |
| `types=search`（netease） | HTTP 200，字段与文档一致 |
| `types=url`（netease，br=320） | HTTP 200，返回真实 `.mp3` 签名地址 |
| `types=pic`（netease） | HTTP 200 |
| `types=lyric`（netease） | HTTP 200，标准 LRC |
| **`kuwo`** | **HTTP 400 `Value of source is not supported`** |
| **`joox`** | 搜索 200，但 `types=url` 恒返回空链接（`= 编码`与`原样`两种写法都试过） |
| 其余 11 个音源 | 全部 HTTP 400 不支持（tencent / kugou / migu / tidal / qobuz / spotify / apple / ytmusic…） |

### 由此得到的四条硬结论

1. **`netease` 是唯一真正能播的音源。**
   文档推荐的备用链 `netease → kuwo → joox` 是**双层失效**的：
   kuwo 被服务端直接拒绝，joox 能搜不能放。
   查了根源：**API 自己的 `api.php` 文档页仍然列着 kuwo**，
   所以不是那份文档抄错，而是 **API 的实现与它自己的文档不一致**。
   → 代码里**不做多音源轮询**，失败就重试 netease，不要浪费请求去试已知不可用的音源。

2. **播放地址是短时签名，但支持 Range。**
   URL 形如 `.../20261007144126/....mp3`，**两次请求得到的 URL 不同**，
   说明带时间戳签名、有有效期。
   同时实测响应头为：
   - `Content-Type: audio/mpeg`
   - `Accept-Ranges: bytes`
   - `Access-Control-Allow-Origin: *`
   - 带 `Range: bytes=0-1023` 的请求返回 **HTTP 206**
   → **进度条拖动可用**；**播放地址不能长期缓存**。

3. **CORS 只需解决 JSON 接口。**
   `<audio src>` 与 `<img>` 不受同源策略约束，直连 CDN 即可；
   但 `fetch` 那个 JSON 接口会被 CORS 拦下 → **必须走后端代理**。

4. **限流 60 次 / 5 分钟 → 缓存是必需项，不是优化项。**
   一个访客点 10 首歌 = 30 次调用（url + pic + lyric），两个访客就能吃光配额。
   → 采用下面 3.2 的两层缓存。

## 二、方案

### 2.1 数据模型（`Song` 扩展，全部可空，纯追加、不动现有数据）

| 字段 | 用途 |
| --- | --- |
| `source` | 音源，默认 `"netease"` |
| `apiId` | 播放用的 `url_id`；**为空 = 尚未绑定** |
| `picId` / `lyricId` | 取封面与歌词用的 ID |
| `coverUrl` | 绑定时抓取入库的封面地址 |
| `lyric` | 绑定时抓取入库的 LRC 原文 |
| `album` | 专辑名 |

### 2.2 两层缓存

- **DB 缓存（永久）**：`coverUrl` 与 `lyric` 在**绑定那一刻**就抓下来存库。
  → 前台渲染卡片墙与歌词是**零 API 调用**。
- **内存缓存（短）**：播放地址是签名短时的，只缓存约 10 分钟，失败自动重取。

前端只与自己的服务器通信（`connect-src 'self'` 不用改）。

### 2.3 运行时接口面（刻意做小）

- `GET /api/music/play?id={songId}` —— 唯一对访客开放的接口，带频率限制。
- 前台**不做搜索**：既符合「我喜欢的音乐」的定位，也不会让公开访客
  无限消耗 60 次/5 分钟的配额，版权暴露面也最小。

后台侧（站长专属）：搜索、单条绑定、批量自动匹配（带确认预览）。

### 2.4 CSP

音频与封面直连 CDN，因此需要放宽两个指令：

```
media-src 'self' https://*.music.126.net
img-src   'self' data: blob: https://*.music.126.net
```

一个通配符同时覆盖音频（`m701/m801.music.126.net`）与封面（`p1/p2.music.126.net`）。
`connect-src` 保持 `'self'` 不变。选择这条而不是由服务器代理音频，
是为了不让 ECS 承担全部音频流量（320kbps ≈ 2.4MB/分钟/人）。
若将来发现 CDN 更换域名导致播放失败，再改为服务器代理。

## 三、来源标注与免责

- 播放器旁一行小字：数据来源 GD音乐台 · 仅供个人学习
- 独立页 `/music/disclaimer`：完整免责声明
- 页脚加链接
- **侵权联系方式取自简历页（`ResumeProfile`）的邮箱与电话**，
  不另外硬编码一份联系方式，避免出现第二个真相源
- 不提供任何下载入口

## 四、界面

- **卡片墙**：按歌手分组的网格卡片，显示歌手、歌曲数、该歌手推荐曲的封面
  （封面取自已入库的 `coverUrl`，零调用）；点击卡片**就地展开**露出歌单
- **底部固定播放条**：封面 + 歌名歌手 + 播放/暂停 + 上下一首 +
  可拖动进度条 + 音量；移动端压缩为紧凑版
- **歌词抽屉**：LRC 解析 + 滚动高亮
