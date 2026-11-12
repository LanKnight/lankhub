"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

export interface MomentImageView {
  url: string
  width?: number | null
  height?: number | null
}

/**
 * 动态里的图片：瀑布流排列 + 点击放大。
 *
 * 排版原则（站长定的）：**一张都不裁**。
 *  - 1 张：满宽、按原始比例
 *  - 多张：瀑布流（手机 2 列 / 桌面 3 列），每张按自身比例，空间自然排满
 *
 * 为什么不用固定方块 + object-cover：那样竖图和长图会被裁掉主体
 * （之前"图片显示不完整"就是这么来的）。
 *
 * 每张图用宽高预留比例，加载时不会把下面的内容顶来顶去（CLS）。
 * 没有宽高信息（老数据）时退回自然高度。
 */
export default function MomentImages({
  images,
  alt,
}: {
  images: MomentImageView[]
  alt: string
}) {
  const [active, setActive] = useState<number | null>(null)

  /*
   * 列数：手机 2 列、≥640px 3 列。
   * 用 JS 而不是 CSS `columns-*`：CSS 多列按"高度平衡"分配，3 张图又有一张长图时
   * 会只用 2 列、第 3 列留白（实测就是左边压重、右边空一块）。
   * 这里按每张图的真实比例做贪心分配（谁最短就往谁那列放），能把列填满。
   */
  const [colCount, setColCount] = useState(2)

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)")
    const apply = () => setColCount(mq.matches ? 3 : 2)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  const columns = useMemo(() => {
    const buckets: { image: MomentImageView; index: number }[][] = Array.from(
      { length: colCount },
      () => []
    )
    const heights = new Array(colCount).fill(0)

    images.forEach((image, index) => {
      // 高度用「高/宽」的比值近似即可（列宽相同，等比缩放不影响分配结果）
      const ratio = image.width && image.height ? image.height / image.width : 1
      let target = 0
      for (let i = 1; i < colCount; i++) {
        if (heights[i] < heights[target]) target = i
      }
      buckets[target].push({ image, index })
      heights[target] += ratio
    })

    return buckets
  }, [images, colCount])

  const close = useCallback(() => setActive(null), [])
  const step = useCallback(
    (delta: number) => {
      setActive((current) => {
        if (current === null) return current
        const next = (current + delta + images.length) % images.length
        return next
      })
    },
    [images.length]
  )

  // 放大层：Esc 关闭、←/→ 切换、锁页面滚动
  useEffect(() => {
    if (active === null) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
      else if (event.key === "ArrowLeft") step(-1)
      else if (event.key === "ArrowRight") step(1)
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [active, close, step])

  if (images.length === 0) return null

  const ratioOf = (image: MomentImageView) =>
    image.width && image.height ? `${image.width} / ${image.height}` : undefined

  const thumb = (image: MomentImageView, index: number, className: string) => (
    <button
      key={`${image.url}-${index}`}
      type="button"
      onClick={() => setActive(index)}
      className={`block overflow-hidden rounded-xl bg-gray-100 ${className}`}
      aria-label={`查看第 ${index + 1} 张图片`}
    >
      {/* 本站上传接口的图片；外链已在编辑器侧拦截 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.url}
        alt={alt}
        loading="lazy"
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        style={ratioOf(image) ? { aspectRatio: ratioOf(image) } : undefined}
        className="h-auto w-full"
      />
    </button>
  )

  return (
    <>
      {images.length === 1 ? (
        <div className="mt-4">{thumb(images[0], 0, "w-full")}</div>
      ) : (
        <div className="mt-4 flex items-start gap-2">
          {columns.map((bucket, columnIndex) => (
            <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-2" data-gallery-column>
              {bucket.map(({ image, index }) => thumb(image, index, "w-full"))}
            </div>
          ))}
        </div>
      )}

      {active !== null && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="查看图片"
          onClick={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="关闭"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          >
            <X size={20} />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="上一张"
                className="absolute left-3 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              >
                <ChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="下一张"
                className="absolute right-3 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
              >
                <ChevronRight size={22} />
              </button>
            </>
          )}

          {/* 放大层里也不裁：整张图完整显示 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[active].url}
            alt={alt}
            className="max-h-[88vh] max-w-[92vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />

          {images.length > 1 && (
            <span className="absolute bottom-4 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
              {active + 1} / {images.length}
            </span>
          )}
        </div>
      )}
    </>
  )
}
