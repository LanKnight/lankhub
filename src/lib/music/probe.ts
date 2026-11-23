const PROBE_TIMEOUT_MS = 6000

const debugEnabled = process.env.MUSIC_DEBUG === "1"

/**
 * 探活：真取一小段音频，确认这个地址**现在**就能播。
 *
 * 为什么不能只看接口返回：QQ 的 vkey 过期会回 403（响应头仍是 audio/mp4），
 * 网易云的签名过期会回 404，Meting 也可能直接 5xx。拿到 JSON 不等于能播。
 *
 * 只取 2KB：够判断状态码与 content-type，又不至于把整首歌拉下来。
 */
export async function probeAudio(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-2047", "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: "no-store",
    })
    if (res.status !== 200 && res.status !== 206) {
      if (debugEnabled) console.info("[music] probe fail status", res.status, url.slice(0, 60))
      return false
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase()
    // 有的 CDN 对 Range 请求不给 content-type，只要状态码对就放行
    if (type && !type.startsWith("audio/") && !type.includes("octet-stream")) {
      if (debugEnabled) console.info("[music] probe fail type", type, url.slice(0, 60))
      return false
    }
    await res.arrayBuffer()
    return true
  } catch (error) {
    if (debugEnabled) console.info("[music] probe error", (error as Error).message.slice(0, 60))
    return false
  }
}
