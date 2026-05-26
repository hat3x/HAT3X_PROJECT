# HAT3X Web — Diseño Completo
**Fecha:** 2026-04-09  
**Estado:** Aprobado por usuario  
**Versión:** 1.0

---

## 1. Resumen ejecutivo

Rediseño completo de hat3x.com como web B2B premium de consultoría e implementación de IA. El objetivo es posicionar HAT3X como firma tecnológica de alto nivel que ejecuta soluciones reales — no como consultoría genérica ni startup experimental.

**Mensaje central:** "NO TIENES QUE APRENDER IA. HAT3X LA IMPLEMENTA POR TI."

**CTAs primarios:** Reservar llamada (Calendly/Cal.com) + formulario de contacto  
**Social proof:** Ninguno disponible en lanzamiento — autoridad construida a través de diseño, copy y estructura  
**Assets de marca:** Logo existente en SVG/PNG + fuentes definidas  
**Stack decidido:** Next.js 14 + Tailwind CSS v4 + Framer Motion + TypeScript + Vercel

---

## 2. Dirección visual — Inmersiva Dark (Opción A)

### ADN visual
- **Estilo base:** Dark premium, minimalista potente, tecnológico
- **Sensación objetivo:** Firma tecnológica de lujo que ejecuta — como Linear, Vercel o Anthropic en su categoría
- **NO es:** startup caótica, web artística experimental, landing genérica, producto low-cost

### Paleta de color

| Token | Valor | Uso |
|---|---|---|
| `--purple-primary` | `#7C3AED` | CTA principal, acentos, hovers, glows |
| `--purple-light` | `#A78BFA` | Texto de acento, badges, labels |
| `--orange-accent` | `#EA580C` | Eyebrows, acentos secundarios, puntos de énfasis |
| `--orange-light` | `#FB923C` | Tags secundarios, detalles warm |
| `--base-black` | `#040408` | Fondo hero y secciones críticas |
| `--surface-1` | `#07070F` | Fondo general de página |
| `--surface-2` | `#0B0B16` | Fondo de secciones alternadas |
| `--surface-3` | `#111120` | Fondo de cards y elementos |
| `--border-subtle` | `#161626` | Bordes de cards (1px solid) |
| `--border-purple` | `rgba(124,58,237,0.2)` | Bordes con acento violeta |
| `--text-primary` | `#E2E2E8` | Texto principal |
| `--text-secondary` | `#888` | Texto secundario |
| `--text-muted` | `#555` | Texto terciario, subtítulos |
| `--text-ghost` | `#333` | Números, elementos decorativos |

### Tipografía

| Elemento | Fuente | Peso | Tamaño desktop | Letter-spacing |
|---|---|---|---|---|
| Display / H1 hero | Inter (o Geist) | 900 | 72–96px | -0.06em |
| H1 sección | Inter | 800–900 | 40–56px | -0.05em |
| H2 | Inter | 700 | 28–36px | -0.04em |
| H3 card | Inter | 700 | 16–18px | -0.02em |
| Body | Inter | 400 | 14–16px | 0 |
| Caption / label | Inter | 600–700 | 11–12px | 0.12–0.2em |
| Badge / eyebrow | Inter | 700 | 10–11px | 0.15–0.2em |

**Regla tipográfica:** Letter-spacing muy compacto en titulares (premium). Uppercase solo en labels/eyebrows/badges.

### Efectos visuales permitidos
- Gradients radiales sutiles (glow desde arriba, orbs de color difusos)
- Grid tecnológico (líneas finas 1px, opacidad 5–8%)
- Glassmorphism solo en nav y elementos flotantes (blur 12–20px, bg rgba 3–5%)
- Glow pulsante en elementos CTA (box-shadow animada)
- Nodos/puntos de conexión decorativos con líneas finas
- Dot patterns con mask-image para degradado suave
- Sombras difusas: `box-shadow: 0 12px 40px rgba(124,58,237,0.15)`

---

## 3. Arquitectura de página

### Secciones en orden

```
00  NAV         — Glassmorphism, sticky, scroll-aware, CTA visible siempre
01  HERO        — Crítico. Centrado cinematográfico. (ver sección 4)
02  VALUE BAR   — 4 métricas con counter animation
03  QUÉ HACEMOS — Copy directo + pills de servicios
04  SERVICIOS   — Bento Grid 3×2 con card featured (ver sección 5)
05  PROCESO     — Timeline animado 5 pasos
06  BENEFICIOS  — Grid 4×2 de diferenciales
07  SECTORES    — 3 cards con métricas de impacto (editables)
08  CTA FINAL   — Fondo pulsante, dos CTAs, máxima conversión
09  FOOTER      — Minimal dark
```

---

## 4. Hero Section (crítico)

**Composición elegida:** A — Centrado cinematográfico

### Estructura visual
```
[BADGE: "Implementación IA para empresas" — pill con dot naranja pulsante]

[H1: "No aprendes IA."]
[H1 gradient: "HAT3X la implementa."]  ← gradiente violeta→naranja

[Subtítulo: copy directo, 16px, color #555, máx 380px ancho]

[CTA primario: "Reservar llamada gratuita →"]  [CTA secundario: "Ver servicios"]

[FONDO: grid tecnológico + glow violeta radial desde arriba + orb naranja abajo-derecha + nodos flotantes]
```

### Copy exacto del Hero
- **Badge:** `Implementación IA para empresas`
- **H1 línea 1:** `No aprendes IA.`
- **H1 línea 2 (gradiente):** `HAT3X la implementa.`
- **Subtítulo:** `Soluciones reales de inteligencia artificial para tu negocio. Sin curvas de aprendizaje. Sin humo. Sin esperar.`
- **CTA primario:** `Reservar llamada gratuita →`
- **CTA secundario:** `Ver servicios`

### Motion del Hero
| Elemento | Animación | Duración | Delay |
|---|---|---|---|
| Grid de fondo | `fadeIn` | 1.2s | 0s |
| Glow/orbs | `pulse` scale 1→1.05, ease-in-out infinite | 4s | 0s |
| Nodos | `fadeIn` escalonado | 0.3s cada uno | stagger 0.1s |
| Badge | `slideUp` + `fadeIn` | 0.5s | 0.1s |
| H1 | `slideUp` + `fadeIn` | 0.6s | 0.3s |
| Subtítulo | `fadeIn` | 0.5s | 0.6s |
| CTAs | `slideUp` + `fadeIn` | 0.4s | 0.8s |
| Scroll parallax | Grid a 0.3× velocidad de scroll | — | — |

### Altura
- Desktop: 100vh (mínimo 700px)
- Mobile: min-height 600px, adaptado a columna

---

## 5. Sección Servicios

**Layout elegido:** A — Bento Grid

### Estructura del grid
```
[Col 1+2: Card FEATURED — Auditoría y Roadmap] [Col 3: Card — Automatización]
[Col 1: Card — Apps con IA]  [Col 2: Card — Integraciones]  [Col 3: Card — Analítica]
[Col 1: Card — Gobernanza] (o row 3 si se prefiere 3×2 uniforme)
```

### Los 6 servicios con copy

| # | Servicio | Descripción | Tag |
|---|---|---|---|
| 01 | **Auditoría y Roadmap de IA** | Analizamos tu negocio, identificamos los procesos con mayor ROI potencial y diseñamos un plan de implementación realista y priorizado. El primer paso antes de cualquier solución. | Diagnóstico · 2–4 semanas |
| 02 | **Automatización y Agentes** | Workflows inteligentes que eliminan tareas repetitivas. Agentes que actúan por tu equipo 24/7. | n8n · Make · Custom |
| 03 | **Apps y Productos con IA** | Desarrollamos productos digitales con IA integrada. Desde MVPs hasta plataformas completas. | Next.js · Supabase |
| 04 | **Integraciones** | Conectamos tus sistemas existentes — CRM, ERP, ecommerce, BBDD — con capa de IA encima. | APIs · Webhooks · CRM |
| 05 | **Analítica y ML** | Modelos predictivos, dashboards inteligentes y análisis de datos para decisiones basadas en evidencia. | Python · SQL · BI |
| 06 | **Gobernanza y Adopción** | Implementamos IA de forma responsable y aseguramos que tu equipo la adopte con éxito. | Estrategia · Change Mgmt |

### Hover state de cards
- Border: `rgba(124,58,237,0.3)`
- Background: `rgba(124,58,237,0.04)`
- Top gradient line: `linear-gradient(90deg, transparent, rgba(124,58,237,0.3), transparent)` opacity 1
- Transition: `all 0.25s ease`

---

## 6. Navegación

### Estructura
```
[Logo HAT3X] — [Servicios] [Proceso] [Casos] [Nosotros] — — — [Reservar llamada →]
```

### Comportamiento
- **Inicial:** `background: transparent`, `border-bottom: transparent`
- **On scroll (>80px):** `background: rgba(7,7,15,0.85)`, `backdrop-filter: blur(20px)`, `border-bottom: 1px solid rgba(255,255,255,0.05)`
- **CTA nav:** Siempre visible, `background: #7C3AED`, hover `background: #6D28D9`
- **Mobile:** Hamburger → drawer lateral con blur background

---

## 7. Sección Value Bar (métricas)

```
[6 Verticales de IA] | [100% Implementación real] | [B2B Enfoque empresarial] | [0 Curva de aprendizaje]
```

- Separadores: línea gradiente violeta→naranja como top border
- Counter animation: números cuentan desde 0 al valor real en 1.5s cuando entran en viewport (Intersection Observer)
- Altura: ~130px, full-width

---

## 8. Sección "Qué hacemos"

### Copy
- **Eyebrow:** `Qué hacemos` (naranja, uppercase)
- **Título:** `Implementamos IA que funciona en tu negocio hoy.`
- **Pills:** Automatización de procesos · Agentes de voz · Chatbots inteligentes · Apps con IA · Análisis de datos · Integraciones

### Motion
- Título: `slideUp` on scroll
- Pills: `fadeIn` escalonado, stagger 0.08s cada pill

---

## 9. Sección Proceso (Cómo trabajamos)

### 5 pasos en timeline horizontal
```
[01 Diagnóstico] ——→ [02 Roadmap] ——→ [03 Implementación] ——→ [04 Integración] ——→ [05 Optimización]
```

- Línea de conexión: `linear-gradient(90deg, #7C3AED, rgba(234,88,12,0.5))`
- Motion: línea se "dibuja" de izquierda a derecha cuando entra en viewport
- Números en círculos con borde violeta, fondo oscuro

---

## 10. Sección Beneficios

**Grid 4 columnas × 2 filas** de diferenciales con dot violeta:

- Resultados medibles desde el día 1
- Sin dependencias de tu equipo
- Tecnología real, no demos
- Escalable con tu negocio
- Sin curva de aprendizaje interna
- Stack moderno y seguro
- Soporte y mantenimiento continuo
- Transparencia total en el proceso

---

## 11. Sección Sectores / Casos

Sin testimonios reales disponibles. Usar **casos por sector** con métricas genéricas editables:

| Sector | Métrica | Solución | Descripción |
|---|---|---|---|
| Hostelería | -70% | Gestión de reservas automatizada | Agente de voz 24/7 con integración CRM |
| Retail / E-commerce | 3× ROI | Atención al cliente con IA | Chatbot multicanal respuesta instantánea |
| Servicios B2B | +40% | Pipeline de ventas inteligente | Automatización de leads y seguimiento |

**Nota:** Métricas son referenciales. Reemplazar con datos reales cuando estén disponibles.

---

## 12. CTA Final

### Copy
- **Título:** `¿Listo para implementar IA real?`
- **Subtitle:** `Primera llamada gratuita · Sin compromiso · Resultados en semanas`
- **CTA primario:** `Reservar llamada →`
- **CTA secundario:** `Contactar por email`

### Diseño
- Fondo: `radial-gradient` violeta desde abajo, muy oscuro
- Glow pulsante en CTA primario: `box-shadow` animada en loop
- Partículas flotantes sutiles (canvas o CSS puro)

---

## 13. Footer

### Estructura
```
[HAT3X — Consultoría de Inteligencia Artificial]
[Servicios] [Proceso] [Contacto] [LinkedIn]
[© 2025 HAT3X · Todos los derechos reservados] [Privacidad] [Términos]
```

### Diseño
- Background: `#030308` (más oscuro que la página)
- Top border: `linear-gradient(90deg, transparent, rgba(124,58,237,0.2), transparent)`
- Texto en grises muy oscuros (#333–#444)

---

## 14. Sistema de motion global

### Principios
1. **Suave y fluido** — curvas `ease-out` y `cubic-bezier(0.16,1,0.3,1)` (spring)
2. **Rápido** — duraciones 0.3–0.6s, nunca más de 0.8s
3. **Escalonado** — elementos hermanos con stagger 0.08–0.1s
4. **On scroll** — Intersection Observer con `threshold: 0.1` y `once: true`
5. **Sin lag** — solo `transform` y `opacity` en animaciones (GPU)

### Animaciones base (Framer Motion variants)
```ts
// fadeInUp — para la mayoría de elementos
initial: { opacity: 0, y: 24 }
animate: { opacity: 1, y: 0 }
transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] }

// fadeIn — para fondos y decoraciones
initial: { opacity: 0 }
animate: { opacity: 1 }
transition: { duration: 0.8 }

// pulse — para glows y orbs
animate: { scale: [1, 1.05, 1] }
transition: { duration: 4, ease: "easeInOut", repeat: Infinity }

// drawLine — para la línea del proceso
initial: { scaleX: 0 }
animate: { scaleX: 1 }
transition: { duration: 1.2, ease: "easeOut" }
```

---

## 15. Responsive

### Breakpoints (Tailwind)
- `sm`: 640px — Mobile landscape
- `md`: 768px — Tablet
- `lg`: 1024px — Desktop
- `xl`: 1280px — Large desktop
- `2xl`: 1536px — Ultra-wide (máx ancho contenido: 1280px)

### Adaptaciones clave
| Sección | Desktop | Mobile |
|---|---|---|
| Hero H1 | 72–96px | 40–48px |
| Hero layout | Centrado | Centrado, padding 24px |
| Bento grid | 3 columnas | 1 columna |
| Value bar | 4 columnas en fila | 2×2 grid |
| Timeline proceso | Horizontal | Vertical |
| Nav | Links visibles | Hamburger → drawer |
| Beneficios | 4 columnas | 2 columnas |

---

## 16. Stack técnico detallado

```
Next.js 14          — App Router, SSG, Image optimization
Tailwind CSS v4     — Design tokens como CSS variables
Framer Motion       — Animaciones declarativas, scroll-linked
TypeScript          — Strict mode
Vercel              — Deploy, Edge Functions, Analytics
```

### Estructura de carpetas
```
/app
  layout.tsx          — Root layout con providers
  page.tsx            — Homepage (single page)
/components
  /sections
    Hero.tsx
    ValueBar.tsx
    WhatWeDo.tsx
    Services.tsx
    Process.tsx
    Benefits.tsx
    Cases.tsx
    CtaFinal.tsx
  /ui
    Nav.tsx
    Footer.tsx
    Button.tsx
    Badge.tsx
    Card.tsx
  /motion
    FadeInUp.tsx        — Wrapper de animación reutilizable
    StaggerChildren.tsx — Animación escalonada
/lib
  constants.ts        — Copy, servicios, métricas
/styles
  globals.css         — CSS variables + Tailwind base
```

### Reglas de rendimiento
- Imágenes: `next/image` con `priority` en hero
- Fuentes: `next/font` con `display: swap`
- Animaciones: solo `transform`/`opacity` (sin `top`, `left`, `width`)
- Bundle: código de animaciones en chunks separados (`dynamic import`)
- LCP objetivo: < 2.5s
- CLS: < 0.1

---

## 17. Copy completo — secciones secundarias

### Nav
`Servicios · Proceso · Casos · Nosotros · [Reservar llamada →]`

### Eyebrows de sección
- Servicios: `Servicios` (violeta)
- Proceso: `Cómo trabajamos` (naranja)
- Beneficios: `Por qué HAT3X` (violeta)
- Sectores: `Sectores que transformamos` (naranja)
- CTA: ninguno (el título es el gancho)

### Títulos de sección
- Servicios: `Lo que implementamos.`
- Proceso: `Así lo hacemos.`
- Beneficios: `Por qué HAT3X.`
- Sectores: `Resultados reales en tu sector.`

---

## 18. Decisiones tomadas en brainstorming

| Decisión | Elegida | Alternativas descartadas |
|---|---|---|
| Dirección visual | A — Inmersiva Dark | B (Editorial), C (Hybrid) |
| Composición Hero | A — Centrado cinematográfico | B (Split), C (Statement) |
| Layout servicios | A — Bento Grid | B (Lista expandible) |
| CTA primario | Llamada + formulario | Solo formulario, solo WhatsApp |
| Social proof | Sin testimonios (fase inicial) | — |
| Stack | Next.js 14 + Tailwind + Framer | — (delegado al equipo) |

---

## 19. Qué NO implementar

- Parallax agresivo o efectos 3D pesados
- Vídeo de fondo autoplay
- Cursores personalizados (degradan UX en algunos sistemas)
- Transiciones de página completas (ralentizan percepción)
- Más de 3 niveles de glow superpuestos en la misma sección
- Texto animado letra a letra en secciones de cuerpo (solo en hero si aplica)
- Footer con columnas de links innecesarios (HAT3X no tiene blog ni docs todavía)

---

## 20. Criterio de éxito

El resultado debe:
1. Cargar en < 3s en conexión normal (LCP < 2.5s)
2. Pasar Lighthouse > 90 en Performance, Accessibility, Best Practices
3. Transmitir "firma premium" en los primeros 5 segundos
4. Tener un CTA visible sin hacer scroll en desktop Y mobile
5. Ser mantenible: copy en `constants.ts`, sin hardcode en JSX
