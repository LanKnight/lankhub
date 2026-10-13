#!/usr/bin/env bash
# ============================================
# 第二步：把 80 的请求 301 跳到 443
#
# 用法（在**服务器**上执行）：
#   sudo bash scripts/https/enable-redirect.sh
#   sudo bash scripts/https/enable-redirect.sh --dry-run
#   sudo bash scripts/https/enable-redirect.sh --undo      # 恢复成原来的 80 配置
#
# ⚠️ 执行前请确认第 1 步已通过验证：
#   - https 能打开，且没有证书警告
#   - 证书覆盖了**所有**要跳转的域名（缺任何一个都会让那部分访客报证书错误）
#
# ⚠️ 实现方式是**替换** 80 server 块里原有的 location /，不是再加一个。
# nginx 不允许同一个 server 块里出现两个相同的 location：
#   [emerg] duplicate location "/"
# 所以必须把那个块整段换成 301。原块会存到 $STATE_DIR，
# 撤销时原样放回 —— 只删不改的话，站点会失去 proxy_pass 而 502。
#
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
# 都会被当配置加载。备份文件里同样有 server 块，于是会出现**重复的 server_name**。
BACKUP_DIR="/etc/nginx/lankhub-backups"
# 被替换掉的原 location / 块存这里，撤销时放回
STATE_DIR="/etc/nginx/lankhub-state"

BEGIN_MARK="# >>> lankhub https redirect (managed by scripts/https/enable-redirect.sh) >>>"
END_MARK="# <<< lankhub https redirect <<<"

DRY_RUN=0
UNDO=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --file) REDIRECT_FILE="${2:-}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:-}"; shift 2 ;;
    --state-dir) STATE_DIR="${2:-}"; shift 2 ;;
    --https-link) HTTPS_LINK="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --undo) UNDO=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "✗ 未知参数：$1"; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = "1" ]; then echo "    [dry-run] $*"; else "$@"; fi
}

# 把状态文件路径固定下来（按配置文件名区分，避免多站点互相覆盖）
STATE_FILE="$STATE_DIR/$(basename "$REDIRECT_FILE").redirect-state"

echo "==========================================="
if [ "$UNDO" = "1" ]; then
  echo "  恢复成原来的 80 配置（撤掉跳转）"
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
  echo "    用 --file 指定你的 80 配置文件"
  exit 1
fi
echo "  ✓ 站点配置：$REDIRECT_FILE"

if [ "$UNDO" = "0" ] && [ ! -e "$HTTPS_LINK" ]; then
  echo ""
  echo "  ✗ **HTTPS 还没启用**（找不到 $HTTPS_LINK）。"
  echo "    先执行第一步并验证 https 可用，再来加跳转："
  echo "      sudo npm run https:on -- --cert ... --key ..."
  echo ""
  echo "    这条检查就是为了防止「跳到一个还没跑起来的端口」——"
  echo "    上一个事故把整站打挂，根因正是这个。"
  exit 1
fi
[ "$UNDO" = "0" ] && echo "  ✓ HTTPS 配置已存在"
echo ""

HAS_MARK=0
grep -qF "$BEGIN_MARK" "$REDIRECT_FILE" && HAS_MARK=1

# ---------------------------------------------------------------
# 撤销
# ---------------------------------------------------------------
if [ "$UNDO" = "1" ]; then
  if [ "$HAS_MARK" = "0" ]; then
    echo "② 配置里没有跳转片段，无需撤销（本来就没加过）"
    exit 0
  fi

  echo "② 把原 location / 块放回去"
  run mkdir -p "$BACKUP_DIR"
  BACKUP="$BACKUP_DIR/$(basename "$REDIRECT_FILE").$(date +%Y%m%d%H%M%S).bak"
  run cp -a "$REDIRECT_FILE" "$BACKUP"
  echo "  ✓ 已备份到 $BACKUP"

  if [ ! -f "$STATE_FILE" ]; then
    echo ""
    echo "  ✗ 找不到状态文件 $STATE_FILE"
    echo "    没有它就无法把原来的 location / 块放回去 —— 只删跳转的话，"
    echo "    80 会失去 proxy_pass 而返回 502。"
    echo "    请手动从备份恢复：cp $BACKUP $REDIRECT_FILE"
    exit 1
  fi
  echo "  ✓ 找到原块状态文件：$STATE_FILE"

  if [ "$DRY_RUN" = "0" ]; then
    awk -v b="$BEGIN_MARK" -v e="$END_MARK" -v state="$STATE_FILE" '
      BEGIN {
        n=0
        while ((getline line < state) > 0) { saved[++n] = line }
        close(state)
      }
      index($0,b) { skip=1; for (k=1;k<=n;k++) print saved[k]; next }
      index($0,e) { skip=0; next }
      !skip { print }
    ' "$REDIRECT_FILE" > "$REDIRECT_FILE.tmp.$$"
    mv "$REDIRECT_FILE.tmp.$$" "$REDIRECT_FILE"
  fi
  echo "  ✓ 已恢复原来的 location / 块"
  rm -f "$STATE_FILE"

# ---------------------------------------------------------------
# 添加
# ---------------------------------------------------------------
else
  if [ "$HAS_MARK" = "1" ]; then
    echo "② 跳转片段已存在，将重新生成（幂等）"
  else
    echo "② 用 301 替换掉 80 块里的 location /"
  fi

  run mkdir -p "$BACKUP_DIR"
  run mkdir -p "$STATE_DIR"
  BACKUP="$BACKUP_DIR/$(basename "$REDIRECT_FILE").$(date +%Y%m%d%H%M%S).bak"
  run cp -a "$REDIRECT_FILE" "$BACKUP"
  echo "  ✓ 已备份到 $BACKUP（不在 sites-enabled 里）"

  if [ "$DRY_RUN" = "0" ]; then
    # 先把上次插入的片段整段剥掉（保证幂等）—— 用 range 模式，
    # 因为标记是缩进的，要求行首匹配会静默失败。
    BASE="$(mktemp)"
    awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
      index($0,b) { skip=1; next }
      index($0,e) { skip=0; next }
      !skip { print }
    ' "$REDIRECT_FILE" > "$BASE"

    OUT="$(mktemp)"

    # 1) 先把原有的 location / 块提取出来存好（撤销时要放回）
    #    括号配对用**去空白**后的花括号计数。
    awk -v state="$STATE_FILE" '
      function strip(s) { gsub(/[[:space:]]/, "", s); return s }
      {
        if (!collecting && $0 ~ /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/) {
          # 确认同一个 server 块里有 listen 80
          is80=0
          for (j=NR;j>=1;j--) {
            if (lines[j] ~ /^[[:space:]]*server[[:space:]]*\{/) break
            if (lines[j] ~ /listen[[:space:]]+(\[::\]:)?80/) { is80=1; break }
          }
          if (is80) { collecting=1; depth=0 }
        }
        if (collecting) {
          print > state
          depth += gsub(/\{/, "{") - gsub(/\}/, "}")
          if (depth==0) { collecting=0; found=1 }
        }
        lines[NR]=$0
      }
      END { if (!found) exit 3 }
    ' "$BASE" > /dev/null || {
      echo ""
      echo "  ✗ 没能在 $REDIRECT_FILE 里找到「listen 80 的 server 块 + location /」。"
      echo "    为避免改坏配置，**什么都没做**（原文件未改动）。"
      rm -f "$BASE" "$OUT"
      exit 1
    }
    echo "  ✓ 已保存原 location / 块到 $STATE_FILE"

    # 2) 用 301 替换掉那个块
    if ! awk -v domain="$DOMAIN" -v b="$BEGIN_MARK" -v e="$END_MARK" '
      {
        if (!done && $0 ~ /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/) {
          is80=0
          for (j=NR;j>=1;j--) {
            if (lines[j] ~ /^[[:space:]]*server[[:space:]]*\{/) break
            if (lines[j] ~ /listen[[:space:]]+(\[::\]:)?80/) { is80=1; break }
          }
          if (is80) { replacing=1; depth=0 }
        }
        if (replacing) {
          depth += gsub(/\{/, "{") - gsub(/\}/, "}")
          if (depth==0) {
            replacing=0; done=1
            print "    " b
            print "    # 由 scripts/https/enable-redirect.sh 替换而成；恢复原来的块："
            print "    #   sudo bash scripts/https/enable-redirect.sh --undo"
            print "    location / { return 301 https://" domain "$request_uri; }"
            print "    " e
          }
          next
        }
        lines[NR]=$0
        print
      }
      END { if (!done) exit 3 }
    ' "$BASE" > "$OUT"; then
      echo ""
      echo "  ✗ 替换失败。为避免改坏配置，**什么都没做**。"
      rm -f "$BASE" "$OUT" "$STATE_FILE"
      exit 1
    fi
    mv "$OUT" "$REDIRECT_FILE"
    rm -f "$BASE"
  fi
  echo "  ✓ 已替换（跳转到 https://$DOMAIN）"
fi
echo ""

# ---- 语法检查：硬门槛 ----
echo "③ 语法检查（不过就自动还原）"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] nginx -t"
else
  # 防重复 location：我们的片段与原有 location / 不能共存
  DUP="$(grep -cE '^[[:space:]]*location[[:space:]]+/[[:space:]]*\{' "$REDIRECT_FILE" || true)"
  if [ "$DUP" -gt 1 ]; then
    echo "    ⚠️ 检测到 $DUP 个 location / —— 大概率重复，nginx 会报 duplicate location"
  fi
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    echo ""
    echo "  ✗ 语法检查失败 —— **没有 reload**，正在自动还原..."
    cp -a "$BACKUP" "$REDIRECT_FILE"
    rm -f "$STATE_FILE"
    echo "  ✓ 已还原（站点配置回到改动前）"
    exit 1
  fi
  echo "  ✓ 语法检查通过（location / 共 $DUP 个）"
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
  [ -n "$LOC" ] && echo "  $LOC"
  case "$CODE" in
    301|308) echo "  ✓ 已正确跳转" ;;
    000) echo "  ⚠️ 本机自检拿不到结果（不一定是问题）" ;;
    *) echo "  ⚠️ 返回 $CODE，期望 301" ;;
  esac
  HTTPS_CODE="$(curl -s -k -o /dev/null -w '%{http_code}' "https://127.0.0.1/" -H "Host: $FIRST" 2>/dev/null || echo 000)"
  echo "  https://$FIRST → HTTP $HTTPS_CODE（应为 200/302 之类，不能是 5xx）"
fi
echo ""
echo "==========================================="
if [ "$UNDO" = "1" ]; then
  echo "  ✅ 已恢复原来的 80 配置（代理回来了，不再跳转）"
else
  echo "  ✅ 80 → 443 跳转已启用"
fi
echo "==========================================="
echo ""
if [ "$UNDO" = "0" ]; then
  echo "请确认："
  echo "  1. 浏览器访问 http://$DOMAIN/ 会跳到 https 且正常打开"
  echo "  2. https 打开后功能正常（尤其登录）"
  echo "  3. 若证书不覆盖某个域名，那个域名不该出现在跳转里"
  echo ""
  echo "要恢复成原来的 80 配置：sudo npm run https:redirect -- --undo"
else
  echo "现在 http 与 https 都能访问（不再跳转）。"
fi
echo ""
