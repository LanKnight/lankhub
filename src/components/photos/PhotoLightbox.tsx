"use client"

import { useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"

interface PhotoItem {
  id: number
  url: string
  title: string | null
  description: string | null
}

interface PhotoLightboxProps {
  photos: PhotoItem[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
}

export default function PhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
}: PhotoLightboxProps) {
  const photo = photos[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose()
          break
        case "ArrowLeft":
          if (hasPrev) onNavigate(currentIndex - 1)
          break
        case "ArrowRight":
          if (hasNext) onNavigate(currentIndex + 1)
          break
      }
    },
    [onClose, onNavigate, currentIndex, hasPrev, hasNext]
  )

  // Lock body scroll when open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown])

  if (!photo) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="关闭"
      >
        <X size={24} />
      </button>

      {/* Previous button */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex - 1)
          }}
          className="absolute left-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="上一张"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Image */}
      <div
        className="flex flex-col items-center max-w-[90vw] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.title || "照片"}
          className="max-w-full max-h-[75vh] object-contain rounded-lg"
        />
        {(photo.title || photo.description) && (
          <div className="mt-4 text-center text-white">
            {photo.title && (
              <p className="text-lg font-medium">{photo.title}</p>
            )}
            {photo.description && (
              <p className="text-sm text-gray-300 mt-1">{photo.description}</p>
            )}
          </div>
        )}
      </div>

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onNavigate(currentIndex + 1)
          }}
          className="absolute right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="下一张"
        >
          <ChevronRight size={32} />
        </button>
      )}

      {/* Counter */}
      <div className="absolute bottom-4 text-white/60 text-sm">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>
  )
}
