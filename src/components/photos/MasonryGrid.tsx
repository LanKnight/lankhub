import Image from "next/image"

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
          className="mb-4 break-inside-avoid rounded-xl overflow-hidden bg-gray-100 cursor-pointer group"
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
        </div>
      ))}
    </div>
  )
}
