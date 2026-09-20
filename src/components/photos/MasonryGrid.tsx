import Image from "next/image"

import { staggerDelay } from "@/lib/motion"

interface PhotoItem {
  id: number
  url: string
  title: string | null
  description: string | null
  width: number | null
  height: number | null
}

interface MasonryGridProps {
  photos: PhotoItem[]
  categoryLabel: string
  onPhotoClick: (index: number) => void
}

export default function MasonryGrid({
  photos,
  categoryLabel,
  onPhotoClick,
}: MasonryGridProps) {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
      {photos.map((photo, index) => (
        <div
          key={photo.id}
          className="mb-4 break-inside-avoid rounded-xl overflow-hidden bg-gray-100 cursor-pointer group relative animate-rise-in"
          style={{ animationDelay: staggerDelay(index) }}
          onClick={() => onPhotoClick(index)}
        >
          {photo.width && photo.height ? (
            <Image
              src={photo.url}
              alt={photo.title || `${categoryLabel} 照片`}
              width={photo.width}
              height={photo.height}
              className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.url}
              alt={photo.title || `${categoryLabel} 照片`}
              className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          )}

          {/* Hover 浮现标题/描述 */}
          {(photo.title || photo.description) && (
            <div className="absolute inset-x-0 bottom-0 px-4 py-3 bg-gradient-to-t from-black/70 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {photo.title && (
                <p className="text-sm font-medium text-white truncate">
                  {photo.title}
                </p>
              )}
              {photo.description && (
                <p className="text-xs text-white/80 mt-0.5 line-clamp-2">
                  {photo.description}
                </p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
