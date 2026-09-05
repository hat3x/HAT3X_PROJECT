# UX Spec — Wireframe: Landing Page HAT3X

> **Status**: Draft para revisión
> **Author**: pm-documentation (HAT3X)
> **Last Updated**: 2026-07-04
> **Template**: UX Spec (skill `ux-design`)
> **Alcance**: Wireframe de baja fidelidad + arquitectura de información. No incluye diseño visual (color/tipografía) ni copy final.

---

## 1. Propósito y necesidad del usuario

El visitante llega queriendo responder en menos de 10 segundos:

1. **¿Qué hace HAT3X?** — Automatización e IA aplicada (chatbots, voz, webs/apps, automatizaciones n8n).
2. **¿Es para mí?** — Micropymes y pymes que quieren automatizar sin equipo técnico propio.
3. **¿Qué hago ahora?** — Una única acción primaria: agendar una llamada / solicitar propuesta.

Si la landing no existiera o fuera confusa, el coste es directo: leads que rebotan sin contactar.

---

## 2. Contexto de llegada

| Origen | Estado emocional | Implicación de diseño |
|---|---|---|
| Búsqueda ("automatizar negocio", "chatbot whatsapp") | Curioso, comparando | Propuesta de valor clara above-the-fold |
| Referencia de otro cliente | Confiado, quiere validar | Prueba social visible pronto |
| Redes / anuncio | Impaciente, móvil | Mobile-first, CTA alcanzable con el pulgar |

Dispositivo primario asumido: **móvil (~65%)**. El wireframe se define mobile-first con variante desktop.

---

## 3. Jerarquía de información

1. Propuesta de valor (headline + subheadline)
2. CTA primario ("Agendar llamada")
3. Servicios (4 verticales: Chatbots, Voz, Webs y Apps, Automatizaciones)
4. Prueba social (logos / testimonios / métricas)
5. Cómo trabajamos (proceso en 3 pasos)
6. FAQ breve
7. CTA final + footer

Descubrible (no crítico above-the-fold): detalle de stack técnico, casos de estudio completos, blog.

---

## 4. Zonas de layout

| Zona | Contenido | Prioridad |
|---|---|---|
| Z1 Header | Logo + nav (Servicios, Proceso, FAQ) + CTA secundario | Fija (sticky) |
| Z2 Hero | Headline, subheadline, CTA primario, visual de apoyo | Crítica |
| Z3 Servicios | Grid de 4 tarjetas (una por vertical) | Alta |
| Z4 Prueba social | Métricas + 2–3 testimonios | Alta |
| Z5 Proceso | 3 pasos: Diagnóstico → Construcción → Entrega y soporte | Media |
| Z6 FAQ | Acordeón, 4–6 preguntas | Media |
| Z7 CTA final | Repetición del CTA primario con refuerzo | Alta |
| Z8 Footer | Contacto, legal, RRSS | Baja |

---

## 5. Wireframe ASCII

### Desktop (≥1024px)

```
┌──────────────────────────────────────────────────────────────┐
│ Z1  [LOGO]        Servicios  Proceso  FAQ      [ Contacto ]  │  ← sticky
├──────────────────────────────────────────────────────────────┤
│ Z2                                                           │
│   ┌───────────────────────────┐   ┌───────────────────────┐  │
│   │ H1: Automatiza tu negocio │   │                       │  │
│   │     con IA                │   │   [ Visual / demo     │  │
│   │ Sub: chatbots, voz, webs  │   │     animada del       │  │
│   │      y automatizaciones   │   │     producto ]        │  │
│   │                           │   │                       │  │
│   │ [ ► Agendar llamada ]     │   │                       │  │
│   │   Sin compromiso · 30 min │   └───────────────────────┘  │
│   └───────────────────────────┘                              │
├──────────────────────────────────────────────────────────────┤
│ Z3   H2: Qué hacemos                                         │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│   │ (icon)   │ │ (icon)   │ │ (icon)   │ │ (icon)   │        │
│   │ Chatbots │ │ Agentes  │ │ Webs y   │ │ Automati-│        │
│   │ web+WhtsA│ │ de voz   │ │ apps     │ │ zaciones │        │
│   │ 2 líneas │ │ 2 líneas │ │ 2 líneas │ │ 2 líneas │        │
│   │ [Ver más]│ │ [Ver más]│ │ [Ver más]│ │ [Ver más]│        │
│   └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├──────────────────────────────────────────────────────────────┤
│ Z4   ── 40+ proyectos ── 12 sectores ── <2 sem entrega ──    │
│   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │
│   │ "Testimonio…" │ │ "Testimonio…" │ │ "Testimonio…" │      │
│   │ — Nombre, Cía │ │ — Nombre, Cía │ │ — Nombre, Cía │      │
│   └───────────────┘ └───────────────┘ └───────────────┘      │
├──────────────────────────────────────────────────────────────┤
│ Z5   H2: Cómo trabajamos                                     │
│   (1) Diagnóstico ──→ (2) Construcción ──→ (3) Entrega       │
│       1 línea             1 línea              y soporte     │
├──────────────────────────────────────────────────────────────┤
│ Z6   H2: Preguntas frecuentes                                │
│   ▸ ¿Cuánto tarda un proyecto? ─────────────────────── [+]   │
│   ▸ ¿Qué necesito para empezar? ────────────────────── [+]   │
│   ▸ ¿Ofrecéis mantenimiento? ───────────────────────── [+]   │
│   ▸ ¿Cómo se factura? ──────────────────────────────── [+]   │
├──────────────────────────────────────────────────────────────┤
│ Z7   H2: ¿Hablamos?                                          │
│              [ ► Agendar llamada gratuita ]                  │
├──────────────────────────────────────────────────────────────┤
│ Z8  [LOGO]  info@hat3x.com · Legal · Privacidad · RRSS       │
└──────────────────────────────────────────────────────────────┘
```

### Móvil (<768px)

```
┌──────────────────────┐
│ [LOGO]          [☰]  │ ← sticky
├──────────────────────┤
│ H1: Automatiza tu    │
│     negocio con IA   │
│ Sub: 2 líneas máx    │
│ [ ► Agendar llamada ]│ ← full-width, alcanzable
│ Sin compromiso·30min │
│ [ visual reducido ]  │
├──────────────────────┤
│ H2: Qué hacemos      │
│ ┌──────────────────┐ │
│ │ (icon) Chatbots  │ │  ← tarjetas apiladas
│ └──────────────────┘ │    (4 en columna)
│ ┌──────────────────┐ │
│ │ (icon) Voz       │ │
│ └──────────────────┘ │
│        ...           │
├──────────────────────┤
│ 40+ proyectos        │
│ ‹ testimonio (swipe)›│  ← carrusel 1-por-vista
├──────────────────────┤
│ (1)→(2)→(3) vertical │
├──────────────────────┤
│ FAQ acordeón         │
├──────────────────────┤
│ [ ► Agendar llamada ]│
├──────────────────────┤
│ Footer compacto      │
└──────────────────────┘
```

---

## 6. Inventario de componentes

| Zona | Componente | Interactivo | Notas |
|---|---|---|---|
| Z1 | Nav sticky + menú hamburguesa (móvil) | Sí | Anchor links con scroll suave |
| Z2 | CTA primario | Sí | Único estilo "primario" en toda la página |
| Z2 | Visual hero | No | Lazy-load; no bloquear LCP |
| Z3 | Tarjeta de servicio ×4 | Sí | Toda la tarjeta clicable, no solo "Ver más" |
| Z4 | Contador de métricas | No | Sin animación si `prefers-reduced-motion` |
| Z4 | Tarjeta testimonio ×3 | No | Carrusel solo en móvil |
| Z5 | Stepper de proceso | No | Horizontal desktop / vertical móvil |
| Z6 | Acordeón FAQ | Sí | Un ítem abierto a la vez; `aria-expanded` |
| Z7 | CTA final | Sí | Mismo destino que Z2 |
| Z8 | Footer links | Sí | — |

---

## 7. Estados

| Estado | Trigger | Comportamiento |
|---|---|---|
| Default | Carga normal | Todo visible según wireframe |
| Carga | Red lenta | Skeleton en hero visual y testimonios; texto y CTA renderizan primero |
| CTA → agenda | Click en CTA | Abre modal/página de Cal.com; si el embed falla, fallback a `mailto:info@hat3x.com` |
| Sin testimonios | Datos no disponibles | Ocultar Z4 completa (nunca tarjetas vacías) |
| Nav móvil abierta | Tap en ☰ | Overlay full-screen, foco atrapado, cierre con Esc/✕ |

---

## 8. Accesibilidad (WCAG 2.1 AA)

- Orden de foco teclado: logo → nav → CTA hero → tarjetas → FAQ → CTA final → footer.
- Un solo `<h1>` (hero); jerarquía H2/H3 coherente por zona.
- Acordeón FAQ con `button` + `aria-expanded` + `aria-controls`.
- Contraste mínimo 4.5:1 en texto; CTA distinguible sin depender solo del color.
- Targets táctiles ≥44×44px en móvil.
- `prefers-reduced-motion`: desactiva contadores animados y transiciones del carrusel.

---

## 9. Consideraciones de localización

- Headline y labels de CTA dimensionados para +40% de expansión (DE/FR).
- Botón CTA: máx. ~28 caracteres en una línea a 375px de ancho.
- Métricas Z4 con formato numérico por locale.

---

## 10. Criterios de aceptación

- [ ] LCP < 2.5s en móvil 4G (hero text + CTA renderizan antes que el visual).
- [ ] CTA primario visible above-the-fold en 375×667 y 1440×900.
- [ ] Click en CTA (Z2 y Z7) abre el flujo de agenda; fallback `mailto:` si el embed falla.
- [ ] Anchor links de la nav llevan a Z3, Z5 y Z6 con scroll suave.
- [ ] Navegación completa por teclado con indicadores de foco visibles en todos los interactivos.
- [ ] Con Z4 sin datos, la sección desaparece sin dejar hueco visual.
- [ ] FAQ operable con teclado y lector de pantalla (roles/estados ARIA correctos).

---

## 11. Preguntas abiertas

1. **Herramienta de agenda**: ¿Cal.com embebido o página dedicada? (afecta al estado "CTA → agenda").
2. **Prueba social real**: ¿existen ya 3 testimonios y métricas verificables? Si no, lanzar con Z4 oculta.
3. **Idiomas**: ¿solo ES en v1 o ES+EN? Afecta a nav y footer.
4. **Visual hero**: ¿ilustración estática o demo animada? Decisión de dirección de arte, no de UX.
