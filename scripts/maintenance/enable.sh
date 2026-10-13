#!/usr/bin/env bash
# ============================================
# 开启站点维护模式（所有人访问都只看到维护页）
#
# 用法（在**服务器**上执行）：
#   sudo bash scripts/maintenance/enable.sh
#   sudo bash scripts/maintenance/enable.sh --dry-run    # 只看会做什么，不改任何东西
#
# 原理：往 /etc/nginx/sites-enabled 放一个**独立**的 server 配置软链，再 reload Nginx。
# 不去改动 sites-available/lankhub —— 那份被 certbot 改过（443 + 证书段），
# 脚本动它风险很大。独立文件的好处是「开关 = 建/删一个软链」。
#
# 为什么走 Nginx 而不是应用层：挨打时 Node 很可能已经上不来气，
# 那时**只有 Nginx 还能响应**。而且维护页是静态文件，几乎不吃 CPU，
# 攻击流量在 Nginx 这一层就被挡住了，根本落不到应用上。
# ============================================
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/../.." && pwd)"
MAINT_DIR="$REPO_ROOT/maintenance"

CONF_SRC="$MAINT_DIR/lankhub-maintenance.conf"
PAGE_SRC="$MAINT_DIR/__maintenance.html"
WEB_ROOT="/var/www/lankhub-maintenance"
LOG="/var/log/nginx/lankhub-maintenance.log"

# ⚠️ 维护配置在 sites-enabled 里可能是**两个名字之一**，两个都必须处理。
#
# 为什么会有两个：软链名 = 源文件名。历史上源文件叫过 lankhub-maintenance.conf，
# 现在叫 lankhub-maintenance —— 一旦环境里残留过另一个名字，就会出现
# **两个软链同时存在**，于是 Nginx 加载两份相同的 server 块（域名重复定义），
# 而关闭脚本只删其中一个 → **关了维护但仍显示维护页**（真实踩过）。
LINK_DIR="/etc/nginx/sites-enabled"
LINK_A="$LINK_DIR/lankhub-maintenance"
LINK_B="$LINK_DIR/lankhub-maintenance.conf"
LINKS=("$LINK_A" "$LINK_B")

# 删掉所有维护软链（不存在的静默跳过），并报告删了哪些
remove_all_links() {
  local removed=0
  for l in "${LINKS[@]}"; do
    if [ -e "$l" ] || [ -L "$l" ]; then
      if [ "$DRY_RUN" = "1" ]; then
        echo "    [dry-run] rm -f $l"
      else
        rm -f "$l"
      fi
      echo "  已删除 $l"
      removed=1
    fi
  done
  return 0
}

# 任一个软链存在即视为「维护模式已开启」
link_exists() {
  for l in "${LINKS[@]}"; do
    if [ -e "$l" ] || [ -L "$l" ]; then return 0; fi
  done
  return 1
}

DRY_RUN=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "✗ 未知参数：$a（可用：--dry-run）"; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then
    echo "    [dry-run] $*"
  else
    "$@"
  fi
}

echo "==========================================="
echo "  lankHub 维护模式 —— 开启"
[ "$DRY_RUN" = "1" ] && echo "  （dry-run：不会修改任何东西）"
echo "==========================================="
echo ""

# ---- 1. 前置检查 ----
echo "① 前置检查"
if [ "$DRY_RUN" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "  ✗ 需要 root 权限（要写 /etc/nginx 与 /var/www）。请用 sudo 运行。"
  exit 1
fi
echo "  ✓ 权限"

# 允许从仓库根或 scripts/maintenance 下运行，两种情况都能找到
#
# 生成物不入库（见 .gitignore），所以新克隆的仓库里没有它们。
# 这里自动补生成一次，避免「第一次用维护模式就必须记得先跑 build」这种坑；
# 顺带也修好「换了电脑/重新克隆后配置不在」的情况。
if [ ! -f "$CONF_SRC" ] || [ ! -f "$PAGE_SRC" ]; then
  echo "  生成物不在，正在自动生成（node maintenance/build.mjs）..."
  if [ ! -f "$REPO_ROOT/maintenance/build.mjs" ]; then
    echo "  ✗ 找不到 $REPO_ROOT/maintenance/build.mjs —— 仓库不完整？"
    exit 1
  fi
  if ! (cd "$REPO_ROOT" && node maintenance/build.mjs); then
    echo "  ✗ 生成失败。请手动执行并看报错：cd $REPO_ROOT && node maintenance/build.mjs"
    exit 1
  fi
  echo ""
fi
if [ ! -f "$CONF_SRC" ]; then
  echo "  ✗ 仍然找不到 $CONF_SRC"
  exit 1
fi
if [ ! -f "$PAGE_SRC" ]; then
  echo "  ✗ 仍然找不到 $PAGE_SRC"
  exit 1
fi
echo "  ✓ 维护配置与维护页都在"

if [ ! -d /etc/nginx/sites-enabled ]; then
  echo "  ✗ 没有 /etc/nginx/sites-enabled —— 你的 Nginx 目录结构不同，"
  echo "    请手动把这个配置放进你自己的 conf.d 并 reload。"
  exit 1
fi
echo "  ✓ Nginx 目录结构符合预期"

# 域名从配置里取，避免脚本里再硬编码一份（两处写域名迟早不一致）
DOMAIN=$(grep -m1 -oP '^\s*server_name\s+\K[^;]+' "$CONF_SRC" 2>/dev/null | awk '{print $1}' || true)
echo "  ✓ 域名：${DOMAIN:-（未识别）}"

LOG=$(grep -m1 -oP '^\s*access_log\s+\K\S+' "$CONF_SRC" 2>/dev/null | tr -d ';' || true)

if link_exists; then
  echo ""
  echo "⚠️  维护模式**已经是开启状态**，不重复操作。"
  echo "    当前存在的维护软链："
  for l in "${LINKS[@]}"; do
    if [ -e "$l" ] || [ -L "$l" ]; then echo "      $l"; fi
  done
  echo ""
  echo "    如果站点表现不对（比如关了维护还显示维护页），说明可能**两个命名同时残留**，"
  echo "    请先执行关闭脚本 —— 它会把两个名字都删掉："
  echo "      sudo npm run maintenance:off"
  exit 0
fi
echo "  ✓ 当前未处于维护模式"
echo ""

# ---- 2. 安装维护页 ----
echo "② 安装维护页到 $WEB_ROOT"
run mkdir -p "$WEB_ROOT"
run cp "$PAGE_SRC" "$WEB_ROOT/__maintenance.html"
run chmod 644 "$WEB_ROOT/__maintenance.html"
# 755：Nginx 需要能穿透目录读到文件
run chmod 755 "$WEB_ROOT"
echo "  ✓ 已安装（$(du -h "$PAGE_SRC" | cut -f1)）"
echo ""

# ---- 3. 建软链 ----
# 软链名与源文件同名（lankhub-maintenance.conf），
# 这正是历史上出现「两种命名」的原因；related 的两个名字都在 LINKS 里统一处理。
echo "③ 启用维护配置（软链到 sites-enabled）"
run ln -s "$CONF_SRC" "$LINK_A"
echo "  ✓ $LINK_A -> $CONF_SRC"
echo ""

# ---- 4. 语法检查：硬门槛 ----
echo "④ 语法检查（不过就不 reload）"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] nginx -t"
else
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ 语法检查失败 —— **没有 reload**，站点未受影响。"
    echo "    正在回滚刚才的改动..."
    remove_all_links >/dev/null || true
    rm -rf "$WEB_ROOT"
    echo "  ✓ 已回滚（维护模式未生效）"
    exit 1
  fi
  echo "  ✓ 语法检查通过"
fi
echo ""

# ---- 5. reload ----
echo "⑤ 重新加载 Nginx"
run systemctl reload nginx
echo "  ✓ 已 reload"
echo ""

# ---- 6. 自检 ----
echo "⑥ 自检"
if [ "$DRY_RUN" = "0" ]; then
  sleep 1
  # 用配置里的真实域名做 Host 头，否则 server_name 不匹配会走到别的 server 块
  CODE=$(curl -s -k -o /dev/null -w '%{http_code}' "https://127.0.0.1/" -H "Host: $DOMAIN" --resolve "$DOMAIN:443:127.0.0.1" 2>/dev/null || echo "000")
  if [ "$CODE" = "503" ]; then
    echo "  ✓ 本机 HTTPS 返回 503（维护页生效）"
  else
    echo "  ⚠️ 本机自检返回 $CODE（期望 503）。"
    echo "     可能是 DNS/IPv6 解析差异，请直接用 https://$DOMAIN/ 验证。"
  fi
fi
echo ""
echo "==========================================="
echo "  ✅ 维护模式已开启"
echo "==========================================="
echo ""
echo "现在所有人（包括你自己）访问都只看到维护页。"
echo ""
echo "要在服务器上验证真实站点是否正常（绕过 Nginx 直接打 Node）："
echo "  curl -I http://127.0.0.1:3000"
echo ""
echo "查看访问日志："
echo "  tail -f $LOG"
echo ""
echo "关闭维护模式："
echo "  sudo bash scripts/maintenance/disable.sh"
echo ""
