"use client"

import { useEffect, useRef } from "react"
import { signOut, useSession } from "next-auth/react"

/**
 * 会话失效守卫：**账号被删除后，把浏览器里那个没用的 cookie 清掉**。
 *
 * 背景（实测过的缺口）：
 * Auth.js 用的是 JWT 会话，**token 一经签发就在有效期内一直有效**，
 * 服务端无法主动吊销。所以账号被删掉之后，那个 cookie 仍然是
 * 「合法签名 + 仍在有效期」，只是它指向的用户已经不存在了。
 *
 * 服务端那一半已经在 `getCurrentUser()` 与 session 回调里修好了
 * （见 auth-helpers.ts 与 auth.ts）：删号后所有需要登录的接口都会 401。
 * 但**cookie 本身还在**，于是每次请求都白跑一趟、页面也一直显示「已登录」的残影。
 * 这个组件负责把那个 cookie 清掉。
 *
 * ⚠️ 判定规则必须满足一条：**绝不能把「正在登录」误判成「会话失效」**，
 * 否则刚登录就被踢出去。这里用两道条件与在一起：
 *
 *   1. 本次页面生命周期内**曾经**见过已登录状态（status 变成过 authenticated）
 *   2. 现在变成了 unauthenticated
 *
 * 为什么不做「有 cookie 但未登录就清」：用户点登录的那一瞬间正是这个状态
 * （请求还没回来），那样会把正常的登录流程打断。
 *
 * 能覆盖到的场景：被删号的用户刷新页面，或点了任何需要登录的功能 ——
 * 客户端会去取一次会话，拿回未登录，于是 cookie 被清掉。
 * 覆盖不到的场景（如实说明）：用户一直不刷新、也不触发任何会话刷新，
 * 那他看到的只是「功能用不了」，cookie 要等到下次会话刷新才会被清。
 * 这不影响安全性 —— 服务端已经全部按未登录处理了。
 */
export default function SessionGuard() {
  const { status } = useSession()
  /** 本次会话是否曾经处于已登录状态 */
  const wasAuthenticated = useRef(false)
  /** 防止 signOut 被重复触发 */
  const signingOut = useRef(false)

  useEffect(() => {
    if (status === "authenticated") {
      wasAuthenticated.current = true
      return
    }

    if (status === "unauthenticated" && wasAuthenticated.current && !signingOut.current) {
      signingOut.current = true
      /*
       * 用 signOut 而不是手动清 cookie：
       * 它会同时清掉 next-auth 的会话与 CSRF cookie，并通知所有 useSession 订阅者。
       * redirect: false —— 不跳页，用户留在原地（多半正在看某个页面），
       * 只是从「已登录」变成「未登录」。
       */
      void signOut({ redirect: false })
    }
  }, [status])

  return null
}
