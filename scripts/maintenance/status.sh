#!/usr/bin/env bash
# ============================================
# 查看维护模式当前状态
#
# 用法（服务器上）：
#   bash scripts/maintenance/status.sh      # 不需要 sudo
#
# 只读，不改任何东西。
# ============================================
set -uo pipefail

LINK="/etc/nginx/sites-enabled/lankhub-maintenance"
WEB_ROOT="/var/www/lankhub-maintenance"
LOG="/var/log/nginx/lankhub-maintenance.log"

echo "==========================================="
echo "  lankHub 维护模式 —— 状态"
echo "==========================================="
echo ""

if [ -L "$LINK" ]; then
  echo "状态：🔴 维护模式【已开启】"
  echo "  $LINK -> $(readlink "$LINK")"
elif [ -e "$LINK" ]; then
  echo "状态：🔴 维护模式【已开启】（但不是软链，是普通文件）"
  echo "  $LINK"
else
  echo "状态：🟢 维护模式【未开启】（站点应正常访问）"
fi
echo ""

echo "维护页文件："
if [ -f "$WEB_ROOT/__maintenance.html" ]; then
  echo "  ✓ $WEB_ROOT/__maintenance.html  ($(du -h "$WEB_ROOT/__maintenance.html" | cut -f1))"
else
  echo "  ✗ 不存在（开启时会自动安装）"
fi
echo ""

echo "Nginx 配置语法："
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    echo "  ✓ 通过"
  else
    echo "  ✗ 不通过 —— 执行 nginx -t 看详情，**先别 reload**"
  fi
else
  echo "  （本机没有 nginx 命令）"
fi
echo ""

echo "应用本身（绕过 Nginx 直接打 Node）："
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/ 2>/dev/null || echo "000")
if [ "$CODE" = "000" ]; then
  echo "  ✗ 没有响应 —— 应用可能没跑起来。试 pm2 status"
else
  echo "  ✓ 有响应（HTTP $CODE）"
fi
echo ""

echo "外部访问（走 Nginx）："
EXT=$(curl -s -k -o /dev/null -w '%{http_code}' --max-time 5 https://127.0.0.1/ -H 'Host: www.lankhub.xyz' 2>/dev/null || echo "000")
case "$EXT" in
  503) echo "  🔴 503 —— 维护页正在生效" ;;
  000) echo "  ?  本机自检拿不到结果（server_name 不匹配时会这样，正常）" ;;
  *)   echo "  🟢 HTTP $EXT —— 站点正常服务" ;;
esac
echo ""

if [ -f "$LOG" ]; then
  echo "维护期间最后 5 条访问记录："
  tail -5 "$LOG" | sed 's/^/  /'
  echo ""
fi

echo "开启：sudo bash scripts/maintenance/enable.sh"
echo "关闭：sudo bash scripts/maintenance/disable.sh"
echo ""
