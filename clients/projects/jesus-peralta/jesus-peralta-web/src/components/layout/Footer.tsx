import Image from 'next/image'

export default function Footer() {
  return (
    <footer className="bg-bg border-t border-border py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Image src="/logo.png" alt="Jesús Peralta Peluqueros" width={36} height={36} className="opacity-50 object-contain" />
        <p className="text-xs text-muted text-center" style={{ letterSpacing: '0.05em' }}>
          © {new Date().getFullYear()} Jesús Peralta Peluqueros · Madrid
        </p>
        <a
          href="tel:+34691570085"
          className="text-xs text-accent hover:text-accent-light transition-colors"
          style={{ letterSpacing: '0.05em' }}
        >
          +34 691 570 085
        </a>
      </div>
    </footer>
  )
}
