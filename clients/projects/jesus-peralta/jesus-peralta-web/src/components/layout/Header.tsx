'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

const navLinks = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#nosotros', label: 'Nosotros' },
  { href: '#contacto', label: 'Contacto' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-bg/95 backdrop-blur-sm border-b border-border' : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-20">
        {/* Banner logo — desktop shows full wordmark, mobile shows icon only */}
        <Link href="#inicio" aria-label="Jesús Peralta Peluqueros — Inicio">
          <Image
            src="/banner.png"
            alt="Jesús Peralta Peluqueros"
            width={220}
            height={48}
            className="hidden sm:block h-10 w-auto object-contain"
            priority
          />
          <Image
            src="/logo.png"
            alt="JP"
            width={40}
            height={40}
            className="sm:hidden h-10 w-10 object-contain"
            priority
          />
        </Link>

        <nav className="hidden md:flex items-center gap-8" aria-label="Navegación principal">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs uppercase tracking-widest text-[#F0F0F0]/70 hover:text-[#F0F0F0] transition-colors duration-200"
            >
              {l.label}
            </a>
          ))}
          <a
            href="tel:+34691570085"
            className="px-5 py-2.5 text-xs uppercase tracking-widest bg-accent text-bg font-medium hover:bg-accent-light transition-colors duration-200 min-h-[44px] flex items-center"
          >
            Reservar
          </a>
        </nav>

        <button
          className="md:hidden flex flex-col gap-1.5 p-2 min-h-[44px] min-w-[44px] items-center justify-center"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label="Abrir menú"
        >
          <span className={`block w-5 h-px bg-[#F0F0F0] transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-[5px]' : ''}`} />
          <span className={`block w-5 h-px bg-[#F0F0F0] transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
          <span className={`block w-5 h-px bg-[#F0F0F0] transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-[5px]' : ''}`} />
        </button>
      </div>

      <div
        className={`md:hidden overflow-hidden transition-all duration-300 bg-bg/98 border-b border-border ${
          menuOpen ? 'max-h-64' : 'max-h-0'
        }`}
      >
        <nav className="px-6 py-4 flex flex-col gap-4" aria-label="Menú móvil">
          {navLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="text-sm uppercase tracking-widest text-[#F0F0F0]/70 hover:text-[#F0F0F0] transition-colors min-h-[44px] flex items-center"
            >
              {l.label}
            </a>
          ))}
          <a
            href="tel:+34691570085"
            className="text-sm uppercase tracking-widest text-accent hover:text-accent-light transition-colors min-h-[44px] flex items-center"
          >
            Reservar Cita →
          </a>
        </nav>
      </div>
    </header>
  )
}
