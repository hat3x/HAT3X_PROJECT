# TPV — Capa de API de cobros (Edge Functions + Zod + TanStack Query)

Capa **aditiva** de aplicación para el módulo TPV: crear tickets, gestionar
líneas, aplicar descuentos, calcular totales e IVA y registrar pagos (efectivo,
tarjeta y **mixto**). Se apoya en el esquema de `db/` (migraciones `tpv_*`) y en
su **RLS por `salon_id`**. No toca ni la agenda ni los endpoints de reservas.

> Sub-tarea **sub-3**. Depende de sub-1 (esquema `20260713000001_tpv_module`) y
> sub-2 (RLS `20260713000002_tpv_rls`).

## Estructura

```
tpv/
├── shared/                 # Núcleo compartido servidor + cliente (sin framework)
│   ├── money.ts            #   Cálculo autoritativo: líneas, IVA, totales, saldo
│   ├── money_test.ts       #   Tests del núcleo (deno test)
│   ├── schemas.ts          #   Esquemas Zod (contrato de entrada) + tipos inferidos
│   ├── types.ts            #   Tipos de filas de BD / respuestas de la API
│   └── errors.ts           #   ErrorTpv tipado (código estable + estado HTTP)
├── functions/              # Supabase Edge Functions (Deno)
│   ├── _shared/            #   cors · http (Zod parse + errores) · supabase · ticket
│   ├── tpv-crear-ticket/
│   ├── tpv-actualizar-lineas/
│   ├── tpv-registrar-pago/
│   ├── tpv-obtener-ticket/
│   ├── deno.json
│   └── import_map.json
├── web/                    # Consumo desde el navegador
│   ├── apiClient.ts        #   Invocación tipada de las funciones + ErrorTpv
│   ├── queryKeys.ts        #   Fábrica de query keys
│   └── hooks.ts            #   Hooks de dominio TanStack Query
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

## Ejecutar / desplegar

```bash
# Tests del núcleo de cálculo (no necesita red ni Supabase)
deno test tpv/shared/money_test.ts

# Servir en local (requiere migraciones sub-1 + sub-2 aplicadas)
supabase functions serve --import-map tpv/functions/import_map.json

# Desplegar cada función (lo realiza el responsable de release, no el agente)
supabase functions deploy tpv-crear-ticket      --import-map tpv/functions/import_map.json
supabase functions deploy tpv-actualizar-lineas  --import-map tpv/functions/import_map.json
supabase functions deploy tpv-registrar-pago     --import-map tpv/functions/import_map.json
supabase functions deploy tpv-obtener-ticket     --import-map tpv/functions/import_map.json
```

> **Deno/Supabase importa `shared/` con extensión `.ts`; el bundler de la web lo
> importa sin extensión.** Los ficheros de `shared/` son autocontenidos (sólo
> `schemas.ts` depende de `zod`), por lo que ambos consumos conviven sin build.
> Peer deps de la web: `react`, `@tanstack/react-query`, `@supabase/supabase-js`,
> `zod`.

## Verificación realizada

- Aritmética de `money.ts` (IVA por línea, descuentos importe/%, agregación,
  desglose y saldo mixto/parcial/sobrepago) comprobada numéricamente. Suite en
  `shared/money_test.ts` (`deno test`) — Deno no está instalado en el entorno
  del agente; ejecútala en CI.
