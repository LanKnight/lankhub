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
