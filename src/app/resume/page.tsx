import type { Metadata } from "next"
import ResumeHeader from "@/components/resume/ResumeHeader"
import LeftColumn from "@/components/resume/LeftColumn"
import RightColumn from "@/components/resume/RightColumn"
import ResumeFooter from "@/components/resume/ResumeFooter"

export const metadata: Metadata = {
  title: "简历",
}

export default function ResumePage() {
  return (
    <div className="min-h-[70vh]">
      <ResumeHeader />
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <LeftColumn />
          <RightColumn />
        </div>
      </div>
      <ResumeFooter />
    </div>
  )
}
