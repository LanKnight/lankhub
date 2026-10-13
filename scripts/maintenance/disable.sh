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

# ⚠️ 维护软链可能是**两个名字之一**，两个都必须删。
#
# 为什么会有两个：软链名 = 源文件名，历史上源文件叫过 lankhub-maintenance.conf。
# 只要环境里残留过另一个名字，就可能出现两个软链同时存在，
# 而只删一个 → **关了维护但仍显示维护页**（真实踩过，站长就是这么撞上的）。
LINK_DIR="/etc/nginx/sites-enabled"
LINKS=("$LINK_DIR/lankhub-maintenance" "$LINK_DIR/lankhub-maintenance.conf")
WEB_ROOT="/var/www/lankhub-maintenance"

any_link_exists() {
  for l in "${LINKS[@]}"; do
    if [ -e "$l" ] || [ -L "$l" ]; then return 0; fi
  done
  return 1
}

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
if ! any_link_exists; then
  echo "  ⚠️  维护模式**本来就没开启**（sites-enabled 里没有维护软链）。"
  echo "    已检查这两个名字："
  for l in "${LINKS[@]}"; do echo "      $l"; done
  echo "    如果你的站点仍然显示维护页，请检查别处是否也配了 503，"
  echo "    或者在浏览器里强制刷新（维护页带 Cache-Control: no-store，一般不需要）。"
  exit 0
fi
echo "  ✓ 维护模式当前是开启状态"
echo ""

echo "② 删除软链（两个命名都检查）"
LINK_COUNT=0
for l in "${LINKS[@]}"; do
  if [ -e "$l" ] || [ -L "$l" ]; then
    run rm -f "$l"
    echo "  ✓ 已删除 $l"
    LINK_COUNT=$((LINK_COUNT + 1))
  fi
done
[ "$LINK_COUNT" -gt 1 ] && echo "  （删除了 $LINK_COUNT 个 —— 之前存在重复软链，已一并清理）"
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
  # 走 Nginx 再确认一次：现在应该不再是 503
  NGX=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ 2>/dev/null || echo "000")
  case "$NGX" in
    503) echo "  ⚠️  走 Nginx 仍是 503 —— 可能还有别处的维护配置残留，检查：sudo ls -l /etc/nginx/sites-enabled/" ;;
    000) echo "  ?   走 Nginx 拿不到结果（不影响，可在浏览器确认）" ;;
    *)   echo "  ✓ 走 Nginx 已恢复正常（HTTP $NGX）" ;;
  esac
fi
echo ""
echo "==========================================="
echo "  ✅ 维护模式已关闭"
echo "==========================================="
echo ""
echo "现在用浏览器访问你的站点确认已恢复正常（http://www.lankhub.xyz/）。"
echo ""
