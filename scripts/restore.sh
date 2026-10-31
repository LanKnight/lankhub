#!/usr/bin/env bash
# ============================================================
# lankHub 恢复入口（保持 `bash scripts/restore.sh` / `npm run restore` 不变）
#
# 真正的逻辑在 scripts/restore-run.mjs。旧版 restore.sh 的问题：
#   1. `read -p` 等键盘确认 —— 没有 TTY 就跑不了，MCP 无法驱动；
#   2. 回滚前不备份现状 —— 选错包就再也回不去；
#   3. `git checkout backup/<ts>` 会进 detached HEAD，之后 `git pull` 会出问题；
#   4. 无条件 `npm run db:push` —— 只回数据时会按新 schema 改旧库，可能丢数据。
#
# 用法：
#   bash scripts/restore.sh --list                       # 列出可用备份
#   bash scripts/restore.sh --package <id> --yes          # 代码 + 数据一起回
#   bash scripts/restore.sh --package <id> --mode data --yes   # 只回数据
#
# ⚠️ 这是破坏性操作：必须显式 --yes（MCP 调用时也会带）。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "==> 恢复失败：找不到 node" >&2
  exit 1
fi

exec node scripts/restore-run.mjs "$@"
