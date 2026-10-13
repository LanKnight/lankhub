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

/**
 * 自动探测证书路径。
 *
 * ⚠️ 为什么需要这个：域名与证书路径**因部署环境而异**，而这正是上一次翻车的点 ——
 * 线上证书在 /etc/letsencrypt/live/lankhub.xyz/（**不带 www**），
 * 而脚本默认按 www 拼路径，两边不一致就会在 reload 前才报错。
 *
 * certbot 的目录名就是证书里的域名，所以「带 www」与「不带 www」两种都得试。
 * 都找不到时返回默认值（带 www），由 enable.sh 的「证书存在」检查兜住并给出提示。
 */
function detectCert(domain) {
  const bare = domain.replace(/^www\./, "")
  const live = "/etc/letsencrypt/live"
  const candidates = [...new Set([domain, bare, `www.${bare}`])].map(
    (d) => `${live}/${d}/fullchain.pem`
  )
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]
}

const domain = arg("domain", "www.lankhub.xyz")
const detected = detectCert(domain)
// 显式传了 --cert 就用它；没传则用探测到的
const cert = arg("cert", detected)
const webRoot = arg("webroot", "/var/www/lankhub-maintenance")

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
# ⚠️ 这个文件是**独立**的一份 server 配置，不改动 sites-available/lankhub。
# 原因：线上那份被 certbot 改过（加了 443 与证书段），脚本去改它风险很大。
# 独立文件的好处是开/关 = 建/删一个软链，certbot 的修改完全不受影响。
#
# 生效方式：软链到 sites-enabled 后 nginx -s reload
# 关闭方式：scripts/maintenance/disable.sh（删软链并 reload）

# 让 Nginx 能读 /var/www 下的文件（默认 www-data 对 755 目录就够了，
# 但如果你的发行版把 nginx 跑在别的用户下，这里放开更省事）
# user www-data;

server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    # ⚠️ 证书续期必须放行。
    # 维护模式对所有请求都回 503，若不单独放行这个路径，
    # **维护期间证书无法续期**，等你恢复站点时证书可能已经过期了。
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }

    # 其余一律跳 HTTPS；证书还没签下来时把它换成下面那两行直接回 503
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    # ⚠️ HTTP/2 必须用**老写法**：把 http2 写在 listen 这一行里。
    #
    # 不要用独立的 http2 on; 指令 —— 那是 nginx 1.25.1 才引入的，
    # 线上是 1.24.0，会直接报 unknown directive "http2" 并让 nginx -t 失败。
    # （这次就是这么踩的：本机 WSL 是 1.30 所以没暴露，服务器上才炸。）
    #
    # 写在 listen 里的形式 1.9.5 起就支持，1.25.1+ 也仍然可用，
    # 是唯一两边都通吃的写法。ssl 与 http2 必须与 listen 在同一行。
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __DOMAIN__;

    ssl_certificate     __CERT__;
    ssl_certificate_key __KEY__;
    # certbot 一般也写了这两行，重复声明无害
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root __WEBROOT__;
    index index.html;

    # 维护期间的访问日志单独一份：方便看还有多少流量在打进来
    access_log /var/log/nginx/lankhub-maintenance.log;

    # 维护提示，配合下面的 503；让搜索引擎与客户端知道「过一小时再来」
    add_header Retry-After 3600 always;
    # 维护页不该被缓存 —— 否则恢复站点后访客仍看到旧页面
    add_header Cache-Control "no-store" always;

    # 所有人（包括站长）都只看到维护页（站长选的「谁都挡」）。
    # 要验证真实站点是否正常，在服务器上绕过 Nginx 直接打 Node：
    #   curl -I http://127.0.0.1:3000
    #
    # ⚠️ 这里**不能**写成 try_files $uri /index.html = 503。
    # 实测（nginx 1.30）那个写法在 /index.html 真实存在时返回的是 **200**，
    # 于是「503 + Retry-After」完全失效 —— 搜索引擎会把维护页当正常页面收录，
    # 而响应头里却挂着 Retry-After，自相矛盾。
    # 正确做法：return 503 给出状态码，再用 error_page 把响应体换成维护页。
    # error_page 到内部 location 时会**保留 503**。
    location / {
        return 503;
        # 响应头在这两个 location 都写一遍。
        # error_page 是**内部重定向**，响应最终由 /__maintenance.html 产生；
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

const confPath = join(here, "lankhub-maintenance.conf")
/*
 * 文件名用 `__maintenance.html` 而不是 `index.html`：
 * 配置里 `error_page 503 /__maintenance.html` 指向的是一个 `internal` location，
 * 用这个带前缀的名字是为了**不与将来可能出现的其它 index.html 混淆**，
 * 也让人一眼看出它是维护模式的专用文件。
 */
const htmlPath = join(here, "__maintenance.html")

// 证书 key 由 fullchain 路径推导：certbot 的命名约定是 privkey.pem
const key = arg("key", cert.replace(/fullchain\.pem$/, "privkey.pem"))

writeFileSync(htmlPath, html)
writeFileSync(
  confPath,
  nginxTemplate
    .replace(/__DOMAIN__/g, domain)
    .replace(/__CERT__/g, cert)
    .replace(/__KEY__/g, key)
    .replace(/__WEBROOT__/g, webRoot)
)

const kb = (n) => `${Math.round(n / 1024)}KB`
const certIsDetected = !process.argv.includes("--cert")
console.log("✅ 维护页已生成")
console.log("   图片来源：docs/photo/update.jpg  (" + kb(image.length) + ")")
console.log("   维护页  ：maintenance/__maintenance.html  (" + kb(Buffer.byteLength(html)) + "，图片已内联)")
console.log("   Nginx   ：maintenance/lankhub-maintenance.conf")
console.log(`             域名 ${domain}`)
console.log(
  `             证书 ${cert}${certIsDetected && detected === cert ? "（自动探测到）" : ""}`
)
console.log(`             站点根 ${webRoot}`)
if (certIsDetected && !existsSync(cert)) {
  console.log("")
  console.log("⚠️  上面这个证书路径在本机**不存在**。")
  console.log("    如果这是你的服务器，请确认实际路径，必要时显式指定：")
  console.log("      node maintenance/build.mjs --cert /你的路径/fullchain.pem")
}
console.log("")
console.log("下一步：在服务器上执行 bash scripts/maintenance/enable.sh")
