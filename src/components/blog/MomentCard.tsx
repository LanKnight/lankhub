import { formatDate } from "@/lib/utils"

export interface MomentImageProp {
  url: string
  width?: number | null
  height?: number | null
}

export interface MomentCardProps {
  /** moment = 图文动态；poem = 诗句 */
  kind?: "moment" | "poem"
  /** 主题（原相册分类的显示名，如「码砚」） */
  topic?: string | null
  title?: string | null
  /** 正文 / 描述 / 诗句内容 */
  text?: string | null
  images?: MomentImageProp[]
  /** 已格式化的日期字符串 */
  createdAt: string
  /** 诗句作者与出处（仅 kind=poem） */
  poemAuthor?: string | null
  poemSource?: string | null
}

/**
 * 一条动态的卡片。
 *
 * 这一版（P2）先由相册的旧数据驱动；P3 换成「动态」表之后，
 * 组件的入参形状保持不变 —— 这样迁移时前端不用重写。
 *
 * 图片布局按张数自适应：
 *  - 1 张：大图（16:9 裁切）
 *  - 2 张：两列
 *  - ≥3 张：三列方格
 */
export default function MomentCard({
  kind = "moment",
  topic,
  title,
  text,
  images = [],
  createdAt,
  poemAuthor,
  poemSource,
}: MomentCardProps) {
  const isPoem = kind === "poem"

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {topic && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
              {topic}
            </span>
          )}
          {title && (
            <h2 className="truncate text-base font-bold text-gray-900">{title}</h2>
          )}
        </div>
        <time className="shrink-0 text-xs text-gray-400">{createdAt}</time>
      </header>

      {text && (
        <p
          className={`whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700 ${
            isPoem ? "font-serif text-[17px] leading-loose text-gray-800" : ""
          }`}
        >
          {text}
        </p>
      )}

      {images.length > 0 && (
        <div
          className={`mt-4 grid gap-2 ${
            images.length === 1
              ? "grid-cols-1"
              : images.length === 2
                ? "grid-cols-2"
                : "grid-cols-3"
          }`}
        >
          {images.map((image, index) => {
            /*
             * 单图不强行裁成 16:9：相册里有大量竖构图，硬裁会把主体切掉。
             * 有宽高就按真实比例显示（并限制最高 70vh），没有才退回 16:9。
             */
            const single = images.length === 1
            const ratio =
              single && image.width && image.height
                ? `${image.width} / ${image.height}`
                : null

            return (
              <div
                key={`${image.url}-${index}`}
                className="overflow-hidden rounded-xl bg-gray-100"
              >
                {/* 图片来自本站上传接口（/api/images/...），外链已在编辑器侧拦截 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={title ?? topic ?? `动态配图 ${index + 1}`}
                  loading="lazy"
                  style={ratio ? { aspectRatio: ratio } : undefined}
                  className={
                    single
                      ? `w-full object-cover ${ratio ? "max-h-[70vh]" : "aspect-[16/9]"}`
                      : "aspect-square w-full object-cover"
                  }
                />
              </div>
            )
          })}
        </div>
      )}

      {isPoem && (poemAuthor || poemSource) && (
        <footer className="mt-3 text-right text-sm text-gray-500">
          {poemAuthor && <span>—— {poemAuthor}</span>}
          {poemSource && <span className="ml-2 text-gray-400">《{poemSource}》</span>}
        </footer>
      )}
    </article>
  )
}
