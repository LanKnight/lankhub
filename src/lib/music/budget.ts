import type { BudgetConfig } from "./types"

/**
 * 统一的限流闸门（滑窗 + 最小间隔）。
 *
 * 为什么单独抽出来：之前三个源各自写了一遍（GD 在 music-api.ts、QQ 在 music-qq.ts、
 * 探活那层又一套），参数还互不一致，改一处漏两处。现在一个实现、配置由 registry 给。
 *
 * 注意这是**自限流**：主动比上游的官方限制更保守，避免把公共接口打到发火。
 */

export interface BudgetSnapshot {
  used: number
  limit: number
  remaining: number
  /** 还要等多久窗口才滚动（毫秒） */
  windowRemainingMs: number
}

export interface Budget {
  take(): Promise<boolean>
  snapshot(): BudgetSnapshot
}

export function createBudget(config: BudgetConfig): Budget {
  const calls: number[] = []
  let lastAt = 0

  const prune = (now: number) => {
    while (calls.length > 0 && now - calls[0] > config.windowMs) calls.shift()
  }

  return {
    async take() {
      const now = Date.now()
      prune(now)
      if (calls.length >= config.limit) return false

      const gap = now - lastAt
      if (config.gapMs > 0 && gap < config.gapMs) {
        await new Promise((resolve) => setTimeout(resolve, config.gapMs - gap))
      }
      lastAt = Date.now()
      calls.push(lastAt)
      return true
    },

    snapshot() {
      const now = Date.now()
      prune(now)
      return {
        used: calls.length,
        limit: config.limit,
        remaining: Math.max(0, config.limit - calls.length),
        windowRemainingMs: calls.length > 0 ? Math.max(0, config.windowMs - (now - calls[0])) : 0,
      }
    },
  }
}
