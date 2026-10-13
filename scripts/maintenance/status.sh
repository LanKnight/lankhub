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

# ⚠️ 维护软链可能是两个名字之一（软链名 = 源文件名），两个都要检查。
# 只检查一个的话，遇到另一种命名会误报「未开启」。
LINK_DIR="/etc/nginx/sites-enabled"
LINKS=("$LINK_DIR/lankhub-maintenance" "$LINK_DIR/lankhub-maintenance.conf")
WEB_ROOT="/var/www/lankhub-maintenance"
LOG="/var/log/nginx/lankhub-maintenance.log"

echo "==========================================="
echo "  lankHub 维护模式 —— 状态"
echo "==========================================="
echo ""

FOUND=0
for l in "${LINKS[@]}"; do
  if [ -e "$l" ] || [ -L "$l" ]; then
    FOUND=$((FOUND + 1))
    if [ -L "$l" ]; then
      echo "状态：🔴 维护模式【已开启】"
      echo "  $l -> $(readlink "$l")"
    else
      echo "状态：🔴 维护模式【已开启】（不是软链，是普通文件）"
      echo "  $l"
    fi
  fi
done
if [ "$FOUND" = "0" ]; then
  echo "状态：🟢 维护模式【未开启】（站点应正常访问）"
elif [ "$FOUND" -gt 1 ]; then
  echo ""
  echo "⚠️  发现 $FOUND 个维护软链 —— Nginx 会加载**重复的 server 块**（域名重复定义）。"
  echo "    请执行关闭脚本，它会把两个都删掉：sudo npm run maintenance:off"
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

echo "外部访问（走 Nginx，用域名做 Host）："
# ⚠️ 这里必须是 http:// 而不是 https:// —— 本站是 HTTP-only，
# 用 https 探测会拿不到结果（443 根本没人监听），从而误报。
EXT=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/ -H 'Host: www.lankhub.xyz' 2>/dev/null || echo "000")
case "$EXT" in
  503) echo "  🔴 503 —— 维护页正在生效" ;;
  502) echo "  🔴 502 —— 维护页生效了，但后端 Node 没响应，检查 pm2 status" ;;
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
