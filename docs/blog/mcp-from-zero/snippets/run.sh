#!/usr/bin/env bash
# ============================================================
# 服务器侧的"白名单脚本"（教学版）
# ------------------------------------------------------------
# 它被 SSH 的**强制命令**调用：
#   ~/.ssh/authorized_keys 里写
#     restrict,command="/opt/demo-ops/run.sh" ssh-ed25519 AAAA... demo-ops
#   于是这把 key 无论请求什么，实际执行的都是本脚本；
#   客户端"想执行"的命令原文落在 SSH_ORIGINAL_COMMAND 里。
#
# 设计原则（照抄就能用）：
#   1. 只认枚举动作，其余一律 exit 64
#   2. 参数只接受枚举，不拼进 shell
#   3. 破坏性动作先过闸门：锁 / 干净 / 磁盘 / 目标版本
#   4. 部署放到 setsid 后台跑：SSH 断线不会把 build 杀到一半
#   5. 每次调用记一行审计
# ============================================================
set -uo pipefail

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"
export LC_ALL=C
export NO_COLOR=1

APP_DIR="${DEMO_APP_DIR:-/srv/demo-app}"
PM2_APP="${DEMO_PM2_APP:-demo-app}"
SELF="/opt/demo-ops/run.sh"
OPS_DIR="/var/log/demo-ops"
LOCK="$OPS_DIR/deploy.lock"
AUDIT="$OPS_DIR/audit.log"

mkdir -p "$OPS_DIR" 2>/dev/null || true
strip_ansi() { sed -e 's/\x1b\[[0-9;]*m//g'; }

audit_log() {
  printf '%s action=%s arg=%s client=%s\n' \
    "$(date -Is 2>/dev/null || date)" "$1" "${2:-}" "${SSH_CLIENT%% *}" \
    >>"$AUDIT" 2>/dev/null || true
}

# ------------------------------------------------------------------
# 内部动作：后台 worker（由 deploy 以 setsid 启动）
# ------------------------------------------------------------------
if [ "${1:-}" = "deploy-worker" ]; then
  RUN_ID="${2:-}"
  [ -z "$RUN_ID" ] && { echo "denied: worker 缺少 run id" >&2; exit 64; }
  LOGFILE="$OPS_DIR/deploy-$RUN_ID.log"
  EXITFILE="$OPS_DIR/deploy-$RUN_ID.exit"
  {
    echo "=== 部署开始 $(date -Is) run=$RUN_ID ==="
    cd "$APP_DIR" || { echo "无法进入 $APP_DIR"; echo 69 >"$EXITFILE"; rm -f "$LOCK"; exit 69; }
    command -v npm >/dev/null 2>&1 || {
      echo "npm 不在 PATH 里"; echo 69 >"$EXITFILE"; rm -f "$LOCK"; exit 69
    }
    npm run update
    CODE=$?
    echo "=== 部署结束 $(date -Is) 退出码=$CODE ==="
    echo "$CODE" >"$EXITFILE"
  } >>"$LOGFILE" 2>&1
  rm -f "$LOCK"
  exit 0
fi

# ------------------------------------------------------------------
# 外部动作
# ------------------------------------------------------------------
ACTION="${SSH_ORIGINAL_COMMAND:-status}"
CMD="${ACTION%% *}"
ARG=""
[ "$CMD" != "$ACTION" ] && ARG="${ACTION#* }"
audit_log "$CMD" "$ARG"

case "$CMD" in
  status)
    echo "== 代码版本 =="
    git -C "$APP_DIR" log -1 --pretty='%h %s' 2>&1
    DIRTY="$(git -C "$APP_DIR" status --porcelain 2>/dev/null | head -n 10)"
    if [ -n "$DIRTY" ]; then echo "未提交改动："; echo "$DIRTY"; else echo "工作区干净"; fi
    echo
    echo "== 部署锁 =="
    if [ -f "$LOCK" ]; then echo "有部署在进行（$(cat "$LOCK" 2>/dev/null)）"; else echo "无"; fi
    echo
    echo "== 进程 =="
    pm2 status 2>&1 | strip_ansi | head -n 12
    echo
    echo "== 磁盘 =="; df -h / | tail -n 1
    ;;

  logs)
    case "$ARG" in
      20|50|100) N="$ARG" ;;
      *) echo "denied: logs 只允许 20 / 50 / 100" >&2; exit 64 ;;
    esac
    pm2 logs "$PM2_APP" --lines "$N" --nostream 2>&1 | strip_ansi
    ;;

  deploy)
    # 闸门 0：必须显式给目标版本
    printf '%s' "$ARG" | grep -Eq '^[0-9a-f]{7,40}$' || {
      echo "denied: deploy 必须带目标版本号（7–40 位十六进制）" >&2; exit 64
    }
    # 闸门 1：互斥锁（>30 分钟视为陈旧）
    if [ -f "$LOCK" ]; then
      if [ -n "$(find "$LOCK" -mmin +30 2>/dev/null)" ]; then
        rm -f "$LOCK"
      else
        echo "denied: 已有部署在进行" >&2; exit 75
      fi
    fi
    # 闸门 2：工作区必须干净
    DIRTY="$(git -C "$APP_DIR" status --porcelain 2>/dev/null)"
    [ -n "$DIRTY" ] && { echo "denied: 工作区有未提交改动" >&2; exit 73; }
    # 闸门 3：磁盘 ≥1GB
    AVAIL="$(df -Pm / | awk 'NR==2{print $4}')"
    [ -n "$AVAIL" ] && [ "$AVAIL" -lt 1024 ] && { echo "denied: 磁盘不足" >&2; exit 74; }
    # 闸门 4：origin/main 必须真的等于声明的版本
    git -C "$APP_DIR" fetch --quiet origin main 2>/dev/null || {
      echo "denied: git fetch 失败" >&2; exit 71
    }
    LOCAL_REV="$(git -C "$APP_DIR" rev-parse HEAD)"
    REMOTE_REV="$(git -C "$APP_DIR" rev-parse origin/main)"
    case "$REMOTE_REV" in
      "$ARG"*) ;;
      *) echo "denied: 目标版本不匹配（origin/main=${REMOTE_REV:0:7}）" >&2; exit 76 ;;
    esac
    [ "$LOCAL_REV" = "$REMOTE_REV" ] && { echo "state=up-to-date"; exit 0; }

    RUN_ID="$(date +%Y%m%d%H%M%S)"
    echo "$RUN_ID" >"$LOCK"
    if command -v setsid >/dev/null 2>&1; then
      setsid nohup "$SELF" deploy-worker "$RUN_ID" >/dev/null 2>&1 </dev/null &
    else
      nohup "$SELF" deploy-worker "$RUN_ID" >/dev/null 2>&1 </dev/null &
    fi
    echo "state=started"; echo "run=$RUN_ID"; echo "to=${REMOTE_REV:0:7}"
    ;;

  deploy-status)
    LAST="$(ls -1t "$OPS_DIR"/deploy-*.log 2>/dev/null | head -n 1)"
    [ -z "$LAST" ] && { echo "state=none"; exit 0; }
    RUN_ID="$(basename "$LAST" .log | sed 's/^deploy-//')"
    EXITFILE="$OPS_DIR/deploy-$RUN_ID.exit"
    if [ -f "$LOCK" ] && [ "$(cat "$LOCK")" = "$RUN_ID" ]; then
      echo "state=running"
    elif [ -f "$EXITFILE" ]; then
      [ "$(cat "$EXITFILE")" = "0" ] && echo "state=success" || echo "state=failed"
      echo "exit=$(cat "$EXITFILE")"
    else
      echo "state=unknown"
    fi
    echo "--- 日志尾部 ---"
    tail -n 60 "$LAST" 2>&1 | strip_ansi
    ;;

  *)
    echo "denied: 只允许 status | logs | deploy | deploy-status" >&2
    exit 64
    ;;
esac
