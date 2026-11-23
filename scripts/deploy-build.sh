#!/usr/bin/env bash
#
# 部署时的构建步骤（由 `npm run update` 调用）。
#
# 为什么不能直接 `npm run build`：
#   那样会把新的产物**写进正在被旧进程使用的 .next**。构建这几十秒里旧进程仍在
#   接请求，但它引用的 chunk 正在被覆盖/改名 —— 典型后果是
#   `ChunkLoadError: Cannot find module .../chunks/ssr/xxx.js`，相关路由直接 500。
#   2026-11-22 就因此让线上音乐全部播不了（部署窗口正好撞上）。
#
# 做法：先构建到 .next-new（不影响正在服务的 .next），构建成功后才停服换名，
#       停机窗口从"整个构建时长"降到"两次 mv 的时间"。
#       构建失败就直接退出，线上继续跑旧版本，不动。
#
set -euo pipefail

cd "$(dirname "$0")/.."

NEW_DIR=".next-new"
OLD_DIR=".next-old"

echo "==> 构建到 ${NEW_DIR}（线上继续用旧的 .next）"
rm -rf "${NEW_DIR}"
NEXT_DIST_DIR="${NEW_DIR}" npm run build

# next build 会顺手重排 tsconfig.json / 改写 next-env.d.ts（格式化，不影响语义）。
# 不还原的话服务器工作区一直是脏的，部署守卫会拒绝下一次部署。
# 注意：必须分开写。git checkout 只要有一个 pathspec 不匹配（next-env.d.ts 未被跟踪）
# 就会整体报错、什么都不还原 —— 配 `|| true` 还会静默失败，tsconfig 就一直脏着。
git checkout -- tsconfig.json 2>/dev/null || true
git checkout -- next-env.d.ts 2>/dev/null || true
if [ ! -d "${NEW_DIR}/server" ]; then
  echo "!! 构建产物不完整（缺少 ${NEW_DIR}/server），放弃切换" >&2
  exit 1
fi

echo "==> 停服并原子切换"
pm2 stop next-app >/dev/null 2>&1 || true

rm -rf "${OLD_DIR}"
mv .next "${OLD_DIR}" 2>/dev/null || true
mv "${NEW_DIR}" .next

pm2 restart next-app --update-env >/dev/null 2>&1

echo "==> 清理旧产物"
rm -rf "${OLD_DIR}"

echo "==> 完成：$(date '+%F %T')"
