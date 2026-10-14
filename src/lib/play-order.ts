/**
 * 播放顺序与播放模式的**纯函数**。
 *
 * 单独一个文件的原因：这些逻辑（洗牌、模式循环、上一首历史）最容易出边界问题，
 * 而它们与 React 无关 —— 抽出来就能直接跑断言，不用起浏览器。
 * 实际踩过的坑记在下面各函数上。
 */

/** 播放模式。刻意只有三个，对应播放条上那一个循环按钮 */
export type PlayMode = "sequential" | "single" | "shuffle"

/** 模式按钮上显示的名字 */
export const PLAY_MODE_LABEL: Record<PlayMode, string> = {
  sequential: "顺序播放",
  single: "单曲循环",
  shuffle: "随机播放",
}

/** 点一下按钮的切换顺序：顺序 → 单曲 → 随机 → 回到顺序 */
const MODE_CYCLE: PlayMode[] = ["sequential", "single", "shuffle"]

export function nextPlayMode(mode: PlayMode): PlayMode {
  const index = MODE_CYCLE.indexOf(mode)
  return MODE_CYCLE[(index + 1) % MODE_CYCLE.length]
}

/**
 * 洗牌（Fisher-Yates）。
 *
 * 为什么不用 `sort(() => Math.random() - 0.5)`：那个写法看起来简洁，
 * 但分布不均匀（取决于引擎的排序实现），某些位置会明显更容易被排到前面。
 */
export function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 生成随机播放的顺序：**当前这首歌固定排在最前**，其余打乱。
 *
 * 为什么把当前歌排最前而不是随便洗：
 * 后续「下一首」是从这个数组里按当前位置往后取一格。若当前歌不在里面，
 * 就得额外记住「当前在乱序里的哪个位置」，一旦队列变化（换歌单、删歌）
 * 那个下标就会错位。把当前歌放在固定的位置 0，逻辑就只用管「往前往后走几格」，
 * 不存在「下标指向别的歌」这种情况。
 *
 * 边界：只放一首歌时也要返回它自己，否则「下一首」会变成空操作。
 */
export function buildShuffleOrder(
  queue: { id: number }[],
  currentId: number | null
): number[] {
  const ids = queue.map((s) => s.id)
  if (ids.length === 0) return []

  const rest = currentId === null ? ids : ids.filter((id) => id !== currentId)
  const ordered = shuffle(rest)
  if (currentId !== null && ids.includes(currentId)) ordered.unshift(currentId)
  return ordered
}

/** `resolveStep` 的输入与结果，抽成对象是为了让调用处不必记参数顺序 */
export interface StepInput {
  mode: PlayMode
  /** 当前队列里的歌曲 id，顺序即「顺序播放」的顺序 */
  queueIds: number[]
  currentId: number
  delta: 1 | -1
  /** 已存在的随机顺序；为空时由本函数按 currentId 现洗一副 */
  shuffleOrderIds?: number[]
  /** 随机模式下「上一首」的历史（调用方传入副本） */
  history?: number[]
}

export interface StepResult {
  /** 要切到的下一首；null = 停住不动（顺序播放走到底了） */
  nextId: number | null
  /** 调用方应当保存的随机顺序 */
  shuffleOrderIds: number[]
  /** 调用方应当保存的历史（已处理前进/后退） */
  history: number[]
}

/**
 * 算出「下一首/上一首」到底是哪一首 —— 三种模式的差别全在这里。
 *
 * 抽成纯函数的理由：这段逻辑有 4 个分支 × 3 个模式，靠手点是点不全的，
 * 而它一旦错了表现为「偶尔跳过一首」这种很难复现的现象。
 *
 * ⚠️ 注意它**不是只读的**：`delta === 1` 的随机模式会把 currentId 压进 history。
 * 所以想「只看一眼下一首是谁」而不能改动播放进度时，用下面的 `peekNextSong`，
 * 别直接调它再把结果丢掉 —— 那会白白消耗一次洗牌进度（播放器预取时踩过）。
 */
export function resolveStep(input: StepInput): StepResult {
  const { mode, queueIds, currentId, delta } = input
  const history = [...(input.history ?? [])]

  if (queueIds.length === 0) {
    return { nextId: null, shuffleOrderIds: input.shuffleOrderIds ?? [], history }
  }

  // 随机模式往回走：优先退历史，历史空了才退回乱序里的前一首
  if (mode === "shuffle" && delta === -1) {
    const backId = history.pop()
    if (backId !== undefined && queueIds.includes(backId)) {
      return { nextId: backId, shuffleOrderIds: input.shuffleOrderIds ?? [], history }
    }
  }

  let order = input.shuffleOrderIds ?? []
  if (mode === "shuffle") {
    if (order.length === 0) order = buildShuffleOrder(queueIds.map((id) => ({ id })), currentId)
  } else {
    order = queueIds
  }

  const index = order.indexOf(currentId)
  // 当前歌不在队列里（例如队列刚被换掉）：从头或从尾开始，别什么都不做
  const nextIndex = index < 0 ? (delta > 0 ? 0 : order.length - 1) : index + delta

  // 顺序播放走到底就停 —— 站长明确不要「列表循环」这个模式
  if (nextIndex < 0 || nextIndex >= order.length) {
    return { nextId: null, shuffleOrderIds: order, history }
  }

  if (mode === "shuffle" && delta === 1) history.push(currentId)
  return { nextId: order[nextIndex], shuffleOrderIds: order, history }
}

/**
 * 「只看一眼下一首是谁」，**不改动任何播放进度**。
 *
 * 为什么需要它：播放器要在开始播一首之后**预取下一首**的地址，
 * 而预取只是一个优化 —— 它绝不能影响真正的播放顺序。
 *
 * 直接调 `resolveStep` 再把结果丢掉是不行的：随机模式下它会把当前歌
 * 压进 history，于是「预取」变成了一次隐式的「前进」，之后真正按下一首
 * 时算出来的歌就可能与预取的不是同一首（预取永远打不中，白耗配额），
 * 而且 history 会被污染、随机播放的返回顺序错乱。
 *
 * 实现上**故意不复用 resolveStep**：要给 shuffleOrder / history 传副本，
 * 并在拿到结果后丢弃它们。这样「只看不改」的意图是明确写在代码里的，
 * 而不是依赖调用方记得别用返回值。
 */
export function peekNextSong(input: StepInput): number | null {
  const result = resolveStep({
    ...input,
    // 传副本，resolveStep 内部对它们的改动不会影响调用方持有的那份
    shuffleOrderIds: [...(input.shuffleOrderIds ?? [])],
    history: [...(input.history ?? [])],
  })
  return result.nextId
}
