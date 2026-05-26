'use client'

import { useEffect, useRef } from 'react'

const categories = [
  {
    title: 'Peluquería',
    description: 'Servicios para mujer',
    services: [
      { name: 'Color', price: '28€' },
      { name: 'Color orgánico', price: '36€' },
      { name: 'Mechas', price: null },
      { name: 'Barros de color', price: null },
      { name: 'Alisados', price: null },
      { name: 'Hidrataciones', price: null },
      { name: 'Peinados', price: null },
      { name: 'Cortes', price: null },
    ],
  },
  {
    title: 'Caballeros',
    description: 'Servicios para hombre',
    services: [{ name: 'Corte de caballero', price: null }],
  },
  {
    title: 'Estética',
    description: 'Belleza y tratamientos',
    services: [
      { name: 'Manicura normal', price: null },
      { name: 'Manicura permanente', price: null },
      { name: 'Pedicura normal', price: null },
      { name: 'Pedicura permanente', price: null },
      { name: 'Limpieza facial', price: null },
      { name: 'Tratamientos corporales', price: null },
    ],
  },
]

function ServiceCard({ category, index }: { category: (typeof categories)[0]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            if (!el) return
            el.style.transition = 'opacity 0.7s ease, transform 0.7s ease'
            el.style.opacity = '1'
            el.style.transform = 'translateY(0)'
          }, index * 120)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )
    el.style.opacity = '0'
    el.style.transform = 'translateY(28px)'
    observer.observe(el)
    return () => observer.disconnect()
  }, [index])

  return (
    <div
      ref={cardRef}
      className="bg-surface border border-border p-8 flex flex-col gap-6 hover:border-accent/40 transition-colors duration-300"
    >
      <div>
        <h3 className="font-serif text-2xl font-light text-[#F0F0F0] mb-1">{category.title}</h3>
        <p className="text-xs text-muted uppercase tracking-widest">{category.description}</p>
        <div className="w-8 h-px bg-accent mt-4" aria-hidden="true" />
      </div>

      <ul className="flex flex-col gap-0" role="list">
        {category.services.map((service) => (
          <li
            key={service.name}
            className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
          >
            <span className="text-sm text-[#F0F0F0]/80">{service.name}</span>
            {service.price && (
              <span className="text-sm text-accent font-medium tabular-nums">{service.price}</span>
            )}
          </li>
        ))}
      </ul>

      <a
        href="tel:+34691570085"
        className="mt-auto pt-2 text-xs tracking-widest uppercase text-accent hover:text-accent-light transition-colors min-h-[44px] flex items-center"
        aria-label={`Consultar precio de ${category.title}`}
      >
        Consultar precio →
      </a>
    </div>
  )
}

export default function Services() {
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = headingRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.transition = 'opacity 0.7s ease, transform 0.7s ease'
          el.style.opacity = '1'
          el.style.transform = 'translateY(0)'
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )
    el.style.opacity = '0'
    el.style.transform = 'translateY(28px)'
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="servicios" className="py-24 px-6 bg-bg">
      <div className="max-w-6xl mx-auto">
        <div ref={headingRef} className="text-center mb-16">
          <p className="text-accent text-xs uppercase mb-4" style={{ letterSpacing: '0.35em' }}>
            Lo que ofrecemos
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-light text-[#F0F0F0]">Servicios</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {categories.map((cat, i) => (
            <ServiceCard key={cat.title} category={cat} index={i} />
          ))}
        </div>

        <p className="text-center text-xs text-muted mt-10" style={{ letterSpacing: '0.05em' }}>
          Consulta disponibilidad llamando al{' '}
          <a href="tel:+34691570085" className="text-accent hover:text-accent-light transition-colors">
            +34 691 570 085
          </a>
        </p>
      </div>
    </section>
  )
}
