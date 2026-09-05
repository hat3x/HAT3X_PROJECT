# Auditoría de accesibilidad — gráficas y tablas (sub-13)

> Ámbito: `/analitica` (gráficas de recharts + rankings) y las tablas de
> `/facturacion` (facturas, tickets y detalle de ticket). Estándar de referencia:
> **WCAG 2.2 AA**. Objetivo: cada gráfica tiene una alternativa accesible, nada
> depende SOLO del color, y las tablas se pueden recorrer con teclado en móvil,
> todo dentro de los tokens/estilo premium existentes.

## 1. Resumen

| Requisito de la tarea | Estado |
|---|---|
| Alternativa accesible por gráfica (tabla de datos o resumen textual + `aria-label`) | ✅ |
| Sin información transmitida SOLO por color | ✅ |
| Tablas con scroll horizontal en móvil (y recorribles con teclado) | ✅ |
| Gráficas adaptativas (responsive) | ✅ |
| Integrado en los tokens/estilo premium | ✅ |
| Respeta «prefiero menos movimiento» | ✅ |

Verificación automatizada: `tsc --noEmit` limpio y **1072 tests** en verde
(incluye `chart-data-table.test.tsx`, que fija el contrato de accesibilidad de la
tabla alternativa). Revisión manual: recorrido del árbol de accesibilidad y del
orden de foco sobre el marcado resultante.

## 2. Método

- **Automatizado**: se añadió `src/tests/unit/chart-data-table.test.tsx`, que
  comprueba con Testing Library los roles reales que percibe una tecnología de
  apoyo (`table` con nombre por `caption`, `columnheader`/`rowheader` por `scope`,
  `region` enfocable). El resto de la suite (`metrics-*`, `facturacion-*`) cubre
  que los datos que alimentan la vista son correctos.
- **Manual (razonado sobre el código)**: para cada gráfica se verificó qué anuncia
  un lector de pantalla (`role="img"` + resumen), que exista una alternativa
  textual con el dato exacto, y que ninguna distinción dependa solo del color.

## 3. Patrón: la gráfica como imagen con nombre + alternativa de datos

Un SVG de recharts no es recorrible por un lector de pantalla. Patrón aplicado en
`analitica-charts.tsx` (`ChartShell`):

- El contenedor de la gráfica se expone como **`role="img"`** con un **`aria-label`
  de resumen** (rango temporal, pico, o total y % por sector). Así el SVG se
  anuncia como UNA imagen con nombre y sus descendientes (ejes, sectores) pasan a
  ser presentacionales, en lugar de leerse como ruido.
- El **dato exacto** vive en una alternativa textual siempre presente en el DOM:
  - Gráfica de tendencia → `ChartDataTable` (tabla semántica dentro de un
    `<details>` «Ver tabla de datos»), con TODAS las métricas por bucket, no solo
    la activa.
  - Donuts (métodos de pago, composición de clientes) → lista (`<ul>`) de leyenda
    con etiqueta + importe + porcentaje por sector.

Criterios cubiertos: **1.1.1 Contenido no textual**, **1.3.1 Información y
relaciones**, **4.1.2 Nombre, función, valor**.

## 4. Sin información solo por color (1.4.1)

- **Tooltips** (tendencia y donut): cada línea lleva el texto de la etiqueta y el
  valor; el punto de color es `aria-hidden` y meramente decorativo.
- **Selector de métrica** de la tendencia: botones con texto (`Facturación`,
  `Tickets`, `Ticket medio`) y `aria-pressed`; el color no es el único indicador
  del estado activo (también cambian fondo/sombra y el `aria-pressed`).
- **Leyenda del donut**: texto (etiqueta + importe + %) además del color; los
  sectores adyacentes se separan con un trazo de `hsl(var(--card))` (frontera no
  cromática, no solo tono).
- **Rankings** (`RankBars`) y **ocupación** (`OccupancyMeter`): la barra es refuerzo
  visual; el valor va SIEMPRE como texto. La ocupación usa `role="progressbar"`
  con `aria-valuenow/min/max` y el `%` como texto.
- **Estados** de ticket/factura: `Badge` con etiqueta de texto, no un color suelto.

## 5. Tablas recorribles con teclado en móvil (2.1.1, 1.4.10)

`components/ui/table.tsx` acepta `scrollRegionLabel`. Cuando se indica, el
contenedor con `overflow-x-auto` pasa a ser **`role="region"` con `aria-label` y
`tabIndex={0}`**: un usuario de teclado lo enfoca con Tab y desplaza con las
flechas, sin ratón. El anillo de foco es el de marca (`ring-ring`, inset).

Aplicado a: libro de facturas, histórico de tickets, líneas del detalle de ticket
y las tablas de datos de las gráficas. Cada una añade además:

- `<caption class="sr-only">` que da nombre a la tabla para lectores de pantalla.
- `scope="col"` en las cabeceras de columna y `scope="row"` en la primera celda de
  cada fila (identifica la fila —periodo, número de factura— al leer sus celdas).

El contenido reflota (no hay anchos fijos que rompan el zoom); el scroll horizontal
es la vía prevista cuando la tabla no cabe, sin pérdida de información.

## 6. Gráficas adaptativas (1.4.10 Reflujo)

Todas las gráficas usan `ResponsiveContainer width="100%"`: se miden en cliente y
se redibujan al cambiar el ancho. La rejilla de la página apila las tarjetas en una
sola columna en móvil (`grid ... lg:grid-cols-2`, `sm:grid-cols-2 xl:grid-cols-4`).

## 7. Movimiento (2.3.3 Animación por interacción)

Doble defensa ante «prefiero menos movimiento»:

- **CSS** (`globals.css`): un bloque `@media (prefers-reduced-motion: reduce)`
  neutraliza animaciones y transiciones de toda la app (incluidos los
  `animate-fade-up` de tarjetas y tablas).
- **JS** (`usePrefersReducedMotion`): desactiva la animación de entrada de recharts
  (área y sectores del donut), que el CSS anterior no alcanza.

## 8. Estados de carga / vacío / foco

- **Carga**: la gráfica muestra un `Skeleton` del mismo alto (evita salto de layout)
  como `role="img"` con nombre «Cargando la gráfica…».
- **Vacío**: `role="img"` con el mensaje de vacío como nombre; el icono es
  decorativo (`aria-hidden`).
- **Foco visible** (2.4.7 / 2.4.11): anillo de foco coherente en toda la app
  (`:focus-visible` global) y en cada control interactivo (botones del selector,
  disclosure, enlaces de documento/detalle, región desplazable).

## 9. Alcance revisado sin cambios necesarios

- `customer-qr.tsx`: el QR ya se expone como `role="img"` con `aria-label` y el
  token va como texto (`<code>`) con copia y `aria-live`. No es una gráfica de
  datos; sin acción.
- No existen otras gráficas/SVG de datos en la app (búsqueda de `recharts`,
  `ResponsiveContainer`, `<*Chart`).

## 10. Notas y mejoras futuras (fuera de alcance de sub-13)

- Se podría añadir una tabla de datos formal (además de la leyenda) a los donuts si
  se quiere total homogeneidad con la tendencia; hoy la leyenda ya aporta el dato
  exacto por sector.
- Verificación con lector de pantalla real (NVDA/VoiceOver) y auditoría de contraste
  de la paleta categórica con herramienta automática (axe) quedan recomendadas como
  paso de QA manual antes de release.

## 11. Ficheros tocados (sub-13)

| Fichero | Cambio |
|---|---|
| `src/components/ui/table.tsx` | Región desplazable enfocable (`scrollRegionLabel`) + `TableFooter`/`caption` |
| `src/app/(dashboard)/analitica/chart-data-table.tsx` | **Nuevo**: tabla de datos alternativa a una gráfica |
| `src/app/(dashboard)/analitica/analitica-charts.tsx` | `role="img"` + resumen, tabla/leyenda alternativa, reduced-motion, sin color-solo |
| `src/app/(dashboard)/facturacion/facturas/invoices-table.tsx` | Región desplazable + `caption` + `scope` |
| `src/app/(dashboard)/facturacion/tickets/sales-table.tsx` | Región desplazable + `caption` + `scope` |
| `src/app/(dashboard)/facturacion/tickets/[id]/ticket-detail-view.tsx` | Región desplazable + `caption` + `scope` en las líneas |
| `src/tests/unit/chart-data-table.test.tsx` | **Nuevo**: fija el contrato de accesibilidad de la tabla alternativa |
