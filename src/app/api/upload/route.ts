import { NextRequest, NextResponse } from "next/server"
import { requireOwner } from "@/lib/auth-helpers"
import { writeFile, mkdir } from "fs/promises"
import path from "path"

export async function POST(req: NextRequest) {
  const authError = await requireOwner()
  if (authError) return authError

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json(
        { error: "请选择要上传的文件" },
        { status: 400 }
      )
    }

    // Validate file type
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

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg"
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), "data", "uploads", "images")
    await mkdir(uploadDir, { recursive: true })

    // Write file
    const buffer = Buffer.from(await file.arrayBuffer())
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
