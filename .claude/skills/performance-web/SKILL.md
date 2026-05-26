# Skill: performance-web

**Invocación:** `/performance-web`

**Propósito:** Audita y optimiza el rendimiento de webs y apps. Objetivo: Core Web Vitals en verde, bundle mínimo, carga percibida instantánea.

---

## Trigger

Se activa cuando el usuario pide mejorar el rendimiento de una web, reducir el bundle size, mejorar LCP/CLS/FID o pasar el análisis de Lighthouse.

---

## Métricas objetivo

| Métrica | Objetivo | Herramienta |
|---------|----------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse, WebPageTest |
| FID / INP (Interaction) | < 200ms | Chrome DevTools |
| CLS (Layout Shift) | < 0.1 | Lighthouse |
| Bundle inicial (gzip) | < 200KB | `npm run build` |
| Time to Interactive | < 3.5s | Lighthouse |

---

## Checklist de auditoría

### Bundle & Code Splitting
- [ ] `React.lazy()` + `<Suspense>` en todas las rutas
- [ ] `manualChunks` en vite.config.ts para vendors pesados
- [ ] Importaciones de librerías tree-shakeable (`import { x } from 'lib'`)
- [ ] Detectar dependencias no usadas: `npx depcheck`
- [ ] Analizar bundle: `npx vite-bundle-analyzer` o `npx webpack-bundle-analyzer`

### Imágenes
- [ ] Formato WebP/AVIF para fotografías
- [ ] `width` y `height` explícitos (evita CLS)
- [ ] `loading="lazy"` en imágenes below-the-fold
- [ ] CDN con transformación automática (Cloudinary, Supabase Storage)
- [ ] Sprites SVG para iconos repetidos

### Fuentes
- [ ] `font-display: swap` en @font-face
- [ ] Preload de fuentes críticas: `<link rel="preload" as="font">`
- [ ] Subsets de fuentes (solo latin si aplica)
- [ ] `next/font` si usas Next.js (elimina CLS de fuentes)

### Red
- [ ] HTTP/2 o HTTP/3 en servidor
- [ ] Compresión Brotli (mejor que gzip)
- [ ] Cache-Control headers correctos (assets: 1 año, HTML: no-cache)
- [ ] Service Worker con estrategia NetworkFirst para API, CacheFirst para assets

### React/Vite específico
- [ ] `React.memo()` en componentes que reciben props estables
- [ ] `useMemo` / `useCallback` solo donde hay cálculos caros (no abusar)
- [ ] Evitar re-renders innecesarios con React DevTools Profiler
- [ ] `<Suspense>` con fallback ligero (skeleton, no spinner completo)
- [ ] Prefetch de rutas probables: `<Link prefetch>` en Next.js

---

## Comandos de diagnóstico

```bash
# Analizar bundle de Vite
npm run build && npx vite-bundle-visualizer

# Lighthouse desde CLI
npx lighthouse https://tu-url.com --output html --view

# Buscar dependencias no usadas
npx depcheck

# Ver tamaño de paquetes npm antes de instalar
npx bundlephobia [paquete]
```

---

## Optimizaciones rápidas de alto impacto

1. **Code splitting** — mayor impacto, menor esfuerzo
2. **Eliminar dependencias pesadas** — buscar alternativas ligeras (ej: `date-fns` vs `moment`)
3. **Lazy load imágenes** — trivial, gran ganancia en mobile
4. **Preconnect a dominios externos** — Supabase, Stripe, fuentes
5. **Eliminar polyfills innecesarios** — revisar browserslist en package.json
