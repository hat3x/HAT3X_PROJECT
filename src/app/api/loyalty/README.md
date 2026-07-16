# `POST /api/loyalty/*` — Proxy servidor de fidelización (denueveanueve)

Route Handlers que actúan de **proxy en servidor** hacia las Edge Functions de
fidelización de denueveanueve. Su único motivo de existir es de seguridad:

> La clave de servicio `LOYALTY_API_KEY` (`dn9_…`) **jamás** llega al navegador.
> El TPV llama a estos endpoints; ellos —solo en servidor— añaden la cabecera
> `x-api-key` y devuelven al cliente únicamente los datos de fidelización.

Se apoyan en la capa cliente `@/lib/loyalty` (sub-1), que hace la llamada HTTP y
normaliza los fallos a `LoyaltyError`.

## Endpoints

### `POST /api/loyalty/lookup`

Consulta el estado de fidelización de un cliente por su QR.

```jsonc
// Petición
{ "qr_token": "QR-DEL-CLIENTE" }

// 200 OK
{
  "member":  { "id": "…", "name": "Ana", "points": 30, "tier": null },
  "coupons": [ /* LoyaltyCoupon[] */ ]
}
```

### `POST /api/loyalty/verify-visit`

Registra la visita: acumula puntos por los servicios y, si se indica, canjea un
cupón. Los importes van en **céntimos enteros** (`*_cents`).

```jsonc
// Petición
{
  "qr_token": "QR-DEL-CLIENTE",
  "service_prices": [4500, 2000],   // 45,00 € + 20,00 €
  "location_id": "sede-2",          // opcional → por defecto LOYALTY_LOCATION_ID
  "redeem_coupon": "CUPON10"        // opcional → null si ninguno
}

// 200 OK
{
  "points_earned": 6,
  "points_balance": 36,
  "redeemed_coupon": null,
  "discount_cents": 0
}
```

## Contrato de estados

| Estado | Cuerpo | Cuándo |
| --- | --- | --- |
| `200` | payload | OK |
| `503` | `{ "enabled": false }` | Integración apagada (`isLoyaltyEnabled()` false) o mal configurada |
| `400` | `{ "error", "issues"? }` | Cuerpo no válido (JSON o esquema) |
| `401` | `{ "error" }` | Sin sesión de salón **o** el upstream rechazó la API key |
| `403` | `{ "error" }` | La API key no puede operar en esa sede (propagado del upstream) |
| `404` | `{ "error" }` | QR / recurso inexistente (propagado del upstream) |
| `502` | `{ "error" }` | Fallo de red, timeout u otro error del upstream (mensaje genérico) |
| `504` | `{ "error" }` | El upstream tardó más del timeout |
| `500` | `{ "error" }` | Error inesperado |

**Nunca** se devuelven al navegador la API key, la URL interna del upstream, su
cuerpo de error crudo ni el mensaje original del `LoyaltyError`. El mapeo saneado
vive en [`_lib/error-response.ts`](./_lib/error-response.ts).

## Seguridad

- **Kill-switch primero.** Si `isLoyaltyEnabled()` es `false` → `503 { enabled:
  false }` sin tocar la BD ni el upstream.
- **Autenticación obligatoria.** Solo miembros autenticados de un salón
  (`getActiveMembership()`); cualquier rol vale, es una operación de TPV. Evita
  agotar la cuota de la API de pago, enumerar QRs y fugas de PII.
- **Validación de entrada** con Zod (`@/lib/validations/loyalty`): acota
  longitudes/tamaños (mitiga cuerpos gigantes) y normaliza antes de reenviar.
- **Sin caché.** Respuestas con `cache-control: no-store` (contienen PII).
- **Logs mínimos.** En error se registra solo `{ code, upstreamStatus }`; nunca
  el `qr_token`, el cuerpo del upstream ni la API key.
- **CSRF.** La sesión viaja en cookies `SameSite=Lax` de Supabase (no se envían
  en POST cross-site); no se añade un token CSRF a medida, coherente con el resto
  de mutaciones del proyecto.

## Nota de integración

Estos handlers dependen de la capa cliente `@/lib/loyalty` (**sub-1**). El
type-check y los tests (`src/tests/unit/loyalty-routes.test.ts`) requieren que
esa capa esté presente en la rama integrada.
