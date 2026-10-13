#!/usr/bin/env node
/**
 * 生成维护页与 Nginx 维护配置。
 *
 * 用法：
 *   node maintenance/build.mjs
 *   node maintenance/build.mjs --domain www.lankhub.xyz
 *   node maintenance/build.mjs --cert /etc/letsencrypt/live/www.lankhub.xyz/fullchain.pem
 *
 * 为什么维护页要把图片**内联成 base64**，而不是 <img src="...">：
 * 维护配置对**所有**请求返回 503（含静态资源路径）。若图片走单独请求，
 * 它本身也会是 503，浏览器是否还肯渲染就不确定了 —— 内联成一个文件就不存在这个问题。
 * 代价是 HTML 约 350KB；一张没人天天看的维护页，这个代价可以接受。
 *
 * 为什么配置文件里域名用 __DOMAIN__ 占位、而不是直接把域名提交进仓库：
 * 让脚本在安装时替换，仓库里不写死部署信息。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")

/** 图片源文件 —— 放在 docs/photo 下，会被一起提交，避免维护页有独立的一份副本 */
const IMAGE_SRC = join(root, "docs", "photo", "update.jpg")

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/*
 * 只有域名与站点根可配。
 *
 * ⚠️ 原来这里还有一个 --cert / 证书自动探测，**已经删掉**：
 * 这份配置是 HTTP-only 的（站长的站点只用 80），根本没有任何 ssl 指令，
 * 再保留证书参数只会让人以为「维护配置和证书有关」，
 * 从而重复踩「80 跳 443 但 443 无人监听」那个把站点打挂的坑。
 * 将来真上 HTTPS 时再加回来，且必须同时补 443 块。
 */
const domain = arg("domain", "www.lankhub.xyz")
const webRoot = arg("webroot", "/var/www/lankhub-maintenance")

/*
 * server_name 要同时覆盖**带 www 与不带 www** 两种写法。
 *
 * ⚠️ 只写一个的话，另一个会落到站点自己的 server 块、看到正常页面 ——
 * 维护模式就等于只挡了一半（站长的站点正是两个名字都在同一个块里）。
 * 去重是为了万一 --domain 传的就是不带 www 时不会写出重复项。
 */
const serverNames = [...new Set([domain, domain.replace(/^www\./, "")])].join(" ")

if (!existsSync(IMAGE_SRC)) {
  const dir = join(root, "docs", "photo")
  console.error("✗ 找不到维护图片。")
  console.error(`  期望位置：${IMAGE_SRC}`)
  if (existsSync(dir)) {
    const entries = readdirSync(dir)
    console.error(`  docs/photo/ 目录存在，里面有：${entries.length ? entries.join("、") : "（空）"}`)
    console.error("  如果文件名不是 update.jpg，请改名或改这个脚本里的 IMAGE_SRC。")
  } else {
    console.error("  docs/photo/ 目录也不存在。")
    console.error("  这个图片必须提交进仓库 —— 否则服务器上 git pull 后没有它，构建就会失败。")
    console.error("  检查一下它有没有被 .gitignore 挡掉：git check-ignore -v docs/photo/update.jpg")
  }
  process.exit(1)
}

const image = readFileSync(IMAGE_SRC)
const b64 = image.toString("base64")

/*
 * 维护页。
 * 刻意只放图片、不加任何小字（站长明确要求）。
 * `object-fit: contain` + `max-width/height: 100%`：图是 16:9，窄屏上竖过来也不会被裁切。
 */
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>正在紧急修复</title>
<link rel="icon" href="/favicon.ico">
<style>
  html, body { height: 100%; margin: 0; background: #05060a; }
  body { display: flex; align-items: center; justify-content: center; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style>
</head>
<body>
<img src="data:image/jpeg;base64,${b64}" alt="网站正在遭受毁灭性打击，正在紧急修复">
</body>
</html>
`

const nginxTemplate = `# lankHub 维护模式 —— 由 scripts/maintenance/enable.sh 安装
#
# 这是一份**独立**的 server 配置，不改动你自己的 site 配置。
# 开/关 = 建/删一个软链（见 enable.sh / disable.sh）。
#
# ⚠️⚠️ 这里是 **HTTP-only** 站点，配置文件里**故意没有**任何 443 / ssl 内容。
#
# 曾经写成「80 上 301 跳 HTTPS + 443 上放维护页」，结果**把站点整个打挂**：
# 那个站点只用 80、根本没有监听 443，于是所有域名请求被 301 跳到一个
# 死端口（浏览器表现为「无法访问」），而用 IP 访问因为匹配不到 server_name
# 反而落到了 default_server（看起来正常）—— 症状极具误导性。
#
# 结论：**维护配置必须和站点实际使用的协议一致**。
# 换环境前先确认：这个站到底是 HTTP 还是 HTTPS？
#   sudo nginx -T | grep -E 'listen|ssl_certificate'
# 若将来真的上了 HTTPS，再往这里加 443 块，不要提前写跳转。

server {
    listen 80;
    listen [::]:80;
    server_name __SERVERNAMES__;

    # ⚠️ 证书续期路径放行。
    # 现在虽然是 HTTP-only，但保留这一段：将来上 HTTPS 时不必回头改文件。
    # 另外若这个站点以后签了证书，维护期间不放开这条就会让续期失败。
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }

    root __WEBROOT__;

    # 维护期间的访问日志单独一份：方便看还有多少流量在打进来
    access_log /var/log/nginx/lankhub-maintenance.log;

    # 维护提示，配合下面的 503；让搜索引擎与客户端知道「过一小时再来」
    add_header Retry-After 3600 always;
    # 维护页不该被缓存 —— 否则恢复站点后访客仍看到旧页面
    add_header Cache-Control "no-store" always;

    # 所有人（包括站长）都只看到维护页。
    # 要验证真实站点是否正常，在服务器上绕过 Nginx 直接打 Node：
    #   curl -I http://127.0.0.1:3000
    #
    # ⚠️ 这里**不能**写成 try_files $uri /index.html = 503。
    # 实测（nginx 1.30）那个写法在文件真实存在时返回的是 **200**，
    # 于是「503 + Retry-After」完全失效 —— 搜索引擎会把维护页当正常页面收录，
    # 而响应头里却挂着 Retry-After，自相矛盾。
    # 正确做法：return 503 给出状态码，再用 error_page 把响应体换成维护页。
    # error_page 到内部 location 时会**保留 503**。
    location / {
        return 503;
        # 响应头在这两个 location 都写一遍。
        # error_page 是**内部重定向**，响应最终由内部 location 产生；
        # 而 add_header 的继承是「子级自己写了就整体覆盖父级」，不合并。
        # 只写一边都可能丢，所以两边都写 —— 谁产生响应谁就带上它。
        add_header Retry-After 3600 always;
        add_header Cache-Control "no-store" always;
    }
    error_page 503 /__maintenance.html;

    location = /__maintenance.html {
        internal;
        add_header Retry-After 3600 always;
        add_header Cache-Control "no-store" always;
        root __WEBROOT__;
    }
}
`

/**
 * 维护页文件名。
 *
 * 用 `__maintenance.html` 而不是 `index.html`：
 * 配置里 `error_page 503 /__maintenance.html` 指向的是一个 `internal` location，
 * 带前缀的名字**不与将来可能出现的其它 index.html 混淆**，
 * 也让人一眼看出它是维护模式的专用文件。
 */
const MAINTENANCE_PAGE = "__maintenance.html"

const confPath = join(here, "lankhub-maintenance.conf")
const htmlPath = join(here, MAINTENANCE_PAGE)

writeFileSync(htmlPath, html)
writeFileSync(
  confPath,
  nginxTemplate
    .replace(/__SERVERNAMES__/g, serverNames)
    .replace(/__WEBROOT__/g, webRoot)
)

const kb = (n) => `${Math.round(n / 1024)}KB`
console.log("✅ 维护页与配置已生成")
console.log("   图片来源：docs/photo/update.jpg  (" + kb(image.length) + ")")
console.log("   维护页  ：maintenance/__maintenance.html  (" + kb(Buffer.byteLength(html)) + "，图片已内联)")
console.log("   Nginx   ：maintenance/lankhub-maintenance.conf")
console.log(`             域名     ${serverNames}`)
console.log(`             站点根   ${webRoot}`)
console.log("             协议     HTTP-only（只监听 80，不做任何跳转）")
console.log("")
console.log("⚠️ 这份配置是 **HTTP-only** 的：没有 443、没有 ssl_certificate、没有 301 跳转。")
console.log("   如果你改用 HTTPS，必须往配置里补 443 块 —— 直接让 80 跳 443")
console.log("   而 443 无人监听，会把整个站点打挂（真实踩过）。")
console.log("")
console.log("生成物不入库（见 .gitignore），改动模板后要重新跑一次本脚本。")
console.log("下一步：在服务器上执行 bash scripts/maintenance/enable.sh")
