#!/usr/bin/env bash
# ============================================
# 为站点启用 HTTPS（**第一步：只加 443，不做任何跳转**）
#
# 用法（在**服务器**上执行）：
#   sudo bash scripts/https/enable.sh \
#     --cert /etc/nginx/cert/www.lankhub.xyz.pem \
#     --key  /etc/nginx/cert/www.lankhub.xyz.key
#
#   --dry-run     只看会做什么，不改任何东西
#   --no-copy     不把证书拷到 /etc/nginx/ssl，直接引用你给的路径
#   --domains a,b 覆盖要覆盖的域名列表（默认 www.<domain> 与 <domain>）
#
# ⚠️ 为什么是「分两步」：
# 上一次维护模式把整站打挂，根因就是「跳到了一个没人监听的端口」。
# 所以这一步**只加 443**，80 保持原样可用 —— 万一 HTTPS 不通，
# 站点仍然能访问，你不会被锁在外面。确认 HTTPS 真的可用之后，
# 再执行 scripts/https/enable-redirect.sh 去加 80→443 的跳转。
#
# 本脚本做四件事，每一步失败都会停在原地、不 reload：
#   1. 校验 .pem 与 .key 是配对的（不配对的话 nginx 直接起不来）
#   2. 校验证书覆盖了要用的域名（不覆盖的话浏览器会报证书错误）
#   3. 生成独立的 443 配置文件并软链（**不动你现有的 80 配置**）
#   4. nginx -t 过了才 reload
# ============================================
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/../.." && pwd)"

DOMAIN="www.lankhub.xyz"
CERT_SRC=""
KEY_SRC=""
DOMAINS=""
DO_COPY=1
DRY_RUN=0

# HTTPS 配置在 sites-enabled 里的文件名。
# ⚠️ 用「zz-」开头是为了让它**排在站点自己的 .conf 之后**被加载：
# 同一个端口上出现重复的 server_name 时，nginx 只用**先加载**的那个，
# 若我们的块排前面，会把站点自己的 443 块（如果将来有）挤掉。
LINK_NAME="zz-lankhub-https"
LINK="/etc/nginx/sites-enabled/$LINK_NAME"
CONF_DIR="/etc/nginx/sites-available"
CONF_FILE="$CONF_DIR/$LINK_NAME.conf"
SSL_DIR="/etc/nginx/ssl"

while [ $# -gt 0 ]; do
  case "$1" in
    --cert) CERT_SRC="${2:-}"; shift 2 ;;
    --key) KEY_SRC="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --domains) DOMAINS="${2:-}"; shift 2 ;;
    --no-copy) DO_COPY=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "✗ 未知参数：$1"; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "    [dry-run] $*"; else "$@"; fi
}

echo "==========================================="
echo "  启用 HTTPS（第一步：只加 443，不跳转）"
[ "$DRY_RUN" = "1" ] && echo "  （dry-run：不会修改任何东西）"
echo "==========================================="
echo ""

# ---- 0. 参数与权限 ----
echo "① 前置检查"
if [ "$DRY_RUN" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "  ✗ 需要 root 权限（要写 /etc/nginx）。请用 sudo 运行。"
  exit 1
fi
echo "  ✓ 权限"

if [ -z "$CERT_SRC" ] || [ -z "$KEY_SRC" ]; then
  echo "  ✗ 必须用 --cert 与 --key 指定证书与私钥路径。"
  echo "    例如：sudo bash scripts/https/enable.sh \\"
  echo "      --cert /etc/nginx/cert/www.lankhub.xyz.pem \\"
  echo "      --key  /etc/nginx/cert/www.lankhub.xyz.key"
  exit 1
fi
[ -f "$CERT_SRC" ] || { echo "  ✗ 证书不存在：$CERT_SRC"; exit 1; }
[ -f "$KEY_SRC" ] || { echo "  ✗ 私钥不存在：$KEY_SRC"; exit 1; }
echo "  ✓ 证书：$CERT_SRC"
echo "  ✓ 私钥：$KEY_SRC"

if [ ! -d /etc/nginx/sites-enabled ]; then
  echo "  ✗ 没有 /etc/nginx/sites-enabled —— 你的 Nginx 目录结构不同。"
  exit 1
fi
echo "  ✓ Nginx 目录结构符合预期"

# 要覆盖的域名：默认 www.<domain> 与 <domain>（去重）
if [ -z "$DOMAINS" ]; then
  bare="${DOMAIN#www.}"
  DOMAINS="$DOMAIN $bare"
  if [ "$DOMAIN" != "www.$bare" ]; then DOMAINS="$DOMAINS www.$bare"; fi
fi
# shellcheck disable=SC2086
DOMAINS="$(printf '%s\n' $DOMAINS | awk '!seen[$0]++' | tr '\n' ' ' | sed 's/ *$//')"
echo "  ✓ 要覆盖的域名：$DOMAINS"
echo ""

# ---- 1. 证书与私钥是否配对（不配对 nginx 根本起不来）----
echo "② 校验证书与私钥是否配对"
CERT_MOD="$(openssl x509 -noout -modulus -in "$CERT_SRC" 2>/dev/null | openssl md5 || true)"
KEY_MOD="$(openssl rsa -noout -modulus -in "$KEY_SRC" 2>/dev/null | openssl md5 || true)"
if [ -z "$CERT_MOD" ] || [ "$CERT_MOD" = "d41d8cd98f00b204e9800998ecf8427e" ]; then
  echo "  ✗ 无法从 $CERT_SRC 读出公钥模数 —— 它真的是 PEM 格式的证书吗？"
  echo "    看一下开头：head -1 \"$CERT_SRC\"  应为 -----BEGIN CERTIFICATE-----"
  exit 1
fi
if [ -z "$KEY_MOD" ] || [ "$KEY_MOD" = "d41d8cd98f00b204e9800998ecf8427e" ]; then
  echo "  ✗ 无法从 $KEY_SRC 读出私钥模数 —— 它真的是 PEM 格式的私钥吗？"
  echo "    看一下开头：head -1 \"$KEY_SRC\"  应为 -----BEGIN PRIVATE KEY----- 或 RSA PRIVATE KEY"
  exit 1
fi
if [ "$CERT_MOD" != "$KEY_MOD" ]; then
  echo "  ✗ 证书与私钥**不配对**！"
  echo "    证书模数：$CERT_MOD"
  echo "    私钥模数：$KEY_MOD"
  echo "    请确认这两个文件是同一套。若不配对，nginx 会启动失败。"
  exit 1
fi
echo "  ✓ 配对（模数一致：$CERT_MOD）"

# 证书链完整性：只有 1 段说明可能缺中间证书
CHAIN_COUNT="$(grep -c 'BEGIN CERTIFICATE' "$CERT_SRC" || true)"
if [ "$CHAIN_COUNT" -ge 2 ]; then
  echo "  ✓ 证书链含 $CHAIN_COUNT 段（叶子 + 中间证书）"
else
  echo "  ⚠️ 证书文件里只有 1 段证书 —— 可能**缺少中间证书**。"
  echo "     多数情况仍能工作（浏览器会自行补链），但部分客户端/旧安卓会报链不完整。"
  echo "     阿里云下载的 nginx 版 .pem 正常应含 2 段；若确实只有 1 段，"
  echo "     可把中间证书（通常叫 chain.crt / ca.crt）追加到 .pem 末尾。"
fi
echo ""

# ---- 2. 证书是否覆盖所有要用的域名 ----
echo "③ 校验证书覆盖的域名"
SAN="$(openssl x509 -noout -ext subjectAltName -in "$CERT_SRC" 2>/dev/null || true)"
if [ -z "$SAN" ]; then
  # 老版本 openssl 不支持 -ext，退回 -text 里抓
  SAN="$(openssl x509 -noout -text -in "$CERT_SRC" 2>/dev/null | grep -A1 'Subject Alternative Name' || true)"
fi
echo "  证书声明的域名："
printf '%s\n' "$SAN" | sed 's/^[[:space:]]*/    /' | grep -v '^[[:space:]]*$' || echo "    （读不到）"
MISSING=""
for d in $DOMAINS; do
  if printf '%s' "$SAN" | grep -q "DNS:$d\b"; then
    echo "  ✓ 覆盖 $d"
  else
    echo "  ✗ **不覆盖** $d"
    MISSING="$MISSING $d"
  fi
done
if [ -n "$MISSING" ]; then
  echo ""
  echo "  ✗ 证书没有覆盖：$MISSING"
  echo "    用这些域名访问 https 会报证书错误（浏览器拦停）。"
  echo "    两种选择："
  echo "      a) 换成覆盖全部域名的证书（阿里云可申请含 www 与不带 www 的）"
  echo "      b) 只保留证书覆盖的域名：加 --domains 参数，例如"
  echo "         --domains $DOMAIN"
  echo "    注意：若证书不含某个域名，**千万不要**把那个域名 301 跳到 https。"
  exit 1
fi
echo ""
echo "  ⚠️ 同时确认一下有效期："
openssl x509 -noout -dates -in "$CERT_SRC" 2>/dev/null | sed 's/^/    /' || true
echo ""

# ---- 3. 443 端口有没有被占用 ----
echo "④ 检查 443 端口占用"
if command -v ss >/dev/null 2>&1; then
  OCC="$(ss -tlnp 2>/dev/null | grep ':443 ' || true)"
else
  OCC="$(netstat -tlnp 2>/dev/null | grep ':443 ' || true)"
fi
if [ -n "$OCC" ]; then
  if printf '%s' "$OCC" | grep -q nginx; then
    echo "  ✓ 443 已被 nginx 自己占用（说明已有 https 配置，请注意别冲突）"
    printf '%s\n' "$OCC" | sed 's/^/    /'
  else
    echo "  ✗ 443 被其它程序占用："
    printf '%s\n' "$OCC" | sed 's/^/    /'
    echo "    请先处理它，否则 nginx 起不来。"
    exit 1
  fi
else
  echo "  ✓ 443 空闲"
fi
echo ""

# ---- 4. 安装证书 ----
if [ "$DO_COPY" = "1" ]; then
  echo "⑤ 安装证书到 $SSL_DIR（--no-copy 可跳过）"
  run mkdir -p "$SSL_DIR"
  run chmod 700 "$SSL_DIR"
  run cp "$CERT_SRC" "$SSL_DIR/$LINK_NAME.pem"
  run cp "$KEY_SRC" "$SSL_DIR/$LINK_NAME.key"
  run chmod 644 "$SSL_DIR/$LINK_NAME.pem"
  # 私钥 600：nginx 的 master 以 root 启动、能读；worker 不需要读
  run chmod 600 "$SSL_DIR/$LINK_NAME.key"
  FINAL_CERT="$SSL_DIR/$LINK_NAME.pem"
  FINAL_KEY="$SSL_DIR/$LINK_NAME.key"
  echo "  ✓ 已安装（私钥权限 600）"
  echo "  ✓ 原文件未改动，仍在原处"
else
  echo "⑤ 跳过拷贝，直接引用原路径"
  FINAL_CERT="$CERT_SRC"
  FINAL_KEY="$KEY_SRC"
fi
echo ""

# ---- 5. 生成 443 配置 ----
echo "⑥ 生成 443 配置并软链"
TMP_CONF="$(mktemp)"
cat > "$TMP_CONF" <<CONF
# lankHub HTTPS（由 scripts/https/enable.sh 生成）
#
# ⚠️ 这是**第一步**的配置：只加 443，**没有任何 80→443 跳转**。
# 确认 https 可用之后，再执行 scripts/https/enable-redirect.sh 添加跳转。
# 原因：上一次维护模式把整站打挂，就是「跳到了一个没人监听的端口」。
# 分两步走的话，万一 https 不通，80 仍然可用，你不会被锁在外面。
#
# 这个文件是生成物，改动它请改 scripts/https/enable.sh 里的模板。

server {
    # HTTP/2 用**老写法**（写在 listen 里）。
    # 不要用独立的 http2 on; —— 那是 nginx 1.25.1 才引入的，
    # 线上是 1.24.0，会报 unknown directive 并让 nginx -t 失败。
    # 老写法 1.9.5+ 与 1.25.1+ 都支持；1.30 上只给一条 deprecation 警告。
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    server_name $DOMAINS;

    ssl_certificate     $FINAL_CERT;
    ssl_certificate_key $FINAL_KEY;

    # 只留 TLSv1.2 / 1.3。nginx.conf 里那份全局配置还开着 TLSv1 与 1.1，
    # 那两个协议已经不安全，这里覆盖掉。
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    ssl_prefer_server_ciphers off;

    # 会话缓存：减少重复握手
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ⚠️ 这里**故意没有** Strict-Transport-Security（HSTS）。
    # HSTS 会让浏览器在有效期内**强制**只用 https 访问，一旦你之后想退回 http
    # 或者证书出问题，访客会被硬锁在外面、且你无法远程解除。
    # 等 https 稳定运行一段时间、并且你确认不再需要 http 之后，再考虑加：
    #   add_header Strict-Transport-Security "max-age=31536000" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        # 这一行在 https 下**必须有**：让应用知道访客走的是 https。
        # 否则 Next.js / Auth.js 可能生成 http 的回调地址，导致登录后跳回 http。
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
CONF

run cp "$TMP_CONF" "$CONF_FILE"
rm -f "$TMP_CONF"
echo "  ✓ 已写入 $CONF_FILE"

# 若已存在旧的软链（别的名字），先提示
if [ -e "$LINK" ] || [ -L "$LINK" ]; then
  echo "  ⚠️ $LINK 已存在，将被覆盖"
  run rm -f "$LINK"
fi
run ln -s "$CONF_FILE" "$LINK"
echo "  ✓ $LINK -> $CONF_FILE"
echo ""

# ---- 6. 语法检查：硬门槛 ----
echo "⑦ 语法检查（不过就不 reload）"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] nginx -t"
else
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ 语法检查失败 —— **没有 reload**，站点未受影响。"
    echo "    正在回滚刚才的改动..."
    rm -f "$LINK"
    rm -f "$CONF_FILE"
    echo "  ✓ 已回滚（HTTPS 未启用，80 仍然可用）"
    exit 1
  fi
  echo "  ✓ 语法检查通过"
fi
echo ""

# ---- 7. reload ----
echo "⑧ 重新加载 Nginx"
run systemctl reload nginx
echo "  ✓ 已 reload"
echo ""

# ---- 8. 自检 ----
echo "⑨ 自检"
if [ "$DRY_RUN" = "0" ]; then
  sleep 1
  FIRST_DOMAIN="$(printf '%s' "$DOMAINS" | awk '{print $1}')"
  CODE="$(curl -s -k -o /dev/null -w '%{http_code}' "https://127.0.0.1/" -H "Host: $FIRST_DOMAIN" --resolve "$FIRST_DOMAIN:443:127.0.0.1" 2>/dev/null || echo 000)"
  VER="$(curl -s -k -o /dev/null -w '%{http_version}' "https://127.0.0.1/" -H "Host: $FIRST_DOMAIN" --resolve "$FIRST_DOMAIN:443:127.0.0.1" 2>/dev/null || echo '?')"
  echo "  本机 https 自检（Host: $FIRST_DOMAIN）→ HTTP $CODE，协商版本 $VER"
  case "$CODE" in
    200|301|302) echo "  ✓ 本机 https 有响应" ;;
    502) echo "  ⚠️ 502 —— https 通了，但后端 Node 没响应。检查：pm2 status" ;;
    000) echo "  ⚠️ 本机自检拿不到结果（server_name 或 IPv6 差异，不一定是问题）" ;;
    *)   echo "  ⚠️ 返回 $CODE" ;;
  esac
  echo ""
  echo "  从**外网**验证（这一步才是关键，本机通不代表外网通）："
  echo "    curl -I https://$FIRST_DOMAIN/"
  echo "    或直接在浏览器打开 https://$FIRST_DOMAIN/"
fi
echo ""
echo "==========================================="
echo "  ✅ HTTPS 已启用（**80 未跳转，仍然可用**）"
echo "==========================================="
echo ""
echo "请先确认："
echo "  1. 浏览器打开 https://$DOMAIN/ 正常、且是「安全」状态（没有证书警告）"
echo "  2. 浏览器打开 http://$DOMAIN/ 仍然正常（这一步不该受影响）"
echo "  3. 顺手验证登录功能（X-Forwarded-Proto 已配，登录后不该跳回 http）"
echo ""
echo "两件都要确认没问题之后，再加 80→443 的跳转："
echo "  sudo bash scripts/https/enable-redirect.sh"
echo ""
echo "要回退（回到只有 http）："
echo "  sudo bash scripts/https/disable.sh"
echo ""
