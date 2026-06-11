# Skill: nextjs-shadcn

**Invocación:** `/nextjs-shadcn`

**Propósito:** Experto en Next.js 14+, App Router, Tailwind CSS y shadcn/ui. Diseña e implementa webs y apps profesionales con las mejores prácticas actuales.

---

## Trigger

Se activa cuando el usuario pide crear o mejorar una web/app con Next.js, React, Tailwind o shadcn/ui.

---

## Comportamiento

### Stack por defecto
- **Framework:** Next.js 14+ con App Router
- **Lenguaje:** TypeScript strict
- **Estilos:** Tailwind CSS + shadcn/ui
- **Fuentes:** next/font (sin CLS)
- **Imágenes:** next/image (optimización automática)
- **Estado global:** Zustand o React Context según complejidad
- **Server state:** TanStack Query v5
- **Forms:** React Hook Form + Zod
- **Animaciones:** Framer Motion

### Estructura de proyecto
```
src/
├── app/                    # App Router — rutas y layouts
│   ├── (auth)/             # Grupo de rutas — no afecta URL
│   ├── (dashboard)/
│   └── api/                # Route Handlers
├── components/
│   ├── ui/                 # shadcn/ui — nunca modificar directamente
│   └── [feature]/          # Componentes de negocio
├── hooks/                  # Custom hooks
├── lib/                    # Utilidades, clientes (supabase, stripe...)
├── types/                  # TypeScript types e interfaces
└── styles/
```

### Reglas de implementación

**Componentes:**
- Server Components por defecto — añadir `"use client"` solo si necesita hooks o eventos
- Props con TypeScript interfaces explícitas (nunca `any`)
- Nombres en PascalCase, ficheros en kebab-case
- Un componente por fichero

**shadcn/ui:**
- Instalar con `npx shadcn@latest add [component]`
- NUNCA modificar los archivos en `components/ui/` — crear wrappers
- Usar `cn()` de `lib/utils` para combinar clases

**Tailwind:**
- Responsive mobile-first: `sm:`, `md:`, `lg:`, `xl:`
- Variables CSS para colores de marca en `globals.css`
- Evitar clases arbitrarias `[valor]` — usar config de Tailwind

**Performance:**
- `loading.tsx` en cada segmento de ruta
- `error.tsx` con UI de recuperación
- Suspense boundaries alrededor de datos async
- `generateStaticParams` para rutas dinámicas conocidas
- `revalidatePath` / `revalidateTag` para ISR

**SEO:**
- `generateMetadata()` en cada page.tsx
- `opengraph-image.tsx` para OG dinámico
- `sitemap.ts` y `robots.ts`

---

## Comandos de referencia

```bash
# Crear proyecto
npx create-next-app@latest [nombre] --typescript --tailwind --app --src-dir --import-alias "@/*"

# Añadir shadcn
npx shadcn@latest init
npx shadcn@latest add button card input dialog

# Añadir dependencias comunes
npm install @tanstack/react-query zod react-hook-form framer-motion zustand
```

---

## Checklist de entregable

- [ ] TypeScript sin errores (`tsc --noEmit`)
- [ ] Lighthouse Performance > 90
- [ ] Lighthouse Accessibility > 90
- [ ] Sin `console.log` en producción
- [ ] Variables de entorno en `.env.example`
- [ ] `README.md` con instrucciones de setup
