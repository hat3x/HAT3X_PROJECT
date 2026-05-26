'use client'

import { useEffect, useRef } from 'react'

export default function Contact() {
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
      { threshold: 0.1 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="contacto" className="py-24 px-6 bg-bg">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-accent text-xs uppercase mb-4" style={{ letterSpacing: '0.35em' }}>
            Visítanos
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-light text-[#F0F0F0]">Contacto</h2>
        </div>

        <div ref={ref} className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted mb-1">Dirección</p>
                <p className="text-[#F0F0F0]/80 text-sm">C/ José Abascal 61, 28003 Madrid</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted mb-1">Teléfono</p>
                <a href="tel:+34691570085" className="text-accent hover:text-accent-light transition-colors text-sm">
                  +34 691 570 085
                </a>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted mb-1">Email</p>
                <a
                  href="mailto:jesusperaltapeluqueros@gmail.com"
                  className="text-accent hover:text-accent-light transition-colors text-sm"
                >
                  jesusperaltapeluqueros@gmail.com
                </a>
              </div>
            </div>

            <table className="text-sm w-full max-w-xs" aria-label="Horario del salón">
              <caption className="text-xs uppercase tracking-widest text-muted mb-3 text-left">Horario</caption>
              <tbody className="flex flex-col gap-2">
                {[
                  ['Lunes — Viernes', '9:30 – 20:00'],
                  ['Sábado', '9:30 – 18:00'],
                  ['Domingo', 'Cerrado'],
                ].map(([day, time]) => (
                  <tr key={day} className="flex justify-between">
                    <td className="text-[#F0F0F0]/60">{day}</td>
                    <td className="font-serif text-accent">{time}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <a
              href="tel:+34691570085"
              className="inline-flex items-center justify-center px-8 py-4 text-sm tracking-widest uppercase bg-accent text-bg font-medium hover:bg-accent-light transition-colors duration-200 min-h-[44px] w-full sm:w-auto"
            >
              Reservar Cita
            </a>
          </div>

          <div className="relative aspect-video lg:aspect-auto lg:h-[420px] overflow-hidden border border-border">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3036.8!2d-3.6923!3d40.4359!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd4228a02c4cd5e1%3A0x1!2sCalle+Jos%C3%A9+Abascal+61%2C+Madrid!5e0!3m2!1ses!2ses!4v1"
              width="100%"
              height="100%"
              style={{ border: 0, filter: 'grayscale(100%) invert(90%) contrast(90%)' }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Ubicación Jesús Peralta Peluqueros"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
