/*
 * 播放顺序纯函数的断言测试。
 *
 * 为什么这些值得单独测：`resolveStep` 有 3 个模式 × 4 个分支，
 * 靠手点是点不全的，而错了表现为「偶尔跳过一首」这种很难复现的现象。
 * `peekNextSong` 更微妙 —— 它**必须不改动任何进度**，否则播放器预取会
 * 顺手把随机顺序往前推一格，导致预取永远打不中（白耗第三方配额）。
 *
 * 用法：npx tsx scripts/play-order-test.mts
 */
import {
  buildShuffleOrder,
  nextPlayMode,
  peekNextSong,
  resolveStep,
  shuffle,
  type StepInput,
} from "../src/lib/play-order"

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

const ids = [1, 2, 3, 4, 5]

console.log("\n【1】模式循环")
{
  check("顺序 → 单曲", nextPlayMode("sequential") === "single")
  check("单曲 → 随机", nextPlayMode("single") === "shuffle")
  check("随机 → 顺序", nextPlayMode("shuffle") === "sequential")
}

console.log("\n【2】洗牌")
{
  const out = shuffle(ids)
  check("元素集合不变", [...out].sort().join() === [...ids].sort().join(), out.join())
  check("长度不变", out.length === ids.length)
  // 分布不该总是同一个顺序（20 次里至少出现两种）
  const seen = new Set<string>()
  for (let i = 0; i < 20; i++) seen.add(shuffle(ids).join())
  check("多次洗牌结果有变化（不是恒定顺序）", seen.size > 1, `${seen.size} 种`)
}

console.log("\n【3】buildShuffleOrder")
{
  const order = buildShuffleOrder(ids.map((id) => ({ id })), 3)
  check("当前歌固定排在最前", order[0] === 3, order.join())
  check("队列里每首都在", [...order].sort().join() === [...ids].sort().join())
  check("只有一首歌时也返回它自己", buildShuffleOrder([{ id: 7 }], 7).join() === "7")
  check("空队列返回空数组", buildShuffleOrder([], null).length === 0)
}

console.log("\n【4】顺序播放：走到底就停（不做列表循环）")
{
  const base: StepInput = { mode: "sequential", queueIds: ids, currentId: 5, delta: 1 }
  check("最后一首再按下一首 → null（停住）", resolveStep(base).nextId === null)
  const back: StepInput = { mode: "sequential", queueIds: ids, currentId: 1, delta: -1 }
  check("第一首再按上一首 → null", resolveStep(back).nextId === null)
  const mid: StepInput = { mode: "sequential", queueIds: ids, currentId: 3, delta: 1 }
  check("中间按下一首 → 4", resolveStep(mid).nextId === 4)
  const midBack: StepInput = { mode: "sequential", queueIds: ids, currentId: 3, delta: -1 }
  check("中间按上一首 → 2", resolveStep(midBack).nextId === 2)
}

console.log("\n【5】当前歌不在队列里 → 从头/从尾开始（而不是什么都不做）")
{
  const fwd: StepInput = { mode: "sequential", queueIds: ids, currentId: 99, delta: 1 }
  check("下一首 → 队列第一首", resolveStep(fwd).nextId === 1)
  const bwd: StepInput = { mode: "sequential", queueIds: ids, currentId: 99, delta: -1 }
  check("上一首 → 队列最后一首", resolveStep(bwd).nextId === 5)
}

console.log("\n【6】随机模式：上一首走历史，是真的回到刚才那首")
{
  const order = [3, 1, 5, 2, 4]
  const r1 = resolveStep({
    mode: "shuffle",
    queueIds: ids,
    currentId: 3,
    delta: 1,
    shuffleOrderIds: order,
    history: [],
  })
  check("下一首按乱序走 → 1", r1.nextId === 1, String(r1.nextId))
  check("前进时把当前歌压进历史", r1.history.join() === "3", r1.history.join())

  const r2 = resolveStep({
    mode: "shuffle",
    queueIds: ids,
    currentId: 1,
    delta: -1,
    shuffleOrderIds: order,
    history: r1.history,
  })
  check("★ 上一首回到刚才那首（3），而不是乱序里的前一首", r2.nextId === 3, String(r2.nextId))
  check("返回后历史被弹出", r2.history.length === 0, r2.history.join())
}

console.log("\n【7】★ peekNextSong 必须「只看不改」")
{
  /*
   * 这是本轮的回归重点。
   * 播放器在开播后会预取下一首，用 peekNextSong 算「下一首是谁」。
   * 如果它像 resolveStep 那样改动 history，就等于预取顺手前进了一步 ——
   * 之后真正点「下一首」算出来的歌会与预取的不是同一首（预取永远打不中），
   * 而且随机播放的返回顺序会错乱。
   */
  const order = [3, 1, 5, 2, 4]
  const history = [9]
  const snapOrder = [...order]
  const snapHistory = [...history]

  const peeked = peekNextSong({
    mode: "shuffle",
    queueIds: ids,
    currentId: 3,
    delta: 1,
    shuffleOrderIds: order,
    history,
  })

  check("返回了下一首的 id", peeked === 1, String(peeked))
  check("★ 传入的 shuffleOrderIds 没被改动", order.join() === snapOrder.join(), order.join())
  check("★ 传入的 history 没被改动", history.join() === snapHistory.join(), history.join())

  // 再对照一次：连续 peek 两次结果必须一致（若它偷偷改了进度，第二次会不同）
  const again = peekNextSong({
    mode: "shuffle",
    queueIds: ids,
    currentId: 3,
    delta: 1,
    shuffleOrderIds: order,
    history,
  })
  check("★ 连续两次 peek 结果一致（说明没消耗进度）", again === peeked, `${peeked} vs ${again}`)

  // 顺序播放走到头时 peek 应为 null（预取端据此不预取）
  check(
    "顺序播放最后一首 peek → null",
    peekNextSong({ mode: "sequential", queueIds: ids, currentId: 5, delta: 1 }) === null
  )
  // 只有一首歌时 peek 返回 null（下标越界 → 走到底）
  //
  // 我第一版断言它该返回「它自己」，那是错的：resolveStep 对
  // nextIndex >= order.length 一律返回 null，所以单曲队列再「下一首」
  // 就是走到底。播放器侧因此不需要额外判断，nextId === null 已经覆盖了。
  check(
    "只有一首歌时 peek → null（走到底，不是返回自己）",
    peekNextSong({ mode: "sequential", queueIds: [7], currentId: 7, delta: 1 }) === null
  )
}

console.log("\n【8】边界：空队列、单曲队列")
{
  check(
    "空队列 resolveStep → null",
    resolveStep({ mode: "sequential", queueIds: [], currentId: 1, delta: 1 }).nextId === null
  )
  check(
    "单曲队列按下一首 → null（走到底）",
    resolveStep({ mode: "sequential", queueIds: [7], currentId: 7, delta: 1 }).nextId === null
  )
  check(
    "单曲循环模式按下一首 → null",
    resolveStep({ mode: "single", queueIds: [7], currentId: 7, delta: 1 }).nextId === null
  )
}

console.log(`\n===== 通过 ${pass} 项，失败 ${fail.length} 项 =====`)
if (fail.length > 0) {
  fail.forEach((f) => console.log(`  - ${f}`))
  process.exitCode = 1
}
