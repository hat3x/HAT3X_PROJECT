'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'

export default function Hero() {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const subtitleRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const elements = [titleRef.current, subtitleRef.current, ctaRef.current]
    elements.forEach((el, i) => {
      if (!el) return
      el.style.opacity = '0'
      el.style.transform = 'translateY(24px)'
      setTimeout(() => {
        if (!el) return
        el.style.transition = 'opacity 0.8s ease, transform 0.8s ease'
        el.style.opacity = '1'
        el.style.transform = 'translateY(0)'
      }, 200 + i * 150)
    })
  }, [])

  return (
    <section
      id="inicio"
      className="relative min-h-dvh flex items-center justify-center overflow-hidden"
      aria-label="Sección principal"
    >
      <div className="absolute inset-0">
        <Image
          src="/salon.jpeg"
          alt="Interior del salón Jesús Peralta Peluqueros"
          fill
          className="object-cover"
          style={{ objectPosition: 'center 30%' }}
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/80 via-bg/65 to-bg/90" />
      </div>

      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto pt-20">
        <p className="text-accent text-xs uppercase mb-8 font-sans" style={{ letterSpacing: '0.4em' }}>
          Madrid · C/ José Abascal 61
        </p>

        <h1
          ref={titleRef}
          className="font-serif font-light text-[#F0F0F0] leading-none mb-3"
          style={{ fontSize: 'clamp(3rem, 10vw, 7rem)' }}
        >
          Jesús Peralta
        </h1>

        <p
          ref={subtitleRef}
          className="font-serif font-light text-accent uppercase mb-14"
          style={{ fontSize: 'clamp(1rem, 3vw, 1.75rem)', letterSpacing: '0.4em' }}
        >
          Peluqueros
        </p>

        <div ref={ctaRef} className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="tel:+34691570085"
            className="px-8 py-4 text-sm tracking-widest uppercase bg-accent text-bg font-medium hover:bg-accent-light transition-colors duration-200 min-h-[44px] flex items-center justify-center"
          >
            Reservar Cita
          </a>
          <a
            href="#servicios"
            className="px-8 py-4 text-sm tracking-widest uppercase border border-[#F0F0F0]/40 text-[#F0F0F0]/70 hover:border-[#F0F0F0] hover:text-[#F0F0F0] transition-colors duration-200 min-h-[44px] flex items-center justify-center"
          >
            Ver Servicios
          </a>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40" aria-hidden="true">
        <span className="text-xs text-[#F0F0F0]" style={{ letterSpacing: '0.2em' }}>SCROLL</span>
        <div className="w-px h-12 bg-gradient-to-b from-[#F0F0F0] to-transparent" />
      </div>
    </section>
  )
}
