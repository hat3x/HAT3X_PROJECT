'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(28px)'
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transition = 'opacity 0.7s ease, transform 0.7s ease'
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          observer.disconnect()
        }
      },
      { threshold }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return ref
}

const hours = [
  { day: 'Lunes — Viernes', time: '9:30 – 20:00' },
  { day: 'Sábado', time: '9:30 – 18:00' },
  { day: 'Domingo', time: 'Cerrado' },
]

export default function About() {
  const textRef = useReveal()
  const imageRef = useReveal(0.1)

  return (
    <section id="nosotros" className="py-24 px-6 bg-surface">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div ref={textRef} className="flex flex-col gap-8">
          <div>
            <p className="text-accent text-xs uppercase mb-4" style={{ letterSpacing: '0.35em' }}>
              Nosotros
            </p>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-[#F0F0F0] leading-tight">
              Más de 20 años<br />cuidando tu imagen
            </h2>
          </div>

          <div className="flex flex-col gap-4 text-sm text-[#F0F0F0]/70 leading-relaxed max-w-md">
            <p>
              En Jesús Peralta Peluqueros llevamos más de dos décadas ofreciendo servicios de peluquería y
              estética de alta calidad en el corazón de Madrid.
            </p>
            <p>
              Nos especializamos en coloración orgánica, tratamientos capilares y servicios de estética,
              siempre con productos de primera calidad y un trato personalizado.
            </p>
          </div>

          <div className="border-t border-border pt-6">
            <p className="text-xs uppercase tracking-widest text-muted mb-4">Horario</p>
            <ul className="flex flex-col gap-2">
              {hours.map(({ day, time }) => (
                <li key={day} className="flex justify-between text-sm">
                  <span className="text-[#F0F0F0]/60">{day}</span>
                  <span className="font-serif text-accent">{time}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div ref={imageRef} className="relative">
          <div className="relative aspect-[4/5] overflow-hidden">
            <Image
              src="/salon.jpeg"
              alt="Interior del salón Jesús Peralta Peluqueros"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
          <div className="absolute -bottom-4 -left-4 w-24 h-24 border border-accent/40" aria-hidden="true" />
          <div className="absolute -top-4 -right-4 w-16 h-16 border border-accent/20" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
