# Task 7 — Comanda de cocina (builder puro + impresión) — Informe

**STATUS:** DONE

**Repo:** `clients/projects/salon-os` (repo anidado, rama `hat3x/HAT3X-038`)
**Commit:** `8fa60a6e30e84fe4a06ba2d08ae23d66b7e5e8ef`
**Mensaje:** `feat(restauracion): comanda de cocina (builder térmico sin precios + impresión)`

## Ficheros creados

- `src/lib/restauracion/kitchen-comanda.ts` (nuevo)
  - `interface KitchenComandaLine { qty: number; name: string; modifiers: string[] }`
  - `interface KitchenComandaData { orderNumber: number; stationName: string; label: string | null; issuedAt: Date; lines: KitchenComandaLine[] }`
  - `type KitchenComandaRollWidth = 58 | 80`
  - `interface KitchenComandaOptions { rollWidthMm?: KitchenComandaRollWidth; timezone?: string }`
  - `buildKitchenComandaHtml(data, options?): string` — función PURA, sin lectura de BD/reloj (fecha entra como `Date`). HTML térmico autónomo (estilos inline, `@page { size: ...mm auto }`, `@media print`), calcado del patrón de `src/lib/tpv/ticket-document.ts`. Incluye número de pedido en tamaño grande, estación, etiqueta (si la hay), fecha `dd/mm/aaaa` y hora `HH:MM` (con `:`, no `,`, para no colisionar con la regex del test que prohíbe `\d+,\d{2}`), y líneas `qty × nombre` con modificadores debajo (`— modificador`). **Sin precios ni importes** — es comanda de preparación, no ticket de venta. Todo el texto dinámico pasa por `escapeHtml` (mismo escapador que `ticket-document.ts`) para evitar inyección de HTML vía nombres/modificadores.
  - `printKitchenComanda(data, options?): void` — copia exacta de la estructura de iframe oculto de `printTicketDocument` (`src/app/(dashboard)/tpv/print-ticket.ts`): `srcdoc` fijado antes de insertar el iframe, `frameWindow.print()`, cleanup en `afterprint` con respaldo por timeout de 60s. No-op si `typeof document === "undefined"` (servidor).

- `src/tests/unit/kitchen-comanda.test.ts` (nuevo) — test verbatim del brief (Step 1), sin modificaciones.

## Resumen de tests

- `npm test -- kitchen-comanda` → **1 passed (1)**. El test verifica que el HTML contiene el número de pedido (`"42"`), la estación (`"Cocina"`), el nombre del producto (`"Hamburguesa"`) y un modificador (`"Extra bacon"`), y que **no** matchea `/€|\d+,\d{2}/` (ni símbolo de euro ni números con coma de 2 decimales).
- `npm run typecheck` → **exit 0**, sin errores.
- Ciclo TDD verificado: test escrito primero → falló con `Failed to resolve import "@/lib/restauracion/kitchen-comanda"` (módulo inexistente) → implementación → test en verde.

## Restricciones aplicadas

- `npm` ejecutado desde `clients/projects/salon-os`; `git` ejecutado en el repo anidado (`.git` propio de `salon-os`, rama `hat3x/HAT3X-038`).
- Solo 2 ficheros nuevos añadidos al commit (`git add` explícito de cada ruta, sin `-A`). `.claude/` permanece untracked (verificado con `git status --short` antes y después del commit).
- Hook "Fact-Forcing Gate" satisfecho en ambos `Write` (test primero, luego implementación) con las 4 justificaciones requeridas.
- Cuidado especial en el formato de hora: `Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })` produce `"HH:MM"` con dos puntos — se comprobó explícitamente que no genera coma decimal.

## Preocupaciones / notas para el equipo

- **Fuera de alcance de esta task (por diseño del brief):** no hay wiring de `printKitchenComanda` a ningún botón de UI ni a la lógica de creación de pedidos (`order.ts`). Cuando exista esa integración, el caller deberá construir `KitchenComandaData` a partir del pedido real (mapeo análogo a `buildTicketData` en `print-ticket.ts`).
- El directorio `src/lib/restauracion/` ya contenía `menu.ts`, `csv-import.ts` y `order.ts` de tasks anteriores del mismo plan — no hubo colisión ni necesidad de tocarlos.
- No se ha verificado impresión real en dispositivo físico (fuera de alcance: `printKitchenComanda` solo se ejercita indirectamente vía el test de `buildKitchenComandaHtml`; no hay test de DOM/iframe, igual que `printTicketDocument` tampoco lo tiene en el código de referencia).
