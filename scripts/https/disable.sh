#!/usr/bin/env bash
# ============================================
# 回退：关闭 HTTPS，回到只有 http 的状态
#
# 用法（在**服务器**上执行）：
#   sudo bash scripts/https/disable.sh
#   sudo bash scripts/https/disable.sh --dry-run
#   sudo bash scripts/https/disable.sh --purge     # 连证书副本一起删
#
# ⚠️ 它会把 80→443 的跳转一起撤掉。
# 顺序很重要：**先撤跳转、再删 443 配置** —— 反过来会出现
# 「80 跳向一个已经不存在的 443」= 整站不可访问（这正是维护模式那次的教训）。
#
# 本脚本故意**不删** /etc/nginx/cert 下你自己的证书文件。
# ============================================
set -euo pipefail

LINK_NAME="zz-lankhub-https"
LINK="/etc/nginx/sites-enabled/$LINK_NAME"
CONF_FILE="/etc/nginx/sites-available/$LINK_NAME.conf"
SSL_DIR="/etc/nginx/ssl"
DOMAIN="www.lankhub.xyz"
REDIRECT_FILE="/etc/nginx/sites-enabled/lankhub.xyz"

DO_PURGE=0
DRY_RUN=0
# ⚠️ 备份**绝不能**放进 sites-enabled —— nginx 会 `include sites-enabled/*`，
# 备份里的 server 块也会被加载，造成重复 server_name。统一放这里。
BACKUP_DIR="/etc/nginx/lankhub-backups"
BEGIN_MARK="# >>> lankhub https redirect (managed by scripts/https/enable-redirect.sh) >>>"
END_MARK="# <<< lankhub https redirect <<<"

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --file) REDIRECT_FILE="${2:-}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --purge) DO_PURGE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "✗ 未知参数：$1"; exit 2 ;;
  esac
done

# 剥掉我们的标记片段。
# ⚠️ 用 range 模式而不是要求行首匹配 —— 标记是缩进的，行首匹配永远匹配不上。
strip_fragment() {
  awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
    index($0,b) { skip=1; next }
    index($0,e) { skip=0; next }
    !skip { print }
  ' "$1"
}

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "    [dry-run] $*"; else "$@"; fi
}

echo "==========================================="
echo "  关闭 HTTPS（回到只有 http）"
[ "$DRY_RUN" = "1" ] && echo "  （dry-run：不会修改任何东西）"
echo "==========================================="
echo ""

echo "① 前置检查"
if [ "$DRY_RUN" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "  ✗ 需要 root 权限。请用 sudo 运行。"
  exit 1
fi
echo "  ✓ 权限"
if [ ! -e "$LINK" ]; then
  echo "  ⚠️  HTTPS 配置本来就不存在（$LINK）——可能已经关过了。"
  echo "     若站点 https 仍可用，说明配置在别处。"
  echo "     下面仍会尝试撤销 80→443 跳转（如果有）。"
  LINK_EXISTS=0
else
  LINK_EXISTS=1
  echo "  ✓ 找到 $LINK"
fi
echo ""

# ---- 1. 先撤跳转（顺序关键）----
echo "② 先撤销 80→443 跳转（必须在删 443 之前）"
if [ -f "$REDIRECT_FILE" ] && grep -qF "$BEGIN_MARK" "$REDIRECT_FILE"; then
  run mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/$(basename "$REDIRECT_FILE").$(date +%Y%m%d%H%M%S).bak"
  run cp -a "$REDIRECT_FILE" "$BACKUP"
  echo "  ✓ 已备份到 $BACKUP（放在 $BACKUP_DIR，不在 sites-enabled 里）"
  if [ "$DRY_RUN" = "0" ]; then
    strip_fragment "$REDIRECT_FILE" > "$REDIRECT_FILE.tmp.$$"
    mv "$REDIRECT_FILE.tmp.$$" "$REDIRECT_FILE"
  fi
  echo "  ✓ 已移除跳转片段"
else
  echo "  （没有跳转片段，跳过）"
fi
echo ""

# ---- 2. 再删 443 配置 ----
echo "③ 删除 443 配置"
if [ "$LINK_EXISTS" = "1" ]; then
  run rm -f "$LINK"
  echo "  ✓ 已删除软链 $LINK"
fi
if [ -f "$CONF_FILE" ]; then
  run rm -f "$CONF_FILE"
  echo "  ✓ 已删除 $CONF_FILE"
fi
echo ""

# ---- 3. 语法检查 ----
echo "④ 语法检查（不过就不 reload）"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] nginx -t"
else
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ 语法检查失败 —— **没有 reload**，Nginx 仍在用旧配置。"
    echo "    请手动排查：nginx -t"
    exit 1
  fi
  echo "  ✓ 语法检查通过"
fi
echo ""

echo "⑤ 重新加载 Nginx"
run systemctl reload nginx
echo "  ✓ 已 reload"
echo ""

if [ "$DO_PURGE" = "1" ]; then
  echo "⑥ 清理证书副本（--purge）"
  run rm -f "$SSL_DIR/$LINK_NAME.pem" "$SSL_DIR/$LINK_NAME.key"
  echo "  ✓ 已删除 $SSL_DIR/$LINK_NAME.*"
  echo "  （你自己放在 /etc/nginx/cert 下的原证书未动）"
  echo ""
fi

echo "⑦ 自检"
if [ "$DRY_RUN" = "0" ]; then
  sleep 1
  FIRST="$(printf '%s' "$DOMAIN" | awk '{print $1}')"
  H="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/" -H "Host: $FIRST" 2>/dev/null || echo 000)"
  echo "  http://$FIRST → HTTP $H"
  case "$H" in
    000) echo "  ⚠️ 拿不到结果（可能是 server_name 或 IPv6 差异）" ;;
    301|308) echo "  ⚠️ 仍在跳转 —— 跳转片段可能没删干净，检查 $REDIRECT_FILE" ;;
    *) echo "  ✓ http 正常服务（不再跳转）" ;;
  esac
fi
echo ""
echo "==========================================="
echo "  ✅ 已回到只有 http 的状态"
echo "==========================================="
echo ""
echo "请用浏览器访问 http://$DOMAIN/ 确认正常。"
echo "注意：证书副本与 /etc/nginx/ssl 目录默认保留，要一并清掉加 --purge。"
echo ""
