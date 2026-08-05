"use client"

import { useState } from "react"
import MasonryGrid from "@/components/photos/MasonryGrid"
import PhotoLightbox from "@/components/photos/PhotoLightbox"

interface PhotoItem {
  id: number
  url: string
  title: string | null
  description: string | null
  width: number | null
  height: number | null
}

interface PhotoGridProps {
  photos: PhotoItem[]
  categoryLabel: string
}

export default function PhotoGrid({ photos, categoryLabel }: PhotoGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <>
      <MasonryGrid
        photos={photos}
        categoryLabel={categoryLabel}
        onPhotoClick={(index) => setOpenIndex(index)}
      />
      {openIndex !== null && (
        <PhotoLightbox
          photos={photos}
          currentIndex={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={(index) => setOpenIndex(index)}
        />
      )}
    </>
  )
}
