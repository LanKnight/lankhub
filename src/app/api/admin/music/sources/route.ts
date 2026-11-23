import { NextRequest, NextResponse } from "next/server"

import { requireOwner } from "@/lib/auth-helpers"
import { healthSnapshot, probeProvider } from "@/lib/music/health"
import type { ProviderId } from "@/lib/music/types"

/**
 * 音乐源状态。
 *  GET  → 每个源的配置、预算余量、健康计数
 *  POST → 对某个源做一次真实探活（会占用它的配额）
 */
export async function GET() {
  const authError = await requireOwner()
  if (authError) return authError
  return NextResponse.json({ sources: healthSnapshot() })
}

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const provider = body?.provider as ProviderId | undefined
  if (!provider || !["gd", "tang", "meting"].includes(provider)) {
    return NextResponse.json({ error: "未知的音源" }, { status: 400 })
  }

  const result = await probeProvider(provider)
  return NextResponse.json({ provider, ...result })
}
