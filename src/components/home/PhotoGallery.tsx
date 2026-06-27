import Image from "next/image"

// Placeholder gallery — replace with real photos
const photos: { src: string; alt: string }[] = []

export default function PhotoGallery() {
  // Show placeholder state if no photos
  if (photos.length === 0) {
    return (
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-gray-900">生活相册</h2>
            <div className="w-16 h-1 bg-accent mx-auto mt-4 rounded-full" />
          </div>
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">📸 照片即将上线，敬请期待</p>
            <p className="text-sm mt-2">
              你可以在后台管理中上传照片
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-gray-900">生活相册</h2>
          <div className="w-16 h-1 bg-accent mx-auto mt-4 rounded-full" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo, index) => (
            <div
              key={index}
              className="relative aspect-square rounded-xl overflow-hidden group cursor-pointer"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
