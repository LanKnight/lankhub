/**
 * 列表错峰入场的延迟。
 *
 * 超过 maxSteps 项之后不再累加：长列表末尾的内容否则要等一两秒才出现，
 * 而那时用户可能已经滚到那里，反而看不到入场过程。
 */
export function staggerDelay(index: number, step = 70, maxSteps = 8): string {
  return `${Math.min(index, maxSteps) * step}ms`
}
