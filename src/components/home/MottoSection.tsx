export default function MottoSection() {
  return (
    <section className="py-32 px-4 bg-gray-50/50">
      <div className="max-w-3xl mx-auto text-center">
        <blockquote className="space-y-6">
          <p className="text-2xl sm:text-3xl lg:text-4xl font-light text-gray-800 leading-relaxed tracking-wide">
            &ldquo;Stay hungry, stay foolish.&rdquo;
          </p>
          <p className="text-2xl sm:text-3xl lg:text-4xl font-light text-gray-800 leading-relaxed tracking-wide">
            &ldquo;求知若饥，虚心若愚。&rdquo;
          </p>
          <footer className="pt-8">
            <cite className="text-base text-gray-400 not-italic">
              — Steve Jobs
            </cite>
          </footer>
        </blockquote>
      </div>
    </section>
  )
}
