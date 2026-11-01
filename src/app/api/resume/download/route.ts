import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readFile } from "fs/promises"
import path from "path"

// 简历下载公开（简历页面本身就是公开的，PDF 内容一致）
export async function GET() {
  try {
    const profile = await prisma.resumeProfile.findFirst()
    if (!profile?.resumePdf) {
      return NextResponse.json(
        { error: "暂无简历文件" },
        { status: 404 }
      )
    }

    /*
     * resumePdf 来自数据库（只能由站长后台写入），但仍然要规范化：
     * 万一该值被写成 `../dev.db`（例如从被篡改的备份恢复），
     * 直接拼路径会读到 data/ 之外的任意文件。
     * 这里做两件事：path.basename 去掉任何目录成分，再确认解析结果仍在 data/ 内。
     */
    const dataDir = path.join(process.cwd(), "data")
    const filePath = path.resolve(dataDir, path.basename(profile.resumePdf))
    if (!filePath.startsWith(dataDir + path.sep)) {
      return NextResponse.json({ error: "简历文件路径不合法" }, { status: 400 })
    }

    // 库里有记录但文件不在了（例如手动删过）是正常状态，用 404 表达，不要落成 500
    // 注意不要给这个变量手写 `Buffer` 类型注解：泛型会退化成 ArrayBufferLike，NextResponse 不接受
    const buffer = await readFile(filePath).catch(() => null)
    if (!buffer) {
      return NextResponse.json({ error: "简历文件不存在" }, { status: 404 })
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume-${profile.name || "lankhub"}.pdf"`,
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error("Download error:", error)
    return NextResponse.json(
      { error: "下载失败" },
      { status: 500 }
    )
  }
}
