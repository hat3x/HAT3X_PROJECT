# TPV — Capa de API de cobros (Edge Functions + Zod + TanStack Query)

Capa **aditiva** de aplicación para el módulo TPV: crear tickets, gestionar
líneas, aplicar descuentos, calcular totales e IVA, registrar pagos (efectivo,
tarjeta y **mixto**) y **emitir facturas** (numeración por salón + serie,
snapshot fiscal y exportación a PDF) e **integra con la agenda/reservas**
(precargar un ticket desde una reserva completada, con enlace bidireccional de
estado). Se apoya en el esquema de `db/` (migraciones `tpv_*`) y en su **RLS por
`salon_id`**. **No modifica** la agenda ni la tabla `reservas`: sólo lee (vía
vistas) y enlaza.

> Sub-tareas **sub-3** (cobros), **sub-6** (facturación) y **sub-7**
> (integración con reservas). Dependen de sub-1 (esquema
> `20260713000001_tpv_module`) y sub-2 (RLS `20260713000002_tpv_rls`); la
> facturación añade `20260713000003_tpv_facturacion` y la integración
> `20260713000005_tpv_reservas_integracion`.

## Estructura

```
tpv/
├── shared/                 # Núcleo compartido servidor + cliente (sin framework)
│   ├── money.ts            #   Cálculo autoritativo: líneas, IVA, totales, saldo
│   ├── money_test.ts       #   Tests del núcleo (deno test)
│   ├── factura.ts          #   Snapshot de factura: líneas, desglose, formato
│   ├── facturaHtml.ts      #   Render HTML imprimible/descargable a PDF (puro)
│   ├── factura_test.ts     #   Tests de facturación (deno test)
│   ├── schemas.ts          #   Esquemas Zod (contrato de entrada) + tipos inferidos
│   ├── types.ts            #   Tipos de filas de BD / respuestas de la API
│   └── errors.ts           #   ErrorTpv tipado (código estable + estado HTTP)
├── functions/              # Supabase Edge Functions (Deno)
│   ├── _shared/            #   cors · http · supabase · ticket · factura
│   ├── tpv-crear-ticket/
│   ├── tpv-actualizar-lineas/
│   ├── tpv-registrar-pago/
│   ├── tpv-obtener-ticket/
│   ├── tpv-emitir-factura/
│   ├── tpv-obtener-factura/
│   ├── deno.json
│   └── import_map.json
├── web/                    # Consumo desde el navegador
│   ├── apiClient.ts        #   Invocación tipada de las funciones + ErrorTpv
│   ├── queryKeys.ts        #   Fábrica de query keys
│   ├── hooks.ts            #   Hooks de dominio TanStack Query
│   └── facturaPdf.ts       #   Imprimir / descargar la factura como PDF
├── .env.example
└── README.md
```

## Principios de diseño

- **El servidor es autoritativo del dinero.** El cliente nunca envía
  `subtotal`, `total` ni `importe_impuesto`: manda líneas (cantidad, precio,
  descuento, %IVA) y el servidor recalcula con `shared/money.ts` antes de
  persistir. El mismo núcleo se usa en el navegador sólo para *previsualizar*.
- **Autorización por RLS, no por código.** Las funciones reenvían el **JWT del
  usuario** (rol `authenticated`); jamás usan `service_role`. Así el aislamiento
  por salón de sub-2 se aplica de extremo a extremo. Un intento de tocar otro
  salón devuelve `PROHIBIDO` (violación de RLS) o `NO_ENCONTRADO` (invisible).
- **Un único contrato Zod** (`shared/schemas.ts`) valida en cliente (fallo
  rápido) y en servidor (fuente de verdad). Los tipos se **infieren** con
  `z.infer`, sin duplicar interfaces.
- **Aditivo.** Sólo objetos nuevos con prefijo `tpv-`/`tpv_`. No modifica
  reservas ni ninguna función existente.

## Endpoints (Edge Functions)

Todas son `POST`, cuerpo JSON, respuesta `TicketCompleto`
(`{ venta, lineas, pagos, saldo }`), salvo error.

| Función | Cuerpo (Zod) | Efecto |
|---|---|---|
| `tpv-crear-ticket` | `crearTicketSchema` | Crea la venta `abierta` (nº por trigger) + líneas iniciales opcionales. `201`. |
| `tpv-actualizar-lineas` | `actualizarLineasSchema` | Reemplaza el **conjunto completo** de líneas y recalcula la cabecera. Cubre añadir/editar/borrar/descontar. `200`. |
| `tpv-registrar-pago` | `registrarPagoSchema` | Registra 1..N pagos (efectivo/tarjeta/**mixto**), valida métodos del salón, controla sobrepago/insuficiencia y marca `pagada` si queda cubierta. `200`. |
| `tpv-obtener-ticket` | `obtenerTicketSchema` | Devuelve el agregado completo con saldo. `200`. |

Facturación (respuesta `FacturaCompleta` = `{ factura, referencia }`):

| Función | Cuerpo (Zod) | Efecto |
|---|---|---|
| `tpv-emitir-factura` | `emitirFacturaSchema` | Emite la factura de un ticket: congela emisor/cliente/desglose/líneas y la BD asigna el nº correlativo por `(salon, serie)`. `201`. |
| `tpv-obtener-factura` | `obtenerFacturaSchema` | Devuelve una factura por `factura_id` **o** `venta_id`. `200`. |

Integración con la agenda/reservas (sub-7):

| Función | Cuerpo (Zod) | Efecto |
|---|---|---|
| `tpv-crear-ticket-desde-reserva` | `crearTicketDesdeReservaSchema` | Convierte una reserva **completada** en un ticket precargado (servicio + cliente). Idempotente: si la reserva ya tiene ticket vivo lo devuelve (`200`, `ya_existia:true`); si lo crea, `201`. Respuesta `TicketDesdeReserva` = `{ ticket, ya_existia }`. |
| `tpv-obtener-reserva-cobro` | `obtenerReservaCobroSchema` | Estado de cobro de una reserva (enlace bidireccional). Respuesta `ReservaCobro`. `200`. |

### Cálculo de IVA y totales

Convención España, `precio_unitario` = base **sin** IVA:

```
base_bruta       = cantidad × precio_unitario
descuento        = descuento_pct? base_bruta·pct/100 : descuento   (acotado a [0, base_bruta])
base_neta        = base_bruta − descuento
importe_impuesto = round2(base_neta × tipo_impuesto/100)            (redondeo POR LÍNEA)
total_linea      = base_neta + importe_impuesto

Cabecera:  subtotal = Σ base_neta · descuento_total = Σ descuento
           impuestos_total = Σ importe_impuesto · total = subtotal + impuestos_total
```

`money.ts` expone además `desglose_iva` (base/cuota por tipo) para facturas.

### Pagos (efectivo, tarjeta, mixto)

- `pagos: [{ metodo_pago_id, importe, referencia_externa?, estado? }]`.
  Varios elementos → **pago mixto** (p.ej. 40 € tarjeta + 20 € efectivo).
- Importe **positivo** cobra; **negativo** devuelve/da cambio.
- El saldo sólo cuenta pagos `completado`. `marcar_pagada` (def. `true`) exige
  cubrir el total salvo `permitir_parcial: true`. El **sobrepago** se rechaza
  (`SOBREPAGO`): para efectivo, incluye una línea de cambio con importe negativo.

### Facturación (sub-6)

- **Numeración correlativa por salón.** El nº de factura lo asigna el trigger
  `tpv_asignar_numero_factura()` (BD) bajo *advisory lock* por `(salon_id, serie)`:
  **sin saltos** y seguro ante concurrencia. La referencia visible es
  `SERIE/NÚMERO` con relleno (`A/000123`).
- **Serie configurable por salón.** `tpv_config_facturacion.serie_por_defecto`
  fija la serie; se puede sobrescribir por emisión (`serie` en el cuerpo).
  Cambiar de serie reinicia su correlativo desde 1 (comportamiento fiscal).
- **Datos fiscales.** Del **emisor** (el salón) salen de la config
  (`emisor_razon_social/nif/direccion_fiscal`); los del **cliente** llegan en la
  petición (`cliente: { razon_social, nif, direccion_fiscal, email }`). Sin datos
  de cliente → factura simplificada («cliente contado»).
- **Snapshot inmutable.** Al emitir se **congelan** en la fila de factura el
  emisor, el desglose de IVA y las líneas (`lineas_snapshot`). La factura es
  autocontenida: se reimprime igual aunque cambien la config o el ticket.
- **Bases e IVA autoritativos.** `base_imponible`, `impuestos`, `total` y el
  `desglose_iva` se **recalculan** en el servidor desde las líneas persistidas
  con el mismo `money.ts` (nunca se reciben del cliente).
- **Un ticket = una factura.** `UNIQUE(venta_id)` → segundo intento
  `TICKET_YA_FACTURADO`. Un ticket `anulada`/`reembolsada` o vacío no es
  facturable (`TICKET_NO_FACTURABLE`).

#### Exportar a PDF (imprimible / descargable)

`shared/facturaHtml.ts` genera un HTML **autocontenido** (CSS embebido, A4). La
exportación a PDF usa la impresión del navegador (sin dependencias de servidor):

```ts
import { imprimirFactura, descargarFacturaHTML } from './web/facturaPdf';

imprimirFactura(factura);        // iframe oculto → diálogo «Guardar como PDF»
descargarFacturaHTML(factura);   // descarga factura-A-000123.html (archivable)
```

### Integración con la agenda/reservas (sub-7)

Convierte una reserva **completada** en un ticket precargado y mantiene el
enlace **bidireccional** de estado, **sin tocar la tabla `reservas`** ni el flujo
de la agenda (ver `db/migrations/20260713000005_tpv_reservas_integracion`).

- **Precarga desde reserva.** `tpv-crear-ticket-desde-reserva` lee la reserva por
  la vista `tpv_v_reserva_precarga` (RLS del usuario), comprueba que su estado es
  *cobrable* (`ESTADOS_RESERVA_COMPLETADA` en `functions/_shared/reserva.ts`) y
  abre el ticket con la línea del servicio y el `cliente_id`/`empleado_id` de la
  reserva. A partir de ahí es un ticket normal (editar líneas, cobrar, facturar).
- **Idempotente y sin duplicados.** Un índice único parcial garantiza **un solo
  ticket vivo (no anulado) por reserva**. Si ya existe, la función devuelve ese
  mismo ticket (`ya_existia:true`) y resuelve la carrera si dos cajeros pulsan a
  la vez. Anular el ticket libera la reserva para volver a cobrarla.
- **Enlace hacia adelante:** `tpv_ventas.reserva_id` (ya existente). **Hacia
  atrás:** la vista `tpv_v_reservas_cobro` **deriva** el `estado_cobro`
  (`sin_ticket` → `ticket_abierto` → `cobrada`/`reembolsada`) desde `tpv_ventas`;
  no se persiste estado en la reserva. `tpv-obtener-reserva-cobro` la expone para
  pintar un chip en la agenda y abrir el ticket asociado.

```ts
import { useCrearTicketDesdeReserva, useReservaCobro } from './web/hooks';

// En la agenda: ¿cómo va el cobro de esta reserva?
const { data: cobro } = useReservaCobro(supabase, reservaId);
// cobro?.estado_cobro → 'sin_ticket' | 'ticket_abierto' | 'cobrada' | ...

// "Cobrar" desde una reserva completada → ticket precargado listo para cobrar.
const abrir = useCrearTicketDesdeReserva(supabase);
abrir.mutate(
  { reserva_id: reservaId },
  { onSuccess: ({ ticket }) => irACobro(ticket.venta.id) },
);
```

> **Supuestos de esquema de la agenda** (columnas de `public.reservas`) están
> encapsulados en la **vista** `tpv_v_reserva_precarga`. Si tu agenda usa otros
> nombres o el precio vive en `public.servicios`, adapta **solo esa vista**
> (ejemplo en el pie de la migración 0005 y en `db/README.md`). Ninguna Edge
> Function ni la capa web necesitan cambios.

## Errores

`ErrorTpv` serializa `{ error: { codigo, mensaje, detalles? } }` con estado HTTP:

| `codigo` | HTTP | Cuándo |
|---|---|---|
| `VALIDACION` | 422 | Body no cumple el esquema Zod. |
| `NO_AUTENTICADO` | 401 | Falta `Authorization`. |
| `PROHIBIDO` | 403 | Salón no permitido (RLS). |
| `NO_ENCONTRADO` | 404 | Ticket inexistente/invisible. |
| `TICKET_NO_ABIERTO` | 409 | Modificar/cobrar un ticket ya pagado/anulado. |
| `SIN_LINEAS` | 422 | Cobrar un ticket vacío. |
| `METODO_PAGO_INVALIDO` | 422 | Método inexistente/inactivo/de otro salón. |
| `SOBREPAGO` / `PAGO_INSUFICIENTE` | 409 | Descuadre en el cobro. |
| `TICKET_YA_FACTURADO` | 409 | El ticket ya tiene una factura emitida. |
| `TICKET_NO_FACTURABLE` | 409 | Ticket anulado/reembolsado o sin líneas. |
| `RESERVA_NO_COMPLETADA` | 409 | La reserva no está en un estado cobrable (sub-7). |
| `INTEGRACION_RESERVAS` | 422 | Falta la vista de integración (migración 0005 no aplicada) (sub-7). |
| `CONFLICTO` | 409 | Violación de constraint (p.ej. ya facturado). |

## Uso desde la web (TanStack Query)

```ts
import { useTicket, useRegistrarPago, previsualizarTicket } from './web/hooks';

const { data: ticket } = useTicket(supabase, ventaId);
const pago = useRegistrarPago(supabase);

// Pago mixto: parte tarjeta + parte efectivo.
pago.mutate({
  venta_id: ventaId,
  pagos: [
    { metodo_pago_id: idTarjeta, importe: 40 },
    { metodo_pago_id: idEfectivo, importe: 20 },
  ],
});

// Previsualizar total mientras el cajero edita (sin ir a red).
const totales = previsualizarTicket(lineasEnCurso);
```

Emitir factura y exportarla a PDF:

```ts
import { useEmitirFactura, useFactura } from './web/hooks';
import { imprimirFactura } from './web/facturaPdf';

const emitir = useEmitirFactura(supabase);

emitir.mutate(
  { venta_id: ventaId, cliente: { razon_social: 'ACME S.L.', nif: 'B12345678' } },
  { onSuccess: ({ factura }) => imprimirFactura(factura) }, // → PDF del navegador
);

// Reabrir/reimprimir una factura ya emitida de un ticket.
const { data: fac } = useFactura(supabase, ventaId);
```

## Ejecutar / desplegar

```bash
# Tests del núcleo (no necesita red ni Supabase)
deno test tpv/shared/money_test.ts tpv/shared/factura_test.ts

# Servir en local (requiere migraciones sub-1 + sub-2 + sub-6 aplicadas)
supabase functions serve --import-map tpv/functions/import_map.json

# Desplegar cada función (lo realiza el responsable de release, no el agente)
supabase functions deploy tpv-crear-ticket       --import-map tpv/functions/import_map.json
supabase functions deploy tpv-actualizar-lineas  --import-map tpv/functions/import_map.json
supabase functions deploy tpv-registrar-pago     --import-map tpv/functions/import_map.json
supabase functions deploy tpv-obtener-ticket     --import-map tpv/functions/import_map.json
supabase functions deploy tpv-emitir-factura     --import-map tpv/functions/import_map.json
supabase functions deploy tpv-obtener-factura    --import-map tpv/functions/import_map.json
supabase functions deploy tpv-crear-ticket-desde-reserva --import-map tpv/functions/import_map.json
supabase functions deploy tpv-obtener-reserva-cobro      --import-map tpv/functions/import_map.json
```

> **Deno/Supabase importa `shared/` con extensión `.ts`; el bundler de la web lo
> importa sin extensión en el boundary web→shared.** Las dependencias *externas*
> de `shared/` se limitan a `zod` (en `schemas.ts`); los cross-imports internos
> (`factura.ts` → `money.ts`/`types.ts`, `facturaHtml.ts` → `factura.ts`) usan
> `.ts` porque Deno lo exige, y los bundlers modernos (Vite/esbuild/Turbopack)
> resuelven la extensión explícita sin configuración extra. Peer deps de la web:
> `react`, `@tanstack/react-query`, `@supabase/supabase-js`, `zod`.

## Verificación realizada

- Aritmética de `money.ts` (IVA por línea, descuentos importe/%, agregación,
  desglose y saldo mixto/parcial/sobrepago) comprobada numéricamente. Suite en
  `shared/money_test.ts` (`deno test`) — Deno no está instalado en el entorno
  del agente; ejecútala en CI.
- Facturación (`shared/factura.ts`, `shared/facturaHtml.ts`): snapshot de
  líneas, resumen base/IVA/total, desglose por tipo, formato de referencia y
  render HTML (escapado anti-inyección, factura simplificada, auto-impresión) en
  `shared/factura_test.ts` (`deno test`). Tipado estricto de los módulos puros
  `shared/factura.ts` + `shared/facturaHtml.ts` verificado con `tsc --strict`
  (sin errores). Las Edge Functions y la capa web se ejercitan en CI/preview.
- Integración con reservas (sub-7): la invariante "un ticket vivo por reserva" y
  la derivación de `estado_cobro` se comprueban en
  `db/tests/tpv_reservas_integracion_test.sql` (autocontenido, `psql` con
  `ROLLBACK`). Deno no está instalado en el entorno del agente; ejecútalo en CI.
