#!/usr/bin/env bash
# ============================================================
# lankHub 备份入口（保持 `bash scripts/backup.sh` / `npm run backup` 不变）
#
# 真正的逻辑在 scripts/backup-run.mjs —— 用 bash 写「一致快照 + 逐件校验 + 清单」
# 太容易出错（引号、JSON 转义、tar 路径）。原来那版把 db 与 uploads 拆成两个文件、
# 靠时间戳对齐，清理又各删各的，数量一错位就会回滚成"半套"。
#
# 现在：一个包 = db.sqlite + data.tar.gz + env.local + manifest.json，
# 备份完自检 integrity，坏包不会留在磁盘上。
#
# 用法：
#   bash scripts/backup.sh           # 人看
#   bash scripts/backup.sh --json    # 机器读（MCP 用）
#
# 环境变量：LANKHUB_BACKUP_KEEP（保留几份整包，默认 2）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "==> 备份失败：找不到 node" >&2
  exit 1
fi

exec node scripts/backup-run.mjs "$@"
