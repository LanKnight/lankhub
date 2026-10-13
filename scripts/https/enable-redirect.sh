#!/usr/bin/env bash
# ============================================
# 第二步：把 80 的请求 301 跳到 443
#
# 用法（在**服务器**上执行）：
#   sudo bash scripts/https/enable-redirect.sh
#   sudo bash scripts/https/enable-redirect.sh --dry-run
#   sudo bash scripts/https/enable-redirect.sh --undo      # 撤掉跳转，恢复纯 80
#
# ⚠️ 执行前请确认第 1 步已通过验证：
#   - https 能打开，且没有证书警告
#   - 证书覆盖了**所有**要跳转的域名（缺任何一个都会让那部分访客报证书错误）
#
# 实现方式：往**已有的 80 server 块**里插一个 `location / { return 301 ... }`，
# 而不是去新建一份 80 的配置 —— 避免与站点自己的 80 块重复定义 server_name。
#
# 插入的片段带固定标记注释，所以可重复执行（幂等）、也能精确撤销。
# 改动前会备份，nginx -t 不过就自动还原。
# ============================================
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SELF_DIR/../.." && pwd)"

DOMAIN="www.lankhub.xyz"
REDIRECT_FILE="/etc/nginx/sites-enabled/lankhub.xyz"
# HTTPS 的软链存在与否，用来判断第 1 步是否做过
HTTPS_LINK="/etc/nginx/sites-enabled/zz-lankhub-https"

# ⚠️⚠️ 备份**绝不能**放进 sites-enabled！
# nginx 的配置是 `include /etc/nginx/sites-enabled/*` —— 那个目录里**任何**文件
# 都会被当配置加载。备份文件里同样有 server 块，于是会出现**重复的 server_name**，
# nginx 只用先加载的那个，行为变得不可预测。
# 所以备份统一放这里。
BACKUP_DIR="/etc/nginx/lankhub-backups"

BEGIN_MARK="# >>> lankhub https redirect (managed by scripts/https/enable-redirect.sh) >>>"
END_MARK="# <<< lankhub https redirect <<<"

DRY_RUN=0
UNDO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --file) REDIRECT_FILE="${2:-}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --undo) UNDO=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "✗ 未知参数：$1"; exit 2 ;;
  esac
done

# 把我们的标记片段（含前后导出的缩进）整段剥掉。
# ⚠️ 用 range 模式而不是 `index($0,mark)==1` —— 标记是**缩进**的，
# 要求行首匹配永远匹配不上，剥离就会静默失败、导致重复插入。
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
if [ "$UNDO" = "1" ]; then
  echo "  撤掉 80→443 跳转"
else
  echo "  第二步：80 → 443 跳转"
fi
[ "$DRY_RUN" = "1" ] && echo "  （dry-run：不会修改任何东西）"
echo "==========================================="
echo ""

echo "① 前置检查"
if [ "$DRY_RUN" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "  ✗ 需要 root 权限。请用 sudo 运行。"
  exit 1
fi
echo "  ✓ 权限"

if [ ! -f "$REDIRECT_FILE" ]; then
  echo "  ✗ 找不到站点配置：$REDIRECT_FILE"
  echo "    用 --file 指定你的 80 配置文件（例如 /etc/nginx/sites-enabled/lankhub.xyz）"
  exit 1
fi
echo "  ✓ 站点配置：$REDIRECT_FILE"

if [ "$UNDO" = "0" ] && [ ! -e "$HTTPS_LINK" ]; then
  echo ""
  echo "  ✗ **HTTPS 还没启用**（找不到 $HTTPS_LINK）。"
  echo "    先执行第一步并验证 https 可用，再来加跳转："
  echo "      sudo bash scripts/https/enable.sh --cert ... --key ..."
  echo ""
  echo "    这条检查就是为了防止「跳到一个还没跑起来的端口」——"
  echo "    上一次维护模式把整站打挂，根因正是这个。"
  exit 1
fi
[ "$UNDO" = "0" ] && echo "  ✓ HTTPS 配置已存在"
echo ""

# ---- 幂等判断 ----
HAS_MARK=0
grep -qF "$BEGIN_MARK" "$REDIRECT_FILE" && HAS_MARK=1

if [ "$UNDO" = "1" ]; then
  # ---------- 撤销 ----------
  if [ "$HAS_MARK" = "0" ]; then
    echo "② 配置里没有跳转片段，无需撤销（本来就没加过）"
    exit 0
  fi
  echo "② 删除跳转片段"
  run mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/$(basename "$REDIRECT_FILE").$(date +%Y%m%d%H%M%S).bak"
  run cp -a "$REDIRECT_FILE" "$BACKUP"
  echo "  ✓ 已备份到 $BACKUP"
  if [ "$DRY_RUN" = "0" ]; then
    strip_fragment "$REDIRECT_FILE" > "$REDIRECT_FILE.tmp.$$"
    mv "$REDIRECT_FILE.tmp.$$" "$REDIRECT_FILE"
  fi
  echo "  ✓ 已移除跳转片段"
else
  # ---------- 添加 ----------
  if [ "$HAS_MARK" = "1" ]; then
    echo "② 跳转片段**已经存在**，更新为新内容"
  else
    echo "② 插入跳转片段"
  fi

  run mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/$(basename "$REDIRECT_FILE").$(date +%Y%m%d%H%M%S).bak"
  run cp -a "$REDIRECT_FILE" "$BACKUP"
  echo "  ✓ 已备份到 $BACKUP（放在 $BACKUP_DIR，**不在** sites-enabled 里）"

  if [ "$DRY_RUN" = "0" ]; then
    # 先把已有片段整段剥掉（保证幂等），再在 80 那个 server 块的 location / 之前插入
    BASE="$(mktemp)"
    strip_fragment "$REDIRECT_FILE" > "$BASE"

    OUT="$(mktemp)"
    if ! awk -v domain="$DOMAIN" -v b="$BEGIN_MARK" -v e="$END_MARK" '
      { lines[NR]=$0 }
      END {
        done=0
        for (i=1;i<=NR;i++) {
          if (!done && lines[i] ~ /location[ \t]+\/[ \t]*\{/) {
            # 往前找最近的 listen 80，确认在同一个 server 块内
            is80=0
            for (j=i;j>=1;j--) {
              if (lines[j] ~ /^[ \t]*server[ \t]*\{/) break
              if (lines[j] ~ /listen[ \t]+(\[::\]:)?80/) { is80=1; break }
            }
            if (is80) {
              print "    " b
              print "    # 由 scripts/https/enable-redirect.sh 插入；撤销："
              print "    #   sudo bash scripts/https/enable-redirect.sh --undo"
              print "    location / { return 301 https://" domain "$request_uri; }"
              print "    " e
              done=1
            }
          }
          print lines[i]
        }
        if (!done) exit 3
      }
    ' "$BASE" > "$OUT"; then
      echo ""
      echo "  ✗ 没能在 $REDIRECT_FILE 里找到「listen 80 的 server 块 + location /」。"
      echo "    为避免改坏配置，**什么都没做**（原文件未改动）。"
      echo "    请手动加这一行到你的 80 server 块里，然后 reload："
      echo "      location / { return 301 https://$DOMAIN\$request_uri; }"
      rm -f "$BASE" "$OUT"
      exit 1
    fi
    mv "$OUT" "$REDIRECT_FILE"
    rm -f "$BASE"
  fi
  echo "  ✓ 已插入（跳转到 https://$DOMAIN）"
fi
echo ""

# ---- 语法检查：硬门槛 ----
STEP="③"
echo "$STEP 语法检查（不过就自动还原）"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] nginx -t"
else
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ 语法检查失败 —— **没有 reload**，正在自动还原..."
    cp -a "$BACKUP" "$REDIRECT_FILE"
    echo "  ✓ 已还原（站点配置回到改动前）"
    exit 1
  fi
  echo "  ✓ 语法检查通过"
fi
echo ""

echo "④ 重新加载 Nginx"
run systemctl reload nginx
echo "  ✓ 已 reload"
echo ""

echo "⑤ 自检"
if [ "$DRY_RUN" = "0" ]; then
  sleep 1
  FIRST="$(printf '%s' "$DOMAIN" | awk '{print $1}')"
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/" -H "Host: $FIRST" 2>/dev/null || echo 000)"
  LOC="$(curl -s -o /dev/null -D - "http://127.0.0.1/" -H "Host: $FIRST" 2>/dev/null | tr -d '\r' | grep -i '^location:' || true)"
  echo "  http://$FIRST → HTTP $CODE"
  echo "  $LOC"
  case "$CODE" in
    301|308) echo "  ✓ 已正确跳转" ;;
    000) echo "  ⚠️ 本机自检拿不到结果（不一定是问题）" ;;
    *) echo "  ⚠️ 返回 $CODE，期望 301" ;;
  esac
fi
echo ""
echo "==========================================="
if [ "$UNDO" = "1" ]; then
  echo "  ✅ 已撤掉跳转（http 仍可访问）"
else
  echo "  ✅ 80 → 443 跳转已启用"
fi
echo "==========================================="
echo ""
if [ "$UNDO" = "0" ]; then
  echo "现在 http 会自动跳到 https。请确认："
  echo "  1. 浏览器访问 http://$DOMAIN/ 会跳到 https 且正常打开"
  echo "  2. 若证书**不覆盖**某个域名，那个域名不该出现在跳转里，否则访客会报证书错误"
  echo "  3. 登录功能仍正常"
  echo ""
  echo "备份文件在 ${REDIRECT_FILE}.lankhub-bak.*，确认无误后可自行删除。"
else
  echo "现在 http 与 https 都能访问（不再跳转）。"
fi
echo ""
