#!/usr/bin/env bash
# ============================================
# 关闭站点维护模式，恢复正常访问
#
# 用法（在**服务器**上执行）：
#   sudo bash scripts/maintenance/disable.sh
#   sudo bash scripts/maintenance/disable.sh --dry-run
#
# 做的事：删掉 sites-enabled 里的软链 → reload Nginx。
# 维护页文件默认保留在 /var/www（不碍事，下次开启还能少拷一次）；
# 要一并删掉加 --purge。
# ============================================
set -euo pipefail

LINK="/etc/nginx/sites-enabled/lankhub-maintenance"
WEB_ROOT="/var/www/lankhub-maintenance"

DRY_RUN=0
PURGE=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --purge) PURGE=1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "✗ 未知参数：$a（可用：--dry-run / --purge）"; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "    [dry-run] $*"; else "$@"; fi
}

echo "==========================================="
echo "  lankHub 维护模式 —— 关闭"
[ "$DRY_RUN" = "1" ] && echo "  （dry-run：不会修改任何东西）"
echo "==========================================="
echo ""

echo "① 前置检查"
if [ "$DRY_RUN" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "  ✗ 需要 root 权限。请用 sudo 运行。"
  exit 1
fi
if [ ! -e "$LINK" ]; then
  echo "  ⚠️  维护模式**本来就没开启**（$LINK 不存在）。"
  echo "    如果你的站点仍然显示维护页，请检查别处是否也配了 503，"
  echo "    或者在浏览器里强制刷新（维护页带 Cache-Control: no-store，一般不需要）。"
  exit 0
fi
echo "  ✓ 维护模式当前是开启状态"
echo ""

echo "② 删除软链"
run rm -f "$LINK"
echo "  ✓ 已删除 $LINK"
echo ""

echo "③ 语法检查（不过就不 reload）"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] nginx -t"
else
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ 语法检查失败 —— **没有 reload**。"
    echo "    维护配置已删除，但 Nginx 仍在用旧配置。请手动排查后再 reload。"
    exit 1
  fi
  echo "  ✓ 语法检查通过"
fi
echo ""

echo "④ 重新加载 Nginx"
run systemctl reload nginx
echo "  ✓ 已 reload"
echo ""

if [ "$PURGE" = "1" ]; then
  echo "⑤ 清理维护页文件（--purge）"
  run rm -rf "$WEB_ROOT"
  echo "  ✓ 已删除 $WEB_ROOT"
  echo ""
fi

echo "⑥ 自检"
if [ "$DRY_RUN" = "0" ]; then
  sleep 1
  CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null || echo "000")
  if [ "$CODE" = "000" ]; then
    echo "  ⚠️  应用（127.0.0.1:3000）没有响应。"
    echo "     维护模式已关，但应用本身没跑起来，访客会看到 502。"
    echo "     用 pm2 status 看一下，必要时 pm2 restart next-app"
  else
    echo "  ✓ 应用有响应（HTTP $CODE）"
  fi
fi
echo ""
echo "==========================================="
echo "  ✅ 维护模式已关闭"
echo "==========================================="
echo ""
echo "现在用浏览器访问 https://www.lankhub.xyz/ 确认已恢复正常。"
echo ""
