import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser, hasPermission } from "@/lib/auth-helpers"
import { writeFile, mkdir } from "fs/promises"
import path from "path"
import crypto from "crypto"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { isAllowedImage } from "@/lib/file-type"

export async function POST(req: NextRequest) {
  // 站长或拥有任一内容权限（文章/相册/拾章）的读者可上传图片
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 })
  }
  const hasContentPerm =
    hasPermission(user, "article") ||
    hasPermission(user, "photo") ||
    hasPermission(user, "poem")
  if (!hasContentPerm) {
    return NextResponse.json({ error: "无权限上传" }, { status: 403 })
  }

  // 频率限制：每用户每分钟最多 10 次上传
  const ip = getClientIp(req.headers)
  const limitResult = rateLimit(`upload:${ip}`, 10, 60 * 1000)
  if (!limitResult.allowed) {
    return NextResponse.json(
      { error: "上传过于频繁，请稍后再试" },
      { status: 429 }
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "请选择要上传的文件" },
        { status: 400 }
      )
    }

    // Validate file type (client claim, as first pass)
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "仅支持 JPG、PNG、GIF、WebP 格式的图片" },
        { status: 400 }
      )
    }

    // 文件大小限制 10MB
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "图片大小不能超过 10MB" },
        { status: 400 }
      )
    }

    // 读取文件内容并进行 magic byte 校验
    const buffer = Buffer.from(await file.arrayBuffer())
    const detected = isAllowedImage(buffer)
    if (!detected) {
      return NextResponse.json(
        { error: "文件内容与声称的类型不匹配" },
        { status: 400 }
      )
    }

    // 使用安全的扩展名和文件名
    const filename = `${Date.now()}-${crypto.randomUUID()}.${detected.ext}`

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "data", "uploads", "images")
    await mkdir(uploadDir, { recursive: true })

    // Write file
    const filePath = path.join(uploadDir, filename)
    await writeFile(filePath, buffer)

    const url = `/api/images/${filename}`

    return NextResponse.json({ url }, { status: 201 })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: "上传失败，请稍后重试" },
      { status: 500 }
    )
  }
}
