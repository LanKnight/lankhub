"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { usePathname } from "next/navigation"

import { ANNOUNCEMENT, ANNOUNCEMENT_STORAGE_KEY } from "@/lib/announcement"
import AnnouncementDialog from "./AnnouncementDialog"

interface AnnouncementContextValue {
  /** 弹窗是否打开（顶栏的铃铛用它切换） */
  open: boolean
  /** 当前版本是否还没读过 —— 顶栏那个小红点看的就是它 */
  unseen: boolean
  show: () => void
  close: () => void
  /** 勾了「以后不再提示」并点确定时调用：记住版本号，顶栏小红点随之消失 */
  dismissForever: () => void
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null)

export function useAnnouncement(): AnnouncementContextValue {
  const ctx = useContext(AnnouncementContext)
  if (!ctx) throw new Error("useAnnouncement 必须在 AnnouncementProvider 内使用")
  return ctx
}

/* ------------------------------------------------------------------ *
 * "读过哪个版本"是一个**外部状态**（localStorage）。
 * 用 useSyncExternalStore 读它，而不是 useEffect + setState：
 * 后者会在挂载后多一次渲染，而且 eslint 会直接报
 * 「Calling setState synchronously within an effect」。
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>()

function subscribeToSeen(callback: () => void) {
  // 跨标签页同步：另一个标签页点过「不再提示」后，这个标签页的小红点也该消失
  const onStorage = (event: StorageEvent) => {
    if (event.key === ANNOUNCEMENT_STORAGE_KEY) callback()
  }
  window.addEventListener("storage", onStorage)
  listeners.add(callback)
  return () => {
    window.removeEventListener("storage", onStorage)
    listeners.delete(callback)
  }
}

function readSeenOnClient(): string | null {
  try {
    return localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY)
  } catch {
    // 隐私模式 / 禁用存储：当作没读过，但绝不抛错
    return null
  }
}

/**
 * 服务端渲染时假装"已经读过当前版本"。
 *
 * 这样 SSR 出来的 HTML 里没有小红点，等客户端拿到真实值再决定要不要显示：
 * 已读的用户不会看到"闪一下又消失"的红点，
 * 没读过的用户会看到它出现（绝对定位，不推动任何布局）。
 */
function readSeenOnServer(): string {
  return ANNOUNCEMENT.version
}

const AUTO_OPEN_DELAY_MS = 350

/**
 * 公告的状态中枢，只挂在根布局一次。
 *
 * 为什么需要 Provider：顶栏（铃铛、小红点）与首页（自动弹出）是两棵子树，
 * 但共享同一份状态 ——「这个版本读过没有」和「弹窗现在开没开」。
 * 分两处各读一次 localStorage 的话，用户点完确定后顶栏小红点不会消失。
 */
export default function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const seen = useSyncExternalStore(subscribeToSeen, readSeenOnClient, readSeenOnServer)
  const unseen = seen !== ANNOUNCEMENT.version
  const [open, setOpen] = useState(false)
  /** 本次进入首页时是否已经自动弹过，避免同一页反复弹 */
  const autoShownFor = useRef<string | null>(null)

  // 只在首页自动弹；已经读过的版本不再打扰
  useEffect(() => {
    if (pathname !== "/" || !unseen) return
    if (autoShownFor.current === pathname) return
    autoShownFor.current = pathname
    /*
     * 延迟一点点再弹：首屏那套水墨场景有一百多毫秒的入场，
     * 一进来就盖个弹窗会显得很急。放在 setTimeout 里（而不是 effect 体内直接 setState）
     * 同时也避开了「同步 setState in effect」。
     */
    const timer = window.setTimeout(() => setOpen(true), AUTO_OPEN_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [pathname, unseen])

  const show = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

  const dismissForever = useCallback(() => {
    try {
      localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, ANNOUNCEMENT.version)
    } catch {
      // 存不进去也不影响这次关闭
    }
    // 通知 useSyncExternalStore 重新取快照（同一标签页内不会有 storage 事件）
    listeners.forEach((notify) => notify())
    setOpen(false)
  }, [])

  const value = useMemo(
    () => ({ open, unseen, show, close, dismissForever }),
    [open, unseen, show, close, dismissForever]
  )

  return (
    <AnnouncementContext.Provider value={value}>
      {children}
      <AnnouncementDialog open={open} onClose={close} onDismissForever={dismissForever} />
    </AnnouncementContext.Provider>
  )
}
