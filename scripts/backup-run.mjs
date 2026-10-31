/*
 * 一次性完整备份：数据库 + 全部上传文件 + 环境变量 + 清单，打成一个 tar.gz。
 *
 * 为什么不再用 `cp dev.db`（旧做法的问题，实测确认过）：
 *   1. SQLite 的 journal_mode 是 delete，写入过程中 `cp` 可能拷到半截 —— 坏备份；
 *      这里用 better-sqlite3 的 backup()，是**在线一致快照**（自带页级一致性）；
 *      万一 node_modules 坏了（部署失败后常见），退回 copy 并在清单里标 db.mode=copy。
 *   2. 旧脚本把 db 与 uploads 拆成两个文件、靠时间戳对齐，清理又各删各的，
 *      数量一错位就回滚成"半套"。这里**一个包**装全部，清理也按整包计数。
 *   3. 旧脚本没有任何校验，所以"备份完不完整"无法回答。这里备份完立刻：
 *      解出包里的 db 跑 integrity_check、数表数行数、数文件数与字节数、逐件 sha256，
 *      全部写进 manifest.json，并在终端打一行摘要。
 *
 * 包里绝不放 .env.local 的**内容**到清单里（只放 sha256），避免清单被截图/贴日志带走密钥。
 *
 * 用法：
 *   node scripts/backup-run.mjs            # 备份
 *   node scripts/backup-run.mjs --json     # 只输出摘要 JSON（给 MCP 用）
 *
 * 环境变量：
 *   LANKHUB_BACKUP_KEEP   保留最近几个整包（默认 2）
 */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs"
import { chmod, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(ROOT)

const BACKUP_DIR = "backups"
const KEEP = Math.max(1, Number(process.env.LANKHUB_BACKUP_KEEP || 2))
const JSON_ONLY = process.argv.includes("--json")

const log = (msg) => {
  if (!JSON_ONLY) console.log(msg)
}

/** 20261031-234500（本地时间；给人和 MCP 用的 id） */
function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0")
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  )
}

/** 分块算 sha256：包里可能有几十 MB，不整块读进内存 */
function sha256Stream(file) {
  const hash = createHash("sha256")
  const fd = openSync(file, "r")
  const buf = Buffer.allocUnsafe(1024 * 1024)
  let read = 0
  while ((read = readSync(fd, buf, 0, buf.length, null)) > 0) {
    hash.update(buf.subarray(0, read))
  }
  closeSync(fd)
  return hash.digest("hex")
}

function gitInfo() {
  const run = (args) => {
    try {
      return execFileSync("git", args, { encoding: "utf8" }).trim()
    } catch {
      return ""
    }
  }
  return {
    rev: run(["rev-parse", "--short", "HEAD"]),
    subject: run(["log", "-1", "--pretty=%s"]),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: run(["status", "--porcelain"]).length > 0,
  }
}

/** 一致性快照；失败则退回普通拷贝并记录模式 */
async function snapshotDb(dest) {
  if (!existsSync("dev.db")) return { present: false, mode: "none", bytes: 0 }
  try {
    const { default: Database } = await import("better-sqlite3")
    const db = new Database("dev.db", { readonly: true })
    await db.backup(dest)
    db.close()
    return { present: true, mode: "online", bytes: statSync(dest).size }
  } catch (err) {
    log(`    ⚠ 在线快照失败（${err.message}），退回普通拷贝`)
    await cp("dev.db", dest)
    return { present: true, mode: "copy", bytes: statSync(dest).size }
  }
}

/** 用 better-sqlite3 读快照：integrity_check + 表数与关键表行数 */
async function inspectDb(file) {
  try {
    const { default: Database } = await import("better-sqlite3")
    const db = new Database(file, { readonly: true })
    const integrity = db.pragma("integrity_check", { simple: true })
    const tables = db
      .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'")
      .all()
      .map((row) => row.name)
    const rows = {}
    for (const table of tables) {
      try {
        rows[table] = db.prepare(`select count(*) c from "${table}"`).get().c
      } catch {
        rows[table] = -1
      }
    }
    db.close()
    return { integrity: String(integrity), tables: tables.length, rows }
  } catch (err) {
    return { integrity: `error: ${err.message}`, tables: 0, rows: {} }
  }
}

/** 递归统计目录里的文件数与总字节 */
async function dirStats(dir) {
  let files = 0
  let bytes = 0
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) {
        files += 1
        bytes += statSync(full).size
      }
    }
  }
  if (existsSync(dir)) await walk(dir)
  return { files, bytes }
}

async function main() {
  const ts = stamp()
  const work = path.join(BACKUP_DIR, `.work-${ts}`)
  const pkgName = `lankhub-backup-${ts}.tar.gz`
  const pkgPath = path.join(BACKUP_DIR, pkgName)

  await mkdir(work, { recursive: true })
  await mkdir(BACKUP_DIR, { recursive: true })

  log(`==> 开始备份 ${ts}`)

  // 1. 数据库（一致快照）
  const dbInfo = await snapshotDb(path.join(work, "db.sqlite"))
  if (!dbInfo.present) {
    await rm(work, { recursive: true, force: true })
    throw new Error("找不到 dev.db，拒绝产生不完整备份")
  }
  log(`    ✓ 数据库快照 ${(dbInfo.bytes / 1024).toFixed(0)} KB（${dbInfo.mode}）`)

  // 2. 全部上传文件：整个 data/ 目录（不只是 uploads，简历 PDF 也在里面）
  let dataInfo = { present: false, files: 0, bytes: 0 }
  const dataTar = path.join(work, "data.tar.gz")
  if (existsSync("data")) {
    execFileSync("tar", ["-czf", dataTar, "data"], { cwd: ROOT })
    dataInfo = { present: true, ...(await dirStats("data")) }
    log(`    ✓ 上传文件 ${dataInfo.files} 个 / ${(dataInfo.bytes / 1024 / 1024).toFixed(1)} MB`)
  } else {
    log("    ⚠ 没有 data/ 目录，跳过上传文件")
  }

  // 3. 环境变量（密钥）：只存文件，清单里**只记 sha256，不记内容**
  let envInfo = { present: false, sha256: null }
  if (existsSync(".env.local")) {
    const envDest = path.join(work, "env.local")
    await cp(".env.local", envDest)
    try {
      await chmod(envDest, 0o600)
    } catch {
      /* Windows 上可能不支持，忽略 */
    }
    envInfo = { present: true, sha256: sha256Stream(envDest) }
    log("    ✓ 环境变量 .env.local（清单里只记哈希）")
  } else {
    log("    ⚠ 没有 .env.local，跳过")
  }

  // 4. 清单
  const parts = []
  for (const name of ["db.sqlite", "data.tar.gz", "env.local"]) {
    const file = path.join(work, name)
    if (!existsSync(file)) continue
    parts.push({ name, bytes: statSync(file).size, sha256: sha256Stream(file) })
  }

  const dbCheck = await inspectDb(path.join(work, "db.sqlite"))
  const manifest = {
    package: pkgName,
    createdAt: new Date().toISOString(),
    createdAtLocal: ts,
    git: gitInfo(),
    parts,
    db: { ...dbInfo, integrity: dbCheck.integrity, tables: dbCheck.tables, rows: dbCheck.rows },
    data: dataInfo,
    env: envInfo,
    node: process.version,
    platform: process.platform,
  }
  await writeFile(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8")

  // 5. 打包
  execFileSync("tar", ["-czf", pkgPath, "-C", work, "."], { cwd: ROOT })
  const pkgBytes = statSync(pkgPath).size

  // 6. **自检**：把包里的 db 解出来再验一次，坏包不留在磁盘上
  const tmp = path.join(tmpdir(), `lankhub-verify-${ts}`)
  await mkdir(tmp, { recursive: true })
  execFileSync("tar", ["-xzf", pkgPath, "-C", tmp, "./db.sqlite"], { cwd: ROOT })
  const verify = await inspectDb(path.join(tmp, "db.sqlite"))
  await rm(tmp, { recursive: true, force: true })

  if (verify.integrity !== "ok") {
    await rm(pkgPath, { force: true })
    await rm(work, { recursive: true, force: true })
    throw new Error(`备份自检失败（integrity=${verify.integrity}），已删除这份包`)
  }

  const pkgSha = sha256Stream(pkgPath)
  await writeFile(`${pkgPath}.sha256`, `${pkgSha}  ${pkgName}\n`, "utf8")

  // 7. 清理旧包（按整包计数，不做分类删除，避免两边错位）
  const packages = readdirSync(BACKUP_DIR)
    .filter((name) => /^lankhub-backup-\d{8}-\d{6}\.tar\.gz$/.test(name))
    .sort()
    .reverse()
  const removed = []
  for (const old of packages.slice(KEEP)) {
    await rm(path.join(BACKUP_DIR, old), { force: true })
    await rm(path.join(BACKUP_DIR, `${old}.sha256`), { force: true })
    removed.push(old)
  }

  await rm(work, { recursive: true, force: true })

  const summary = {
    package: pkgName,
    bytes: pkgBytes,
    sha256: pkgSha,
    git: manifest.git,
    db: {
      mode: dbInfo.mode,
      tables: verify.tables,
      integrity: verify.integrity,
      rows: verify.rows,
    },
    data: dataInfo,
    env: envInfo,
    kept: Math.min(packages.length, KEEP),
    removed,
  }

  if (JSON_ONLY) {
    process.stdout.write(JSON.stringify(summary) + "\n")
    return
  }

  console.log(`    ✓ 打包 ${pkgName}  ${(pkgBytes / 1024 / 1024).toFixed(1)} MB`)
  console.log(`    ✓ 自检通过：integrity=ok，${verify.tables} 张表`)
  console.log(`    ✓ sha256 ${pkgSha.slice(0, 16)}…`)
  if (removed.length) console.log(`    ✓ 清理旧包 ${removed.length} 个（保留 ${KEEP} 份）`)
  const counts = Object.entries(verify.rows)
    .filter(([name]) => ["Article", "Comment", "Photo", "Poem", "Song", "User"].includes(name))
    .map(([name, n]) => `${name} ${n}`)
    .join(" / ")
  console.log(`==> 备份完成：${counts}；文件 ${dataInfo.files} 个`)
}

main().catch((err) => {
  console.error(`==> 备份失败：${err.message}`)
  process.exit(1)
})
