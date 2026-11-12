/*
 * 临时：验证迁移脚本（造数据 → 预演 → 提交 → 重跑幂等 → 对账 → 清理）
 */
import { execFileSync } from "node:child_process"
import Database from "better-sqlite3"

const db = new Database("dev.db")
const owner = db.prepare("select id from User where role='OWNER' limit 1").get()
const now = new Date().toISOString().replace("Z", "+00:00")

// 造：5 张照片（2 个主题）+ 3 条诗句
const photoIds = []
const insertPhoto = db.prepare(
  "insert into Photo (filename,url,category,title,description,width,height,sortOrder,authorId,createdAt,updatedAt) values (?,?,?,?,?,?,?,?,?,?,?)"
)
for (const [i, p] of [
  { cat: "programming", title: "迁移测试 1", desc: "描述 1" },
  { cat: "programming", title: "迁移测试 2", desc: null },
  { cat: "programming", title: null, desc: "只有描述" },
  { cat: "gaming", title: "迁移测试 3", desc: "描述 2" },
  { cat: "coffee", title: "迁移测试 4", desc: "描述 3" },
].entries()) {
  photoIds.push(
    insertPhoto.run(
      `mig-test-${i}.png`,
      `/api/images/mig-test-${i}.png`,
      p.cat,
      p.title,
      p.desc,
      1200,
      800,
      0,
      owner.id,
      now,
      now
    ).lastInsertRowid
  )
}
const poemIds = []
const insertPoem = db.prepare(
  "insert into Poem (content,author,source,sortOrder,authorId,createdAt,updatedAt) values (?,?,?,?,?,?,?)"
)
for (const [i, p] of [
  { c: "迁移诗句一", a: "李白", s: "将进酒" },
  { c: "迁移诗句二", a: null, s: null },
  { c: "迁移诗句三", a: "苏轼", s: "赤壁赋" },
].entries()) {
  poemIds.push(insertPoem.run(p.c, p.a, p.s, 0, owner.id, now, now).lastInsertRowid)
}

const run = (args) => {
  try {
    return execFileSync("npx", ["tsx", "scripts/migrate-moments.mts", ...args], { encoding: "utf8", shell: true })
  } catch (e) {
    return (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "")
  }
}

let pass = 0
const fail = []
const check = (n, ok, d = "") => {
  ok ? pass++ : fail.push(`${n}${d ? " — " + d : ""}`)
  console.log(`  ${ok ? "✓" : "✗"} ${n}${d ? ` — ${d}` : ""}`)
}

const countMoments = (kind) =>
  db.prepare(kind ? "select count(*) c from Moment where kind = ?" : "select count(*) c from Moment").get(...(kind ? [kind] : [])).c

try {
  // 1) 预演
  const dry = run([])
  console.log("--- 预演输出 ---\n" + dry.trim().split("\n").slice(0, 6).join("\n"))
  check("预演提示数量正确", /相册照片：共 5 张.*待迁 5/.test(dry) && /诗句：\s+共 3 条.*待迁 3/.test(dry), dry.split("\n")[1])
  check("预演不写库", countMoments() === 0, `moments=${countMoments()}`)

  // 2) 提交
  const commit = run(["--commit"])
  console.log("--- 提交输出 ---\n" + commit.trim().split("\n").slice(-4).join("\n"))
  check("提交后图文动态 5 条", countMoments("moment") === 5, `moment=${countMoments("moment")}`)
  check("提交后诗句动态 3 条", countMoments("poem") === 3, `poem=${countMoments("poem")}`)
  const images = db.prepare("select count(*) c from MomentImage").get().c
  check("图片 5 张", images === 5, `images=${images}`)

  // 3) 幂等：再跑一次
  const again = run(["--commit"])
  check("重复执行不新增", countMoments() === 8, `moments=${countMoments()}，输出含「没有需要迁移的数据」=${again.includes("没有需要迁移的数据")}`)
  check("重跑输出提示已完成", again.includes("没有需要迁移的数据"), "")

  // 4) 内容抽查
  const sample = db.prepare("select kind, topic, title, text, poemAuthor, poemSource, legacyKind, legacyId from Moment where legacyKind='poem' order by id limit 1").get()
  check("诗句迁移保留作者与出处", sample?.poemAuthor === "李白" && sample?.poemSource === "将进酒", JSON.stringify(sample))
  const photoSample = db.prepare("select topic, title, text, legacyId from Moment where legacyKind='photo' and title is null limit 1").get()
  check("照片迁移保留主题与空标题", photoSample?.topic === "programming" && photoSample?.title === null, JSON.stringify(photoSample))
  const imgRow = db.prepare("select url, width, height, filename from MomentImage limit 1").get()
  check("图片迁移保留尺寸", imgRow?.width === 1200 && imgRow?.height === 800 && imgRow?.url.startsWith("/api/images/"), JSON.stringify(imgRow))
} finally {
  // 清理：删动态（图片级联）+ 删临时旧数据
  db.prepare("delete from Moment").run()
  for (const id of photoIds) db.prepare("delete from Photo where id = ?").run(id)
  for (const id of poemIds) db.prepare("delete from Poem where id = ?").run(id)
  db.prepare("delete from MomentImage").run()
  db.close()
}

console.log(`\n===== ${pass} 通过 / ${fail.length} 失败 =====`)
if (fail.length) { fail.forEach((f) => console.log(`  ✗ ${f}`)); process.exit(1) }
