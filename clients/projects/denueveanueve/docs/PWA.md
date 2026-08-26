# PWA y marca por salón (white-label) — estado y limitación

> Sub-tarea **sub-4** · App CLIENTE · 2026-07-19
> Resumen: qué parte de la PWA **sí** sigue a la marca del salón en runtime, qué
> parte **no puede** hacerlo con el build actual, y las opciones para conseguirlo.

La app cliente es **white-label multi-tenant**: un **único build** sirve a todos los
salones y el salón se resuelve en **runtime** por subdominio
(`jotabarber.salonos.app` → `jotabarber`), con `?salon=<slug>` y `VITE_SALON_SLUG`
como respaldos. Ver [`src/lib/salon.ts`](../src/lib/salon.ts) y
[`src/lib/salon-context.tsx`](../src/lib/salon-context.tsx).

Esto crea una asimetría con la PWA, porque **el manifest y los iconos se resuelven
en tiempo de build**, no en runtime.

## Qué SÍ sigue a la marca del salón (runtime)

| Elemento | Cómo | Dónde |
|---|---|---|
| Color de la barra del navegador / PWA | `meta[name="theme-color"]` se reescribe con `primary_color` del salón al resolver el branding | [`salon-context.tsx`](../src/lib/salon-context.tsx) |
| Título de la pestaña | `document.title = branding.name` | [`salon-context.tsx`](../src/lib/salon-context.tsx) |
| Logo / nombre dentro de la app | `<SalonWordmark>` pinta el logo del salón (o su nombre) | [`SalonWordmark.tsx`](../src/components/SalonWordmark.tsx) |
| Colores / acento del tema | Se re-tinta desde `primary_color` / `secondary_color` | [`salon-theme.ts`](../src/lib/salon-theme.ts) |

## Qué NO puede ser por-salón con el build actual

El **manifest** de la PWA (`vite-plugin-pwa` en [`vite.config.ts`](../vite.config.ts))
es **estático**. Con un solo build multi-salón, estos campos **no** pueden variar
por salón y se sirven **neutros** (sin cablear ningún salón concreto):

- `name` / `short_name` → `"Salón · Reservas y fidelización"` / `"Salón"`.
- `icons` → [`/pwa-icon.svg`](../public/pwa-icon.svg): un glifo **neutro** de
  tijeras sobre fondo oscuro (uso `any` + `maskable`). No es el logo de ningún salón.
- `theme_color` / `background_color` del manifest → oscuro neutro (`#0F0D0A`). Ojo:
  esto sólo afecta a la **pantalla de arranque** del PWA instalado; la barra en uso
  sí sigue a la marca (ver tabla anterior).

**Consecuencia práctica:** al **instalar** la PWA, el icono y el nombre del acceso
directo son los neutros, no los del salón. Todo lo *dentro* de la app sí es del salón.

> **Nota:** el manifest anterior apuntaba a `/logo.png`, que **no existía** en
> `public/` (icono de instalación roto). Ahora apunta a un `/pwa-icon.svg` real y
> neutro: además de quitar el cableado a un salón, **arregla** ese icono roto.

## Opciones para lograr marca completa por salón (futuro)

1. **Build por salón.** Un pipeline que inyecta `name`/`short_name`/`icons` por salón
   y publica cada uno en su subdominio. Marca 100 % nativa, a coste de N builds y N
   despliegues. Recomendable sólo para salones "insignia".
2. **Manifest dinámico en servidor.** Servir `/manifest.webmanifest` desde una función
   (edge) que lee el `Host`, resuelve el salón y devuelve `name`/`icons` a medida
   (con `<link rel="manifest" href="/manifest.webmanifest">`). Un solo despliegue,
   marca por salón. Requiere runtime de servidor (hoy el deploy es estático).
3. **Icono maskable en PNG.** Para máxima compatibilidad de iconos *maskable* (algunos
   navegadores prefieren PNG a SVG), generar `pwa-192.png` / `pwa-512.png`. Encaja de
   forma natural dentro de la opción 1 o 2.

## Decisión de sub-4

Se elige **documentar la limitación** y dejar el manifest **neutro** (opción por
defecto), **sin romper la PWA existente**:

- No se cablea ningún salón en el manifest ni en `index.html` (metadatos neutros).
- La marca por salón que **sí** es posible en runtime (color de barra, título, logo y
  tema dentro de la app) queda cubierta.
- Se dejan encima de la mesa las opciones 1–3 para cuando se priorice la marca
  completa del acceso directo instalado.
