/*
 * 从一个备份包里恢复（可被 MCP 无交互驱动）。
 *
 * 为什么要重写旧的 restore.sh：
 *   1. 旧脚本用 `read -p` 等键盘确认 —— 没有 TTY 就跑不了，MCP 根本没法驱动；
 *   2. 旧脚本回滚前**不备份现状** —— 一旦选错包，新数据就被覆盖且无法回头；
 *   3. 旧脚本用 `git checkout backup/<ts>` 会进 detached HEAD，之后 `git pull` 会出问题；
 *   4. 旧脚本无条件跑 `npm run db:push` —— 只回滚数据时会按**当前** schema 去改旧库，
 *      有丢数据风险。这里只有 `--mode full` 才会动 schema。
 *
 * 用法：
 *   node scripts/restore-run.mjs --list
 *   node scripts/restore-run.mjs --package lankhub-backup-20261031-234500.tar.gz --yes
 *   node scripts/restore-run.mjs --package <name> --mode data --yes
 *   node scripts/restore-run.mjs --package <name> --mode full --no-prebak --yes
 *
 * 参数：
 *   --package <name|id>  包名或时间戳 id（如 20261031-234500）
 *   --mode full|data     默认 full（代码 + 数据）；data 只回数据，不动代码与 schema
 *   --yes                跳过确认（MCP 调用必须带；不带时也会直接拒绝，避免误触）
 *   --no-prebak          不在回滚前备份现状（默认会备份，安全性差，慎用）
 *   --list               列出可用备份
 *
 * 环境变量：
 *   LANKHUB_PM2_APP      PM2 应用名（默认 next-app）
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs"
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(ROOT)

const BACKUP_DIR = "backups"
const PM2_APP = process.env.LANKHUB_PM2_APP || "next-app"
const PKG_RE = /^lankhub-backup-(\d{8}-\d{6})\.tar\.gz$/

const arg = (name, fallback = "") => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback
}
const has = (name) => process.argv.includes(name)

const step = (msg) => console.log(`    ${msg}`)

function sha256Stream(file) {
  const hash = createHash("sha256")
  const fd = openSync(file, "r")
  const buf = Buffer.allocUnsafe(1024 * 1024)
  let read = 0
  while ((read = readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, read))
  closeSync(fd)
  return hash.digest("hex")
}

/** 把包名/时间戳统一成包名 */
function resolvePackage(input) {
  if (!input) return ""
  if (PKG_RE.test(input)) return input
  const byId = `lankhub-backup-${input}.tar.gz`
  return PKG_RE.test(byId) ? byId : ""
}

function listPackages() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter((name) => PKG_RE.test(name))
    .sort()
    .reverse()
    .map((name) => {
      const file = path.join(BACKUP_DIR, name)
      const bytes = statSync(file).size
      let manifest = null
      try {
        const raw = execFileSync("tar", ["-xOf", file, "./manifest.json"], { encoding: "utf8" })
        manifest = JSON.parse(raw)
      } catch {
        manifest = null
      }
      return {
        name,
        id: name.match(PKG_RE)[1],
        bytes,
        createdAt: manifest?.createdAt ?? null,
        git: manifest?.git ?? null,
        db: manifest?.db
          ? { mode: manifest.db.mode, tables: manifest.db.tables, integrity: manifest.db.integrity }
          : null,
        data: manifest?.data ?? null,
        env: manifest?.env ? { present: manifest.env.present } : null,
      }
    })
}

function pm2(args) {
  try {
    execFileSync("pm2", args, { stdio: "inherit", env: { ...process.env, NO_COLOR: "1" } })
  } catch (err) {
    // 停的时候进程本来就没起，会返回非零；不该因此中断恢复
    console.log(`    ⚠ pm2 ${args.join(" ")} 返回非零：${err.message}`)
  }
}

/** 用 better-sqlite3 验一下包里的库能不能读 */
async function verifyDbInside(pkgPath, ts) {
  const tmp = path.join(tmpdir(), `lankhub-restore-${ts}`)
  await mkdir(tmp, { recursive: true })
  try {
    execFileSync("tar", ["-xzf", pkgPath, "-C", tmp, "./db.sqlite"], { cwd: ROOT })
    const { default: Database } = await import("better-sqlite3")
    const db = new Database(path.join(tmp, "db.sqlite"), { readonly: true })
    const integrity = String(db.pragma("integrity_check", { simple: true }))
    const tables = db
      .prepare("select count(*) c from sqlite_master where type='table' and name not like 'sqlite_%'")
      .get().c
    db.close()
    return { integrity, tables, dir: tmp }
  } catch (err) {
    await rm(tmp, { recursive: true, force: true })
    throw new Error(`包里的数据库不可用：${err.message}`)
  }
}

async function main() {
  if (has("--list")) {
    const list = listPackages()
    if (list.length === 0) {
      console.log("（没有任何备份包）")
      return
    }
    for (const item of list) {
      console.log(
        `${item.id}  ${(item.bytes / 1024 / 1024).toFixed(1)} MB  ` +
          `git ${item.git?.rev ?? "?"}  ` +
          `db ${item.db?.integrity ?? "?"} / ${item.db?.tables ?? "?"} 表  ` +
          `文件 ${item.data?.files ?? 0} 个  ` +
          `env ${item.env?.present ? "有" : "无"}`
      )
    }
    return
  }

  const pkgName = resolvePackage(arg("--package"))
  if (!pkgName) {
    console.error("错误：必须用 --package 指定备份包（或 --list 查看）")
    process.exit(64)
  }
  const pkgPath = path.join(BACKUP_DIR, pkgName)

  const mode = arg("--mode", "full")
  if (mode !== "full" && mode !== "data") {
    console.error("错误：--mode 只能是 full 或 data")
    process.exit(64)
  }

  /*
   * 先校验 --yes 再看包在不在：这是破坏性操作，
   * 缺少显式确认必须**无条件**拒绝（退出码 64），不要让它看起来像"包不存在"。
   */
  if (!has("--yes")) {
    // 非交互环境（MCP）没有 TTY，绝不允许"悄悄继续"
    console.error("错误：恢复是破坏性操作，必须显式加 --yes")
    process.exit(64)
  }

  if (!existsSync(pkgPath)) {
    console.error(`错误：找不到 ${pkgName}`)
    process.exit(66)
  }

  const id = pkgName.match(PKG_RE)[1]
  console.log(`==> 准备恢复 ${pkgName}（模式：${mode === "full" ? "代码 + 数据" : "只回数据"}）`)

  // 1. 校验包本身
  const shaFile = `${pkgPath}.sha256`
  if (existsSync(shaFile)) {
    const expected = (await import("node:fs")).readFileSync(shaFile, "utf8").trim().split(/\s+/)[0]
    const actual = sha256Stream(pkgPath)
    if (expected !== actual) {
      console.error(`错误：包校验失败（期望 ${expected.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）`)
      process.exit(65)
    }
    step("✓ sha256 校验通过")
  } else {
    step("⚠ 没有 .sha256 文件，跳过整包校验")
  }

  // 2. 读清单 + 验库
  let manifest = null
  try {
    manifest = JSON.parse(execFileSync("tar", ["-xOf", pkgPath, "./manifest.json"], { encoding: "utf8" }))
  } catch {
    console.error("错误：包里没有可读的 manifest.json")
    process.exit(65)
  }
  const dbCheck = await verifyDbInside(pkgPath, id)
  if (dbCheck.integrity !== "ok") {
    await rm(dbCheck.dir, { recursive: true, force: true })
    console.error(`错误：包里的数据库 integrity=${dbCheck.integrity}`)
    process.exit(65)
  }
  step(`✓ 包内数据库可用：${dbCheck.tables} 张表，integrity=ok`)

  // 3. 回滚前先把现状备份一份（安全网）
  if (!has("--no-prebak")) {
    step("… 先备份当前状态（回滚可撤销）")
    const out = execFileSync("node", ["scripts/backup-run.mjs", "--json"], { encoding: "utf8" })
    const pre = JSON.parse(out.trim().split("\n").pop())
    step(`✓ 已备份现状：${pre.package}`)
  }

  // 4. 停服务，避免覆盖数据库文件时它正持有连接
  step("… 停止 PM2 进程")
  pm2(["stop", PM2_APP])

  try {
    // 5. 恢复数据库
    await cp(path.join(dbCheck.dir, "db.sqlite"), "dev.db")
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      await rm(`dev.db${suffix}`, { force: true })
    }
    step("✓ 数据库已恢复")

    // 6. 恢复上传文件（整个 data/）
    if (manifest.data?.present) {
      execFileSync("tar", ["-xzf", pkgPath, "-C", ".", "./data.tar.gz"], { cwd: ROOT })
      await rm("data", { recursive: true, force: true })
      execFileSync("tar", ["-xzf", "data.tar.gz"], { cwd: ROOT })
      await rm("data.tar.gz", { force: true })
      step(`✓ 上传文件已恢复（${manifest.data.files} 个）`)
    } else {
      step("⚠ 包里没有上传文件，跳过")
    }

    // 7. 环境变量（只在 full 模式下恢复：data 模式应保持现有环境）
    if (mode === "full" && manifest.env?.present) {
      execFileSync("tar", ["-xzf", pkgPath, "-C", ".", "./env.local"], { cwd: ROOT })
      try {
        await chmod(".env.local", 0o600)
      } catch {
        /* Windows 忽略 */
      }
      step("✓ 环境变量已恢复")
    } else if (mode === "data") {
      step("… data 模式：保留当前环境变量")
    }

    // 8. 代码（只在 full 模式下）：用清单里的 commit 做 reset，而不是 checkout tag
    if (mode === "full" && manifest.git?.rev) {
      step(`… 恢复代码到 ${manifest.git.rev}`)
      try {
        execFileSync("git", ["checkout", "main"], { cwd: ROOT, stdio: "inherit" })
      } catch {
        /* 已经在 main 上 */
      }
      execFileSync("git", ["reset", "--hard", manifest.git.rev], { cwd: ROOT, stdio: "inherit" })
      step(`✓ 代码已回到 ${manifest.git.rev}`)

      // 9. 依赖 + schema + 构建（full 才需要）
      const mirrors = {
        better_sqlite3_binary_host: "https://npmmirror.com/mirrors/better-sqlite3",
        NODEJS_ORG_MIRROR: "https://npmmirror.com/mirrors/node",
        PRISMA_ENGINES_MIRROR: "https://npmmirror.com/mirrors/prisma",
      }
      step("… 安装依赖（npm ci）")
      execFileSync("npm", ["ci", "--prefer-offline", "--ignore-scripts"], {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, ...mirrors },
      })
      execFileSync("npm", ["rebuild", "better-sqlite3", "--build-from-source"], {
        cwd: ROOT,
        stdio: "inherit",
        env: { ...process.env, ...mirrors },
      })
      step("… 同步 schema（db:push）")
      execFileSync("npm", ["run", "db:push"], { cwd: ROOT, stdio: "inherit" })
      step("… 构建（next build）")
      execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" })
    } else if (mode === "data") {
      step("… data 模式：跳过代码 / 依赖 / schema / 构建")
    }
  } finally {
    await rm(dbCheck.dir, { recursive: true, force: true })
    step("… 重启 PM2 进程")
    pm2(["restart", PM2_APP, "--update-env"].slice(0, 2))
  }

  console.log(`==> 恢复完成：${pkgName}（动作记录在 ops 审计日志里）`)
}

main().catch(async (err) => {
  console.error(`==> 恢复失败：${err.message}`)
  // 失败时也尽量把服务拉起来，别留一个停着的站点
  try {
    execFileSync("pm2", ["start", PM2_APP], { stdio: "inherit" })
  } catch {
    /* 尽力而为 */
  }
  process.exit(1)
})
