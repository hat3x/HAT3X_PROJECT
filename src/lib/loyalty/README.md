# `@/lib/loyalty/*` — Núcleo NATIVO de fidelización

Réplica **nativa** (sobre el esquema propio de Salón OS, migración
`20260716120000_loyalty_base.sql`) del sistema probado en denueveanueve. Es el
"cómo se persiste" del contrato de reglas `docs/loyalty-rules-reference.md`.

> ⚠️ **No confundir con `@/lib/loyalty`** (sin subruta): ese es el **fichero
> proxy HTTP** hacia las Edge Functions de denueveanueve (sub-1/sub-2). Son
> módulos distintos que conviven durante la migración. Un **fichero** `loyalty.ts`
> y este **directorio** `loyalty/` coexisten sin colisión: `@/lib/loyalty`
> resuelve al fichero; `@/lib/loyalty/server` (etc.) resuelve a este directorio.
> Por eso este módulo **no** expone un `index.ts` (evita sombrear al proxy).

## Ficheros

| Fichero | Contenido |
| --- | --- |
| `types.ts` | Tipos, configuración (`DEFAULT_LOYALTY_CONFIG`) y catálogo de hitos (`LOYALTY_MILESTONES`). |
| `points.ts` | Lógica **pura** (sin BD): puntos por línea, hitos, código de recompensa, descuento, caducidad. Reloj y aleatoriedad inyectados → testeable. |
| `server.ts` | Acciones de **servidor**: `lookupByQr`, `awardVisit`, `ensureLoyaltyAccount`, `grantWelcomeCoupon` + `LoyaltyActionError`. |

## API

```ts
import {
  lookupByQr,
  awardVisit,
  ensureLoyaltyAccount,
  grantWelcomeCoupon,
} from "@/lib/loyalty/server";

// Solo lectura (acotado al salón activo del usuario por RLS).
const state = await lookupByQr(qrToken);

// Acredita puntos por la visita (ceil(price_cents/200) por línea salvo override),
// evalúa hitos 3/5/8/10 y, si procede, canjea el cupón de bienvenida.
const result = await awardVisit({
  salon_id: salonId,
  customer_id: customerId, // o qr_token
  line_items: [{ price_cents: 4500, label: "Corte" }, { price_cents: 2000 }],
  redeem_coupon: true,
  ref: { type: "appointment", id: appointmentId }, // idempotencia
});

await ensureLoyaltyAccount(customerId);            // idempotente
await grantWelcomeCoupon(customerId, 15);          // owner/manager, % configurable
```

## Seguridad (§4 de la nota de reglas)

- **Autorización** con el cliente RLS de la sesión (`salon_members`): un miembro
  solo opera en SU salón. `grantWelcomeCoupon` exige rol `owner`/`manager`
  (matriz RLS §4.1); `awardVisit`/`lookupByQr` admiten cualquier rol (TPV).
- **Escritura sensible** (saldo, movimientos, recompensas, cupones) con el
  cliente **admin** (service role) que omite RLS, SIEMPRE acotando a mano por
  `salon_id`. El saldo nunca es fabricable desde el navegador.

## Decisiones y limitaciones

- **Unidades (crítico, §1.1).** Puntos por línea = `ceil(price_cents / 200)`
  (≈1 punto por cada 2 €), NO `ceil(price_cents / 2)`. El ratio es configurable
  (`LoyaltyConfig.centsPerPoint`).
- **`redeem_coupon` es booleano** (canjea el cupón de bienvenida ACTIVE del
  cliente), fiel a la semántica de `verify-visit` §1.7. La capa **proxy** en
  cambio pasa un **código** de cupón: al reapuntar los handlers (`docs …§5`) hay
  que mapear ambos contratos.
- **Idempotencia razonable.** Anclada en `ref` `(ref_type, ref_id)` sobre
  `points_movements`: reintentar con la misma referencia no vuelve a acreditar.
  Sin `ref.id` no hay deduplicación.
- **Atomicidad.** `awardVisit` encadena varias escrituras con el cliente JS (sin
  transacción multi-sentencia) y el saldo se incrementa por read-modify-write.
  Para blindarlo del todo, §5/§7 recomiendan una RPC `SECURITY DEFINER`; esta
  capa queda lista para reapuntarse a ella sin cambiar su firma pública.

## Tests

`src/tests/unit/loyalty-points.test.ts` cubre la lógica pura (`points.ts`). La
orquestación con BD de `server.ts` requiere tests de integración con Supabase
(pendiente, como en `@/lib/booking/server`).
