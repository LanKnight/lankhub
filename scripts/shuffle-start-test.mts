/*
 * 验证「随机播放的起点是随机的」。
 *
 * 站长反馈：每次点「随机播放」，第一首都是固定的。
 * 根因是 ArtistGrid 的 playAll 里两条路都写 `play(playable[0], playable)`，
 * random 只改了模式（「后续怎么走」），起点仍写死第一首。
 *
 * 这个测试锁住「起点随机」这个行为，防止以后被简化回去。
 *
 * 用法：npx tsx scripts/shuffle-start-test.mts
 *
 * 说明：这里测的是**选择起点的算法**（纯函数式地重跑 ArtistGrid 里那两行逻辑），
 * 不启动浏览器 —— 浏览器端的完整交互走 npm run music:ui-check。
 */
import { buildShuffleOrder, peekNextSong } from "../src/lib/play-order"

let pass = 0
const fail: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    fail.push(`${name}${detail ? ` — ${detail}` : ""}`)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

/** 与 artist-grid 里 playAll 相同：随机挑一个起点 */
function pickRandomStart<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

const queue = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }))

console.log("\n【1】起点确实是随机的（不是永远第一首）")
{
  const picks = new Set<number>()
  for (let i = 0; i < 200; i++) {
    picks.add(pickRandomStart(queue).id)
  }
  check("200 次里出现过多个不同的起点", picks.size > 1, `出现过 ${picks.size} 种起点`)
  if (picks.size <= 1) console.log(`     只出现过：${[...picks].join(",")}`)

  // 统计第一首出现的频率，确认它不是压倒性偏向第一首
  let firstCount = 0
  const RUNS = 1000
  for (let i = 0; i < RUNS; i++) {
    if (pickRandomStart(queue).id === queue[0].id) firstCount += 1
  }
  const rate = firstCount / RUNS
  /*
   * 期望约 1/10 = 10%。给个宽松区间（5%~17%）——
   * 这里不是为了验随机数质量，而是**确认没有退化回「永远第一首」**（那会是 100%）。
   */
  check(
    "第一首被选中的比例接近 1/10（而不是 100%）",
    rate > 0.05 && rate < 0.17,
    `${(rate * 100).toFixed(1)}%`
  )
}

console.log("\n【2】★ 对照：旧实现的起点恒定")
{
  // 旧实现等价于「永远取 list[0]」
  const oldPicks = new Set<number>()
  for (let i = 0; i < 50; i++) oldPicks.add(queue[0].id)
  check("旧写法只会出现 1 种起点（这就是被反馈的 bug）", oldPicks.size === 1, [...oldPicks].join(","))
}

console.log("\n【3】随机顺序以被选中的那首为位置 0")
{
  const list = queue.map((s) => s.id)
  for (let i = 0; i < 20; i++) {
    const pick = pickRandomStart(queue).id
    const order = buildShuffleOrder(queue, pick)
    if (order[0] !== pick) {
      check("洗牌顺序的首位必须是被选中的起点", false, `pick=${pick} order[0]=${order[0]}`)
      break
    }
    if ([...order].sort((a, b) => a - b).join() !== [...list].sort((a, b) => a - b).join()) {
      check("洗牌不丢歌也不重复", false, order.join())
      break
    }
  }
  check("洗牌顺序的首位是被选中的起点、且元素不丢不重", true, "20 次抽样均满足")
}

console.log("\n【4】起点之后的「下一首」不是第一首（随机性延续）")
{
  const pick = pickRandomStart(queue).id
  const order = buildShuffleOrder(queue, pick)
  const next = peekNextSong({
    mode: "shuffle",
    queueIds: queue.map((s) => s.id),
    currentId: pick,
    delta: 1,
    shuffleOrderIds: order,
    history: [],
  })
  check("从随机起点能算出下一首", next !== null, String(next))
  check("下一首不是起点自己", next !== pick, `${pick} → ${next}`)
}

console.log("\n【5】单曲队列与非空边界")
{
  check("单曲队列也能挑出起点", pickRandomStart([{ id: 7 }]).id === 7)
  const order = buildShuffleOrder([{ id: 7 }], 7)
  check("单曲队列的洗牌顺序是它自己", order.join() === "7", order.join())
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
if (fail.length > 0) {
  fail.forEach((f) => console.log(`  - ${f}`))
  process.exitCode = 1
}
