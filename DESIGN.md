# Sistema de diseño — Salon OS

> Lenguaje visual **premium, estilo Apple**: base neutra cálida, acento violeta
> contenido, tipografía de sistema con *tracking* calibrado, radios generosos,
> sombras suaves y micro-interacciones de 150–250 ms.
>
> Este documento es la **referencia de diseño**. La **fuente de verdad técnica**
> son las variables CSS de [`src/app/globals.css`](src/app/globals.css), mapeadas
> a utilidades Tailwind y al tema de shadcn/ui en
> [`tailwind.config.ts`](tailwind.config.ts). No dupliques valores en los
> componentes: consume siempre los tokens.

---

## 1. Principios

1. **Un único origen de tokens.** Colores, radios y sombras viven como variables
   CSS (`H S% L%`, formato shadcn) y se consumen con `hsl(var(--token))` para
   permitir opacidad (`/`). Cambiar el tema = cambiar variables, nunca componentes.
2. **Acento con criterio.** El violeta marca acción, foco y estado activo. No se
   usa como color de relleno decorativo ni para grandes superficies.
3. **Neutros cálidos, no grises fríos.** Fondos con matiz 30–40° para dar
   sensación de calidez y calidad, en claro y en oscuro.
4. **Contraste AA garantizado.** Todo texto y estado semántico cumple WCAG 2.1 AA
   (≥ 4.5:1 texto normal). Varios tokens se calibraron a la baja en luminosidad
   para pasar el umbral (ver comentarios en `globals.css`).
5. **Movimiento discreto y reversible.** Curvas «Apple», duraciones cortas y
   respeto estricto por `prefers-reduced-motion`.

---

## 2. Tokens de color

Formato: `H S% L%`. Se consumen como `hsl(var(--token))` y exponen utilidades
Tailwind (`bg-primary`, `text-muted-foreground`, `border-border`, …).

### 2.1 Superficies y texto

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--background` / `--foreground` | Lienzo base y texto principal | `40 33% 98%` / `30 10% 15%` | `30 9% 8%` / `40 22% 96%` |
| `--card` / `--card-foreground` | Tarjetas y superficies elevadas | `40 40% 99.5%` / `30 10% 15%` | `30 8% 11%` / `40 22% 96%` |
| `--popover` / `--popover-foreground` | Menús, selects, diálogos flotantes | `40 40% 99.5%` / `30 10% 15%` | `30 8% 11%` / `40 22% 96%` |
| `--muted` / `--muted-foreground` | Fondos sutiles y texto secundario | `40 20% 95.5%` / `30 6% 42%` | `30 6% 16%` / `40 8% 64%` |
| `--secondary` / `--secondary-foreground` | Botones/chips neutros | `40 20% 94%` / `30 12% 22%` | `30 6% 17%` / `40 22% 96%` |

> **Nota AA:** `--muted-foreground` en claro se fijó en **L42 %** (antes 44 %)
> para alcanzar 4.5:1 también **sobre** `--muted`, no solo sobre el fondo base.

### 2.2 Acento de marca (violeta)

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--primary` / `--primary-foreground` | Acción principal, CTA, estado activo | `262 83% 58%` (#7c3aed) / `40 40% 99%` | `262 84% 68%` / `30 12% 10%` |
| `--accent` / `--accent-foreground` | Lavado violeta para *hover* y estados suaves | `262 60% 96%` / `262 55% 34%` | `262 40% 22%` / `262 80% 88%` |
| `--ring` | Anillo de foco | `262 83% 58%` | `262 84% 68%` |

> En oscuro el primario **sube** a L68 % para mantener contraste y vibración
> sobre el charcoal cálido. Ver §4 (uso del acento).

### 2.3 Semánticos

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--destructive` | Error, borrado, cobro fallido | `0 72% 51%` | `0 62% 50%` |
| `--success` | Confirmado, pagado, cuadre correcto | `145 63% 32%` | `145 52% 52%` |
| `--warning` | Aviso, pendiente, descuadre leve | `38 92% 48%` | `38 90% 58%` |
| `--info` | Informativo (alias del violeta) | `262 83% 58%` | `262 84% 68%` |

> **Nota AA:** `--success` claro se bajó a **L32 %** (antes 38 %) y `--destructive`
> oscuro a **L50 %** para que el texto sobre badges rellenos pase 4.5:1.

### 2.4 Líneas

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--border` | Bordes de tarjetas, tablas, separadores | `38 20% 89%` | `30 6% 20%` |
| `--input` | Borde de campos de formulario | `38 20% 89%` | `30 6% 22%` |

---

## 3. Escalas

### 3.1 Tipografía

Fuente principal: **Inter** vía `next/font` (variable `--font-sans`), con *fallback*
al stack de sistema estilo Apple (`-apple-system`, `SF Pro Text/Display`, `Segoe UI`,
`Roboto`…). Renderizado nítido: `antialiased` + `text-rendering: optimizeLegibility`
+ *character variants* (`cv02/03/04/11`).

Escala con *line-height* y *tracking* calibrados — los tamaños grandes usan
**tracking negativo**, firma del estilo Apple:

| Token | Tamaño | Line-height | Tracking |
|---|---|---|---|
| `text-xs` | 0.75rem | 1rem | 0 |
| `text-sm` | 0.875rem | 1.25rem | 0 |
| `text-base` | 1rem | 1.5rem | −0.006em |
| `text-lg` | 1.125rem | 1.75rem | −0.01em |
| `text-xl` | 1.25rem | 1.75rem | −0.014em |
| `text-2xl` | 1.5rem | 2rem | −0.018em |
| `text-3xl` | 1.875rem | 2.25rem | −0.021em |
| `text-4xl` | 2.25rem | 2.5rem | −0.024em |
| `text-5xl` | 3rem | 1.1 | −0.026em |
| `text-6xl` | 3.75rem | 1.05 | −0.028em |
| `text-7xl` | 4.5rem | 1.05 | −0.03em |

Mono: `SF Mono` → `ui-monospace` → `Menlo`/`Consolas`… (importes, hashes, códigos).

### 3.2 Espaciado

Base 4px de Tailwind, ampliada con pasos intermedios y grandes para *layouts*
premium:

| Token | Valor | | Token | Valor |
|---|---|---|---|---|
| `4.5` | 1.125rem | | `22` | 5.5rem |
| `5.5` | 1.375rem | | `26` | 6.5rem |
| `13` | 3.25rem | | `30` | 7.5rem |
| `15` | 3.75rem | | `88` | 22rem |
| `18` | 4.5rem | | `104` | 26rem |
| | | | `112` / `128` | 28rem / 32rem |

### 3.3 Radios

Derivados de `--radius: 0.75rem` (base premium generosa):

| Token | Cálculo | Valor | Uso típico |
|---|---|---|---|
| `rounded-xs` | `--radius − 6px` | 0.375rem | Chips diminutos, iconos |
| `rounded-sm` | `--radius − 4px` | 0.5rem | Badges, controles pequeños |
| `rounded-md` | `--radius − 2px` | 0.625rem | Inputs, botones |
| `rounded-lg` | `--radius` | 0.75rem | Tarjetas, contenedores |
| `rounded-xl` | `--radius + 4px` | 0.875rem | Diálogos, paneles |
| `rounded-2xl` | `--radius + 8px` | 1rem | Superficies destacadas |
| `rounded-3xl` | `--radius + 16px` | 1.25rem | *Hero* / bloques grandes |

### 3.4 Sombras

Suaves, color **cálido** y baja opacidad en claro; **negras** y más presentes en
oscuro. Se adaptan solas al tema porque `--shadow-color` cambia por tema.

| Token | Uso |
|---|---|
| `shadow-xs` | Elevación mínima (opción activa, chips) |
| `shadow-sm` | Tarjetas en reposo |
| `shadow` (DEFAULT) | Tarjetas destacadas |
| `shadow-md` / `shadow-lg` | *Hover* de tarjeta, popovers |
| `shadow-xl` / `shadow-2xl` | Diálogos modales, capas superiores |
| `shadow-focus` | Realce de foco (`0 0 0 3px ring/0.35`) |
| `shadow-brand` | Sombra teñida de violeta para CTA principal |

### 3.5 Movimiento

| Token | Curva / duración | Uso |
|---|---|---|
| `ease-apple-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | *Hover*, entradas |
| `ease-apple-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Transiciones bidireccionales |
| `animate-fade-in` | 0.3s ease-out | Aparición de contenido |
| `animate-fade-up` | 0.35s apple-out | *Reveal* escalonado de listas/tarjetas |
| `animate-scale-in` | 0.2s apple-out | Diálogos, popovers |

Micro-interacciones objetivo: **150–250 ms**. Todas se anulan bajo
`prefers-reduced-motion: reduce` (ver §6.3).

---

## 4. Uso del acento violeta

El violeta (`--primary`, `#7c3aed`) es el **único color de marca**. Reglas:

- **Sí:** botón/CTA principal, estado activo de navegación, anillo de foco
  (`--ring`), enlaces, *selección* de texto (`::selection` al 18 %), franjas de
  acento por estado, sombra `shadow-brand` en el CTA hero.
- **Lavado suave (`--accent`):** fondos de *hover*, filas seleccionadas, chips
  informativos. Nunca texto sobre texto: usar siempre `--accent-foreground`.
- **No:** grandes rellenos de fondo, texto de párrafo, iconografía decorativa
  masiva. El acento pierde fuerza si se abusa.
- **Opacidad para tintes:** `bg-primary/10`, `border-primary/30`,
  `text-primary`… en vez de definir nuevos colores.
- **`--info` es un alias del violeta:** unifica lo informativo con la marca.

En **modo oscuro** el primario sube de L58 % a **L68 %** para conservar vibración
y contraste sobre el charcoal; su `foreground` pasa a un tono oscuro (`30 12% 10%`)
para que el texto sobre el violeta siga legible.

---

## 5. Guía de modo claro / oscuro

### 5.1 Arquitectura

- **Estrategia:** `darkMode: ["class"]`. La clase `.dark` en `<html>` conmuta
  todas las variables. Un único set de tokens; los componentes no conocen el tema.
- **Preferencias:** `light` · `dark` · `system`. En `system` se sigue en vivo
  `prefers-color-scheme` mediante `matchMedia`.
- **Persistencia:** `localStorage` (`THEME_STORAGE_KEY`). Ver
  [`theme-provider.tsx`](src/components/providers/theme-provider.tsx).
- **Sin FOUC:** [`theme-script.tsx`](src/components/providers/theme-script.tsx)
  aplica la clase **antes del primer pintado**; el resto del árbol usa
  `suppressHydrationWarning` y un *guard* de montaje para no desajustar la
  hidratación.
- **Selector:** control segmentado accesible
  ([`theme-toggle.tsx`](src/components/theme-toggle.tsx)) con `role="radiogroup"`,
  *roving tabindex* y navegación por flechas/Home/End.
- **Controles nativos:** `color-scheme: light|dark` sincroniza *scrollbars*,
  *inputs* de fecha y autofill con el tema (evita *scrollbars* blancos en oscuro).

### 5.2 Diferencias de tema (resumen)

| Aspecto | Claro | Oscuro |
|---|---|---|
| Fondo | Blanco cálido (`40 33% 98%`) | Charcoal cálido, **no negro puro** (`30 9% 8%`) |
| Elevación | Sombra cálida sutil | Sombra negra más marcada + `--card` más claro que el fondo |
| Primario | L58 % | L68 % (más claro) |
| Sombras | Opacidad 0.04–0.22 | Opacidad 0.3–0.7 |
| Bordes | `38 20% 89%` | `30 6% 20%` |

### 5.3 Reglas al construir pantallas

- Nunca *hardcodear* `#fff`, `#000` ni HSL literales: usar tokens.
- La elevación en oscuro se comunica **subiendo la superficie** (`--card` más claro
  que `--background`), no solo con sombra.
- Comprobar cada pantalla en los **dos** temas y en `system`.

---

## 6. Accesibilidad (auditoría AA)

### 6.1 Contraste
Todos los pares texto/fondo y los badges semánticos cumplen **WCAG 2.1 AA**
(≥ 4.5:1). Calibraciones específicas documentadas *inline* en `globals.css`
(`--muted-foreground`, `--success`, `--destructive`).

### 6.2 Foco
Anillo de foco coherente en toda la app: `:focus-visible` con `outline: 2px solid
var(--ring)` + `outline-offset: 2px`. Los controles interactivos añaden
`focus-visible:ring-2`.

### 6.3 Movimiento
`@media (prefers-reduced-motion: reduce)` reduce animaciones y transiciones a
~0 ms sin perder interactividad; foco y cambios de estado siguen visibles
(WCAG 2.3.3).

### 6.4 Semántica
El selector de tema implementa el patrón WAI-ARIA `radiogroup` completo
(`aria-checked`, *roving tabindex*, etiquetas por opción).

---

## 7. Componentes base (shadcn/ui)

Ubicados en [`src/components/ui/`](src/components/ui/). Refinados con el nuevo
lenguaje: sombras difusas por token, radios `rounded-lg/xl`, bordes finos,
`backdrop-blur`/glass en `Dialog` y `Select`, y micro-interacciones apple-out.
Se respetaron props y API originales.

`badge` · `button` · `card` · `dialog` · `input` · `label` · `select` ·
`skeleton` · `table` · `textarea`

---

## 8. Resumen de cambios por pantalla

Restyle premium aplicado por fases (`style(sub-N)`), **sin tocar la lógica de
negocio, queries ni facturación** en ninguna de ellas.

| Sub | Pantalla / ruta | Cambios clave |
|---|---|---|
| sub-1 | Fundamentos (`globals.css`, `tailwind.config.ts`) | Tokens de color (neutra cálida + violeta), escalas de radios/sombras/tipografía/espaciado, tema claro y oscuro |
| sub-2 | Componentes base shadcn (`ui/`) | Sombras por token, radios consistentes, bordes finos, glass en Dialog/Select, micro-interacciones 150–250 ms; API intacta |
| sub-3 | Navegación del panel (`(dashboard)/layout.tsx`) | Barra glass/`backdrop-blur`, jerarquía e iconos, estado activo con acento, responsive real |
| sub-4 | Dashboard (`/dashboard`) | Métricas con *empty state*, *tiles* de navegación, *skeletons* de carga, estado de error claro |
| sub-5 | Agenda / citas (`/appointments`) | Franja de acento por estado, badges tintados, iconografía de detalle, navegación de fecha en control segmentado, chips de profesional, estados empty/loading/error, *reveal* escalonado |
| sub-6 | Clientes (`/customers`) | Tabla refinada con avatares de iniciales y *chevron*, estados cuidados, ficha con cabecera de avatar, tarjetas de stats con chips de icono, *timeline* de visitas |
| sub-7 | Panel del día (`/day-panel`) | Restyle premium del panel diario |
| sub-8 | Subpáginas de ajustes (`/ajustes`) | Restyle premium de las subpáginas de configuración |
| sub-9 | TPV / caja (`/tpv`) | Tablet-first: botonera táctil amplia, ticket con *stepper* de cantidad, totales fijos, control segmentado, estados de cobro/cambio; lógica de caja y facturación intacta |
| sub-10 | Login (`(auth)/login`) | Minimalismo con aire, marca sutil, errores claros |
| sub-11 | Reserva pública (`/reservar/[slug]`) | Restyle premium del *wizard* de reserva público |
| sub-12 | Tema + accesibilidad | Modo claro/oscuro real (provider + script sin FOUC + selector) y auditoría de accesibilidad AA |

> Nota: `/arqueo` y `/products` comparten el mismo lenguaje base (componentes
> refinados en sub-2 y navegación en sub-3).

---

## 9. Cómo extender el sistema

1. **Nuevo color/estado:** añade la variable en `:root` **y** en `.dark` de
   `globals.css`, verifica AA en ambos, y mapéala en `tailwind.config.ts`.
2. **Nuevo componente:** parte de un componente `ui/` existente; usa tokens,
   `rounded-lg`, `shadow-sm`, `ease-apple-out`. No introduzcas literales de color.
3. **Verifica siempre** en claro, oscuro y `system`, con teclado y con
   `prefers-reduced-motion` activo.
