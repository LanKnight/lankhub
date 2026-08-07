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

    const filePath = path.join(process.cwd(), "data", profile.resumePdf)
    const buffer = await readFile(filePath)

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
