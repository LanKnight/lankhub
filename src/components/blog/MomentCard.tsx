import MomentComments from "./MomentComments"
import MomentImages from "./MomentImages"

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
  /** 评论入口：传了才显示（旧兼容模式没有动态 id，就不显示） */
  comments?: { momentId: number; count: number }
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
  comments,
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
        <MomentImages images={images} alt={title ?? topic ?? "动态配图"} />
      )}
      {isPoem && (poemAuthor || poemSource) && (
        <footer className="mt-3 text-right text-sm text-gray-500">
          {poemAuthor && <span>—— {poemAuthor}</span>}
          {poemSource && <span className="ml-2 text-gray-400">《{poemSource}》</span>}
        </footer>
      )}

      {comments && (
        <MomentComments momentId={comments.momentId} count={comments.count} />
      )}
    </article>
  )
}
