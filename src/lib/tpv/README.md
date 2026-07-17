# TPV — Ticket de compra imprimible (impresora térmica)

Genera e imprime el **ticket de compra** de una venta de caja en una impresora
**térmica de rollo** (58 u 80 mm), directamente desde el navegador del TPV.

> ℹ️ El ticket de compra **no es una factura**. La factura fiscal (Veri\*factu:
> simplificada F2 o completa F1, con QR de cotejo y encadenamiento SHA-256) es un
> flujo aparte en `src/lib/invoicing/` + `tpv/invoice-actions.ts`. Ambos coexisten.

> 🔌 **Otros periféricos y fidelización del TPV.** La guía operativa de
> **conexión/instalación** de la impresora y del **lector de carné (escáner HID)**,
> junto con el **modelo de fidelización nativo y local** (sin API externa ni
> `LOYALTY_API_KEY`) y la **acreditación best-effort + reintento**, está en
> **[`MANTENIMIENTO.md` → "TPV, caja y facturación"](../../../MANTENIMIENTO.md#tpv-caja-y-facturación)**.
> El foco del escáner (input siempre enfocado + Enter) vive en
> `src/hooks/use-scanner-focus.ts` + `src/lib/loyalty/scanner-focus.ts`; el núcleo
> de fidelización, en [`src/lib/loyalty/README.md`](../loyalty/README.md).

## Piezas

| Archivo | Qué contiene |
|---|---|
| `src/lib/tpv/ticket-document.ts` | `buildTicketDocumentHtml(data, options)` — función **pura** que produce un documento HTML **autónomo** (estilos en línea, sin recursos externos) dimensionado para rollo térmico. Tipos `TicketDocumentData`, `TicketDocumentLine`, `TicketDocumentLoyalty`, etc. |
| `src/app/(dashboard)/tpv/print-ticket.ts` | `buildTicketData(...)` — mapeo **puro** del estado del carrito a `TicketDocumentData`. `printTicketDocument(data, options)` — abre el documento en un **iframe oculto** y lanza `window.print()`. `PAYMENT_METHOD_LABELS`. |
| `src/app/(dashboard)/tpv/tpv-view.tsx` | Congela la "foto" de la venta al cobrar y muestra **«Imprimir ticket»** + selector de ancho (80/58 mm) en el diálogo *Venta registrada*. |

## Qué incluye el ticket

- Cabecera: nombre del salón, fecha-hora del cobro y nº de ticket (prefijo del id de venta).
- **Líneas**: concepto, `cantidad × precio unitario` e importe por línea.
- **Descuento del cupón** de bienvenida, si se aplicó (con el subtotal previo).
- **Totales/IVA**: base imponible, desglose de IVA por tipo (base + cuota) y total.
- **Medios de pago** (uno o varios = pago mixto).
- **Fidelización** —solo si hubo cliente escaneado—: puntos ganados, saldo y, si
  la visita desbloqueó un hito, la recompensa (etiqueta + código).
- Nota del ticket (si la hubo) y aviso de que **no es una factura**.

## Por qué un documento HTML + iframe oculto (y no `@media print` sobre la app)

El ticket vive como **documento HTML propio** con su `@page { size: 58mm/80mm }` y
sus reglas `@media print`. Se imprime cargándolo en un **iframe oculto** y llamando
a `iframe.contentWindow.print()`. Ventajas frente a ocultar toda la app con
`@media print` y hacer `window.print()` de la página:

- **Aísla el tamaño de página** del rollo térmico del tamaño de la app (A4/pantalla).
- Evita el frágil "oculta todo menos el ticket" en una app grande.
- No abre pestañas ni ventanas nuevas (mejor en tablet; sin bloqueos de pop-ups).
- La función generadora es **pura** ⇒ testeable sin DOM (ver `src/tests/unit/tpv-ticket-document.test.ts`).

El iframe se retira al terminar (`onafterprint`, con respaldo por *timeout*).

## Compatibilidad de anchos

`rollWidthMm: 80` (por defecto) o `58`. El generador ajusta el tipo de letra y el
`@page`. La mayoría de impresoras térmicas de tickets (ESC/POS) exponen un driver
del sistema; el navegador imprime contra él como con cualquier impresora.

---

## Mejora futura (NO implementada): impresión directa ESC/POS por WebUSB

Hoy la impresión pasa por el **diálogo de impresión del sistema** (`window.print()`),
que es universal pero requiere una interacción y depende del driver instalado. Para
un flujo "un toque → sale el ticket", se puede hablar **directamente** con la
impresora térmica por [**WebUSB**](https://developer.mozilla.org/docs/Web/API/WebUSB_API)
enviando comandos **ESC/POS** (el lenguaje de las impresoras de tickets Epson y
compatibles). Queda documentado aquí como vía futura:

### Boceto de la vía WebUSB + ESC/POS

1. **Selección del dispositivo** (requiere gesto del usuario y contexto seguro HTTPS):
   ```ts
   const device = await navigator.usb.requestDevice({
     // Filtra por fabricante; p. ej. Epson (vendorId 0x04b8). Idealmente se
     // configura por salón en Ajustes en vez de fijarlo en el código.
     filters: [{ vendorId: 0x04b8 }],
   });
   await device.open();
   if (device.configuration === null) await device.selectConfiguration(1);
   await device.claimInterface(0); // el nº de interfaz depende del modelo
   ```
2. **Construcción del buffer ESC/POS** en vez de HTML. Comandos habituales:
   - `ESC @` (`1B 40`) — inicializa/resetea la impresora.
   - `ESC a n` — alineación (0 izq, 1 centro, 2 der).
   - `ESC E n` — negrita on/off; `GS ! n` — tamaño (ancho/alto) del carácter.
   - Texto en **CP437/CP858** (no UTF-8): cuidado con `€`, tildes y `ñ`.
   - `GS V` — corte de papel (total/parcial), si el modelo lo soporta.
   - Opcional: `GS k` para imprimir un **código de barras/QR** del nº de ticket.
   Conviene una util `buildTicketEscPos(data): Uint8Array` **pura** (espejo de
   `buildTicketDocumentHtml`), reutilizando el mismo `TicketDocumentData`.
3. **Envío**:
   ```ts
   await device.transferOut(1 /* endpoint OUT del modelo */, escposBytes);
   await device.close();
   ```

### Consideraciones y límites

- **Soporte del navegador**: WebUSB es Chromium (Chrome/Edge/Android). Safari/iOS
  **no** lo soportan ⇒ mantener `window.print()` como alternativa universal.
- **Permisos**: `requestDevice()` exige un gesto del usuario y HTTPS; el permiso se
  recuerda por origen+dispositivo pero conviene una pantalla de emparejamiento en
  Ajustes del salón (guardar `vendorId`/`productId`/endpoint elegidos).
- **Codificación** y **modelo-dependencia**: el juego de comandos, la interfaz y el
  endpoint varían por fabricante; parametrizar por salón.
- **Sistema operativo**: en algunos SO el driver del kernel puede "reclamar" el
  dispositivo e impedir `claimInterface`; puede requerir configuración (p. ej.
  reglas udev en Linux) fuera del alcance del navegador.

Recomendación: implementarla como **estrategia opcional** detrás de la misma acción
"Imprimir ticket" (WebUSB si está emparejada y disponible; si no, `window.print()`),
reutilizando `TicketDocumentData` como fuente única de verdad del contenido.
