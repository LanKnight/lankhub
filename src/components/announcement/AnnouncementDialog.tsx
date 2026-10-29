"use client"

import { useEffect, useRef, useState } from "react"
import { Bell, Mail, ShieldAlert, Sparkles, X } from "lucide-react"

import { ANNOUNCEMENT } from "@/lib/announcement"

interface AnnouncementDialogProps {
  open: boolean
  /** 关掉（不算"以后不再提示"） */
  onClose: () => void
  /** 勾了「以后不再提示」并点确定 */
  onDismissForever: () => void
}

/**
 * 站点公告弹窗。
 *
 * 为什么拆成 Dialog + Panel 两层：
 * 面板里的「以后不再提示」勾选框要**每次打开都复位**。
 * 如果放在 Dialog 里、用 effect 在 open 变化时 setState 复位，
 * 就是「同步 setState in effect」（会触发级联渲染，eslint 直接报错）。
 * 让 Panel 只在打开时挂载，组件卸载即丢状态 —— 复位是副作用，不需要写。
 */
export default function AnnouncementDialog({
  open,
  onClose,
  onDismissForever,
}: AnnouncementDialogProps) {
  if (!open) return null
  return <AnnouncementPanel onClose={onClose} onDismissForever={onDismissForever} />
}

function AnnouncementPanel({
  onClose,
  onDismissForever,
}: Omit<AnnouncementDialogProps, "open">) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  /*
   * 打开时：锁页面滚动、把焦点移进面板、Esc 关闭、Tab 焦点圈定。
   * 关闭（卸载）时全部还原，并把焦点还给触发它的那个元素（顶栏的铃铛）。
   */
  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    // 等一帧再聚焦，避免和入场动画抢
    const timer = window.setTimeout(() => panelRef.current?.focus(), 16)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      // 简易焦点圈定：Tab 到边界时回到另一端，别让焦点跑到背后的页面上
      if (event.key !== "Tab") return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input[type="checkbox"], [tabindex]:not([tabindex="-1"])'
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previousActive?.focus?.()
    }
  }, [onClose])

  const confirm = () => {
    if (dontShowAgain) onDismissForever()
    else onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      // 点遮罩关闭；点面板内部不关（stopPropagation 在面板上）
      onClick={onClose}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-gray-900/45 backdrop-blur-sm animate-announcement-fade" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-200 bg-paper shadow-2xl outline-none animate-announcement-rise"
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-gray-200 bg-paper/95 px-6 py-5 backdrop-blur">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-accent">
            <Bell size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="announcement-title" className="text-lg font-bold text-gray-900">
              {ANNOUNCEMENT.title}
            </h2>
            <p className="mt-0.5 text-xs text-gray-400">
              公告更新于 {ANNOUNCEMENT.updatedAt}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭公告"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        {/* 正文 */}
        <div className="px-6 py-5">
          <p className="text-sm leading-relaxed text-gray-600">{ANNOUNCEMENT.lead}</p>

          <div className="mt-5 space-y-5">
            {ANNOUNCEMENT.sections.map((section) => (
              <section key={section.title}>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  {section.title === "免责说明" && (
                    <ShieldAlert size={13} className="text-gray-400" />
                  )}
                  {section.title === "最近更新" && (
                    <Sparkles size={13} className="text-gray-400" />
                  )}
                  {section.title}
                </h3>
                {section.body && (
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">
                    {section.body}
                  </p>
                )}
                {section.list && (
                  <ul className="mt-2 space-y-1.5">
                    {section.list.map((item) => (
                      <li
                        key={item}
                        className="flex gap-2 text-sm leading-relaxed text-gray-600"
                      >
                        <span
                          aria-hidden
                          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gray-300"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {section.link && (
                  <a
                    href={section.link.href}
                    className="mt-1.5 inline-block text-sm text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                  >
                    {section.link.label}
                  </a>
                )}
              </section>
            ))}
          </div>

          {/* 联系方式就放在固定底栏里，而不是正文末尾：
              手机上正文往往要滚动，而"站长联系"是要一眼能看到的 */}
        </div>

        {/* 底部：站长联系 + 勾选 + 确定（sticky，永远可见） */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-paper/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Mail size={13} className="shrink-0 text-gray-400" />
            <span>联系站长</span>
            <a
              href={`mailto:${ANNOUNCEMENT.contact.email}`}
              className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-2 hover:text-accent hover:decoration-accent"
            >
              {ANNOUNCEMENT.contact.email}
            </a>
          </div>
          <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            以后不再提示（有新公告时仍会再提醒一次）
          </label>
          <button
            type="button"
            onClick={confirm}
            className="mt-3 w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
