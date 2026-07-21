import { NextRequest, NextResponse } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params

  // 安全防护：拒绝路径遍历攻击
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  // 根据扩展名确定 Content-Type
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const contentType = MIME_TYPES[ext]
  if (!contentType) {
    return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 })
  }

  try {
    // 优先从新路径 data/uploads/images/ 读取
    const primaryPath = path.join(process.cwd(), "data", "uploads", "images", filename)
    try {
      const buffer = await readFile(primaryPath)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": buffer.length.toString(),
        },
      })
    } catch {
      // 回退：兼容老路径 public/images/uploads/（迁移前上传的图片）
      const fallbackPath = path.join(process.cwd(), "public", "images", "uploads", filename)
      const buffer = await readFile(fallbackPath)
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": buffer.length.toString(),
        },
      })
    }
  } catch {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 })
  }
}
