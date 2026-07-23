# Contratos y firmas reutilizables por los scripts de *seed* (datos demo)

> **Sub-1 · Estudio de la lógica existente reutilizable.**
> Entregable de solo estudio: NO se reimplementa nada. Este documento fija **qué
> funciones, firmas y triggers ya existentes deben CONSUMIR** los scripts de seed
> para generar datos demo de la peluquería (**De Nueve a Nueve**, slug
> `denueveanueve`) —clientes, citas, tickets/ventas, facturas y fidelización—
> **sin duplicar aritmética, encadenamiento ni reglas de negocio**.
>
> **Regla de oro del seed demo (petición del cliente):** *additivo e idempotente*.
> Nunca altera filas ya existentes; solo **crea** clientes/citas/ventas/facturas/
> movimientos de puntos. El salón, sedes, profesionales, servicios y horarios ya
> los siembra `supabase/seed/denueveanueve.sql` (idempotente por `slug`).

Índice:
1. [Mapa rápido: qué se reutiliza y qué NO](#1-mapa-rápido)
2. [Aritmética de venta e IVA — `@/lib/payments`](#2-aritmética-de-venta-e-iva)
3. [Facturación Veri\*factu — `@/lib/invoicing`](#3-facturación-verifactu)
4. [Reservas, modelo de 3 fases y `appointment_blocks` — `@/lib/booking`](#4-reservas-3-fases-y-appointment_blocks)
5. [Fidelización — `@/lib/loyalty` + triggers/RPC](#5-fidelización)
6. [Prerrequisitos del salón demo y disparadores automáticos](#6-prerrequisitos-y-disparadores-automáticos)
7. [Checklist de contratos para el generador de seed](#7-checklist-para-el-generador-de-seed)

---

## 1. Mapa rápido

| Dominio | Firma pública reutilizable | ¿Llamable desde un seed *headless* (Node/service-role, sin sesión)? | Nota |
|---|---|---|---|
| Totales/IVA | `computeSaleTotals`, `computeLineTotals`, `prorateDiscountAcrossLines` (`@/lib/payments`) | ✅ Sí (funciones **puras**) | Fuente única de aritmética |
| Factura | `emitInvoice(supabase, params)` (`@/lib/invoicing`) | ✅ Sí — **se le inyecta** el cliente Supabase (pásale el admin/service-role) | Server-only por convención, pero sin dependencia de sesión |
| Factura (motor puro) | `buildInvoiceRecord`, `computeInvoiceHash`, `verifyHashChain` | ✅ Sí (puras) | Solo si necesitas construir/verificar la huella a mano |
| Reserva **futura** | `createBookingForSalon(salonId, input)` (`@/lib/booking/server`) | ✅ Sí — usa `createAdminClient()` (service role), no necesita sesión | **Solo fechas futuras** (ver §4) |
| Reserva **histórica/pasada** | *(no hay función)* → `insert` directo en `appointments` | ✅ Sí | El motor de disponibilidad **descarta huecos pasados** |
| Disponibilidad (puro) | `generateSlots`, `mergeSlotsByProfessional` (`@/lib/booking/availability`) | ✅ Sí (puras) | |
| Teléfono → E.164 | `normalizePhone(input)` (`@/lib/customers/normalize-phone`) | ✅ Sí (pura) | Espejo exacto de `app.normalize_phone` |
| Fidelización (cálculo) | `computeVisitPoints`, `computeLinePoints`, `milestoneForVisitCount`, `formatRewardCode`, `randomRewardSuffix`, `computeCouponDiscountCents`, `addDaysIso` (`@/lib/loyalty/points`) | ✅ Sí (puras, deterministas) | |
| Fidelización (orquestación) | `awardVisit`, `grantWelcomeCoupon`, `ensureLoyaltyAccount`, `lookupByQr`, `resolveActiveCouponPercentOff` (`@/lib/loyalty/server`) | ❌ **No** — exigen **sesión** (`createClient()`/cookies) + pertenencia a `salon_members` + add-on `loyalty` activo | Ver §5: mirar sus escrituras y replicarlas con admin |
| Fidelización (RPC) | `public.staff_award_visit(...)` | ❌ **No** desde service-role puro — hace gate por `auth.uid()`∈`salon_members` | El service role no tiene `auth.uid()` |

**Conclusión operativa:** las capas **puras** (`payments`, `loyalty/points`,
`booking/availability`, `normalize-phone`) y los orquestadores que **reciben o
crean** un cliente admin (`emitInvoice`, `createBookingForSalon`) se reutilizan
tal cual. Los orquestadores de fidelización que dependen de **sesión de usuario**
(`@/lib/loyalty/server`) **no** son invocables desde un seed sin auth; para sembrar
historial de puntos se replican sus **escrituras exactas** con el cliente admin,
reutilizando la matemática pura (§5).

---

## 2. Aritmética de venta e IVA

**Módulo:** `@/lib/payments` (barril `src/lib/payments/index.ts`) · núcleo en
`src/lib/payments/totals.ts` y `src/lib/payments/money.ts`.
**Es la fuente ÚNICA de importes** para caja **y** facturación: el seed la usa para
que ticket, líneas persistidas y desglose de factura cuadren al céntimo.

**Modelo de precios: BRUTO (PVP, IVA incluido).** La base y la cuota se **extraen**
del bruto. Identidad garantizada por construcción: `subtotal + tax === total`.

```ts
// Entrada mínima de una línea (agnóstica de BD)
interface SaleLineInput {
  quantity: number;          // > 0, admite fracciones
  unitPriceCents: number;    // entero ≥ 0, PVP con IVA incluido
  vatRate?: number;          // % (21|10|4|0). Por defecto 21
  discountCents?: number;    // entero ≥ 0 (bruto). Por defecto 0
}

interface SaleTotals {
  subtotalCents: number;     // Σ base imponible → pos_sales.subtotal_cents
  discountCents: number;     // Σ descuentos de línea → pos_sales.discount_cents
  taxCents: number;          // Σ cuota IVA → pos_sales.tax_cents
  totalCents: number;        // Σ bruto → pos_sales.total_cents (≡ subtotal + tax)
  vatBreakdown: VatBreakdownEntry[]; // desglose por tipo, para la factura
}

function computeLineTotals(line: SaleLineInput): SaleLineTotals;      // grossCents = line_total_cents
function computeSaleTotals(lines: readonly SaleLineInput[]): SaleTotals;
function prorateDiscountAcrossLines(lines, discountCents): SaleLineInput[]; // reparte cupón por mayor resto
```

**Contrato para el seed de un ticket (`pos_sales` + `pos_sale_lines` + `pos_payments`):**
- Calcula `totals = computeSaleTotals(effectiveLines)` y vuelca a la cabecera:
  `subtotal_cents/discount_cents/tax_cents/total_cents` = los del `SaleTotals`.
- Por línea: `line_total_cents = computeLineTotals(effective).grossCents`;
  `unit_price_cents`, `vat_rate` y `description` son **snapshots** (el catálogo
  puede cambiar). `Σ line_total_cents === total_cents`.
- Pagos: una fila `pos_payments` por *tender* (pago mixto = varias filas). La suma
  de `amount_cents` debe **cubrir exactamente** `total_cents` (lo valida la
  pasarela `getPaymentGateway('manual')` en producción; el seed debe respetarlo).
- **Flujo de referencia (copiar tal cual):** `src/app/(dashboard)/tpv/actions.ts`
  → `createSale()` (líneas 135-373). Orquesta las 3 tablas + cupón + fidelización.

---

## 3. Facturación Veri\*factu

**Módulo:** `@/lib/invoicing` (barril `src/lib/invoicing/index.ts`).
**Tabla destino:** `public.pos_invoices` (registro de facturación de alta,
**inmutable y encadenado por huella SHA-256**).

### 3.1 Firma a consumir (orquestador) — `emitInvoice`

`src/lib/invoicing/emit.ts:116`

```ts
async function emitInvoice(
  supabase: SupabaseClient<Database>,   // ← INYECTADO: pásale el cliente admin en el seed
  params: EmitInvoiceParams,
): Promise<EmittedInvoice>;

interface EmitInvoiceParams {
  salonId: string;
  saleId: string | null;                // venta de origen o null (factura libre)
  invoiceType: PosInvoiceType;          // 'ticket' (F2) | 'completa' (F1)
  series: string;                       // cadena de huella por (salon_id, series)
  totals: SaleTotals;                   // de computeSaleTotals (§2)
  issuer: IssuerData;                   // { taxId, legalName, fiscalAddress|null }
  recipient: RecipientData | null;      // obligatorio si 'completa'; null en 'ticket'
  issuedAt?: Date;                      // fecha de expedición. Por defecto: ahora → BACKDATABLE
  currency?: string;                    // por defecto 'EUR'
}

interface EmittedInvoice {
  invoiceId; fullNumber; series; sequentialNumber; invoiceType;
  currentHash; previousHash; totalCents; taxCents; taxableBaseCents; issuedAt;
}
```

**Lo que resuelve por ti (no lo reimplementes):**
- **Numeración correlativa SIN huecos** por serie (lee el último `sequential_number`,
  asigna `+1`; el primero es `1`).
- **Encadenamiento de huella**: `previous_hash` = `current_hash` del anterior de la
  serie (`null` en el primero).
- **Concurrencia optimista**: ante colisión `23505` reintenta (`MAX_ATTEMPTS = 5`)
  releyendo el último número → serie sin huecos incluso con emisiones simultáneas.
- Lanza `InvoiceEmissionError` si faltan datos obligatorios o se agotan reintentos.

### 3.2 Motor puro (solo si necesitas construir/verificar a mano)

- `buildInvoiceRecord(input: BuildInvoiceRecordInput): BuiltInvoiceRecord` —
  `src/lib/invoicing/engine.ts:126`. Devuelve `{ insert, currentHash, fullNumber }`
  con `insert` listo para `pos_invoices`. Reglas verificadas: emisor con NIF+razón
  social; `completa` exige receptor con NIF+nombre; `sequentialNumber` entero > 0;
  `total > 0`.
- `computeInvoiceHash(record: HashableInvoiceRecord): string` — `src/lib/invoicing/hash.ts:84`.
  SHA-256 hex **MAYÚSCULAS** (64 chars). Determinista.
- `buildCanonicalString(record)` — orden fijo de campos AEAT (ver hash.ts:65). El
  orden **es parte del contrato**: si cambia, cambia la huella.
- `verifyHashChain(records): number` — `hash.ts:96`. Devuelve el índice del primer
  registro corrupto o `-1` si la cadena es válida. Registros **ordenados por
  número ascendente**. Útil como **aserción post-seed** (verificar que las facturas
  demo forman una cadena íntegra).

```ts
interface HashableInvoiceRecord {
  issuerTaxId: string; invoiceNumber: string;       // "serie-número"
  issuedAt: Date; invoiceCode: "F1" | "F2";
  taxCents: number; totalCents: number;
  previousHash: string | null; generatedAt: Date;
}
```

### 3.3 Invariantes de BD que el seed NO puede violar

`supabase/migrations/20260714100000_verifactu_invoices.sql`

- `unique (salon_id, series, sequential_number)` — numeración única por serie.
- `unique (salon_id, current_hash)` — huella única por salón.
- FK de cadena `pos_invoices_chain_fkey (salon_id, previous_hash) → (salon_id, current_hash)`.
- `check total_cents = taxable_base_cents + tax_cents`; `tax_breakdown` array jsonb;
  `current_hash ~ ^[0-9A-Fa-f]{64}$`; `completa` ⇒ `recipient_data` no nulo.
- **INMUTABILIDAD ABSOLUTA:** trigger `trg_pos_invoices_immutable` aborta **todo
  UPDATE/DELETE**, incluso para `service_role` y funciones `SECURITY DEFINER`.
  → **Implicación para el seed:** una factura demo **no se puede borrar ni rehacer**.
  El seed debe ser **idempotente por diseño** (comprobar si la serie ya tiene
  registros antes de emitir) porque no hay marcha atrás. `issued_at` es
  backdatable, pero `created_at` (alta en la cadena) será `now()`.

### 3.4 Guía de seed de facturas
1. El salón demo debe tener **datos fiscales** (`salons.tax_id`, `legal_name`;
   `fiscal_address` opcional). Sin ellos `emitInvoice` lanza (ver §6).
2. Usa **una serie demo dedicada** (p. ej. `DEMO-2026`) para no mezclarte con series
   reales y poder detectar idempotencia (`¿ya hay filas en esa serie?`).
3. Llama `emitInvoice(adminClient, { … })` por cada ticket, en orden cronológico,
   con `issuedAt` backdated. La cadena se construye sola.
4. Opcional: al final, `verifyHashChain(...)` sobre las facturas de la serie ⇒ debe
   dar `-1`.
5. Referencia de cómo se resuelven `issuer`/`recipient` desde BD:
   `src/app/(dashboard)/tpv/invoice-actions.ts` (`emitInvoiceAction`).

---

## 4. Reservas, 3 fases y `appointment_blocks`

**Módulo:** `@/lib/booking` (`server.ts`, `availability.ts`, `schema.ts`, `types.ts`).

### 4.1 Modelo de 3 fases (en `services`)

`supabase/migrations/20260713000000_services_phase_duration.sql`

| Columna | Regla | Significado |
|---|---|---|
| `application_min` | `≥ 1` (obligatorio) | Fase 1 — profesional **ocupado** |
| `exposure_min` | `≥ 0` | Fase 2 — procesado; profesional **LIBRE** |
| `post_exposure_min` | `≥ 0` | Fase 3 — profesional **ocupado** |
| `duration_minutes` / `duration_minutes_total` | GENERADAS = suma de las 3; total ∈ `[5, 600]` | No editables |

- **Ventana de bloqueo efectivo** = `application_min + post_exposure_min`
  (lo que ocupa físicamente al profesional).
- **Duración total de la cita** (`ends_at`, encaje en horario) = las 3 fases.
- Durante `exposure` el profesional puede atender a otro cliente → ese tramo **no
  bloquea**. Por eso existe `appointment_blocks` (no basta la exclusión sobre el
  rango total).

### 4.2 `appointment_blocks` — gestionado por trigger, NO por el seed

`supabase/migrations/20260713160000_appointment_blocks.sql`

- **No insertes en `appointment_blocks` a mano.** El trigger
  `trg_appointment_blocks_sync` (`AFTER INSERT/UPDATE/DELETE ON appointments`,
  `SECURITY DEFINER`) los **regenera** desde la fila de `appointments` + las fases
  del servicio:
  - `application`: `[starts_at, starts_at + application_min)` — siempre.
  - `post_exposure`: `[starts_at + app + exp, ends_at)` — solo si `post_min > 0`.
  - `exposure`: **no** genera bloque.
  - Solo para citas `status IN ('pending','confirmed')`. Otras (`completed`,
    `cancelled`, `no_show`) → sin bloques.
- **Exclusión anti-solape:** `appointment_blocks_no_overlap` EXCLUDE GIST por
  `(professional_id, salon_id, occupied_range)`. Sembrar dos citas activas
  solapadas del **mismo profesional** → error `23P01`. (La antigua
  `appointments_no_overlap` fue **eliminada**; el anti-solape vive aquí.)

### 4.3 Firma a consumir (reserva **futura**) — `createBookingForSalon`

`src/lib/booking/server.ts:639`

```ts
async function createBookingForSalon(
  salonId: string,
  input: CreateBookingInput,     // Zod: src/lib/booking/schema.ts
): Promise<BookingConfirmation>;

// createBookingSchema (schema.ts:33)
interface CreateBookingInput {
  serviceId: string;                       // uuid
  professionalId: string | "any";          // uuid concreto o "any" (asigna uno libre)
  startsAt: string;                        // ISO 8601 con offset
  customer: {
    fullName: string; phone: string;       // phone obligatorio (identidad E.164)
    email?: string; notes?: string; marketingConsent?: boolean;
  };
}
```

**Reutilizable desde un seed** porque internamente usa `createAdminClient()`
(service role) y **no necesita sesión**. Hace por ti:
- Recalcula disponibilidad en servidor (`generateSlots`) — no se fía del hueco.
- **Dedup de cliente por TELÉFONO** (E.164 vía `normalizePhone`, luego por email);
  reutiliza la ficha si ya existe, no la duplica.
- Inserta la cita en estado `pending`; el trigger crea los bloques.

> ⚠️ **LÍMITE CRÍTICO PARA DATOS DEMO HISTÓRICOS:** `generateSlots` **descarta
> huecos pasados** (`if (startsAt < now + minLeadMinutes) continue`,
> `availability.ts:158`). Por tanto `createBookingForSalon` **solo puede crear
> citas FUTURAS**. Para sembrar el **historial** (citas pasadas, base de tickets
> y facturas demo) hay que **insertar directamente en `appointments`** (§4.4).

### 4.4 Seed de citas **históricas** (insert directo en `appointments`)

Tabla `public.appointments` (`20260711100000_initial_schema.sql:147`). Columnas
obligatorias: `salon_id, customer_id, professional_id, service_id, status,
starts_at, ends_at` (+ `price_cents`, `currency` snapshot). `check (ends_at > starts_at)`.

- Calcula `ends_at = starts_at + (application+exposure+post) minutos` (deriva las
  fases del servicio, igual que `server.ts`).
- **Enum `appointment_status`:** `pending | confirmed | completed | cancelled | no_show`.
- **Para que se genere la `visits` automática**: el trigger
  `trg_appointments_create_visit` (`20260711100200_history_triggers.sql:171`) solo
  dispara en **`AFTER UPDATE OF status` → `completed`** (transición). Un `INSERT`
  directo con `status='completed'` **NO** crea la visita. Patrón de seed:
  **insertar como `pending`/`confirmed` y luego `UPDATE status='completed'`** si
  quieres la fila en `public.visits`.
- Ojo con el anti-solape (§4.2): escalona las citas activas del mismo profesional.
  Las citas `completed`/`cancelled` no generan bloques y no chocan.

> **`visits` ≠ fidelización.** Completar una cita crea una fila en `public.visits`
> (histórico de negocio) pero **no acredita puntos** (`loyalty_accounts`). Los
> puntos son otro circuito (§5): se acreditan en el TPV / `awardVisit`.

---

## 5. Fidelización

**Módulos:** `@/lib/loyalty/points` (**puro**), `@/lib/loyalty/server` (**server-only,
con sesión**), `@/lib/loyalty/types`. **Migración base:**
`supabase/migrations/20260716120000_loyalty_base.sql`. **RPC de staff:**
`20260717150000_rpc_staff_award_visit.sql`.

### 5.1 Lo que el seed obtiene GRATIS por trigger

`customers` lleva `qr_token text not null unique default gen_random_uuid()::text`
→ el seed **no** lo fija (lo pone el DEFAULT).

Trigger `trg_customers_bootstrap_loyalty` (`AFTER INSERT ON customers`,
`SECURITY DEFINER`, loyalty_base.sql:303) crea automáticamente, de forma idempotente
(`ON CONFLICT DO NOTHING`):
- `loyalty_accounts` (saldo 0, `visits_total` 0), y
- `welcome_coupons` (10 %, `status='ACTIVE'`, `expires_at = now() + 90 días`).

→ **Al insertar un cliente demo, ya tiene cuenta de puntos y cupón de bienvenida.**
El trigger **no** comprueba el add-on `loyalty` (eso solo lo exige la capa server).

### 5.2 Funciones PURAS reutilizables (`@/lib/loyalty/points`)

```ts
const DEFAULT_LOYALTY_CONFIG = {   // types.ts:56 — réplica de denueveanueve
  centsPerPoint: 200,              // ⚠️ 1 punto ≈ 2 € → ceil(price_cents / 200). NO "/2"
  rewardValidityDays: 90, couponValidityDays: 90, defaultWelcomePercentOff: 10,
};
const LOYALTY_MILESTONES = [       // hito EXACTO por nº de visitas
  { visits: 3,  rewardType: "SCALP_DIAGNOSIS",  label: "Diagnóstico capilar" },
  { visits: 5,  rewardType: "EXPRESS_TREATMENT", label: "Tratamiento exprés" },
  { visits: 8,  rewardType: "RETAIL_VOUCHER",    label: "Vale de producto" },
  { visits: 10, rewardType: "PACK_UPGRADE",      label: "Mejora de pack" },
];

computeLinePoints(line, centsPerPoint?): number;             // override manual o ceil(price/cpp)
computeVisitPoints(lines, centsPerPoint?): { pointsTotal, priceCentsTotal };
milestoneForVisitCount(visitsTotal): LoyaltyMilestone | null; // solo coincidencia exacta; >10 = null
formatRewardCode(rewardType, suffix): string;                 // "RW-<3 MAYÚS>-<suffix>"
randomRewardSuffix(randomBytes, length=6): string;            // alfanum. MAYÚS
computeCouponDiscountCents(totalCents, percentOff): number;   // redondeo comercial, saturado al total
addDaysIso(now, days): string;                                // ISO UTC (base de expires_at)
```

### 5.3 Orquestadores server-only — **por qué NO se llaman desde el seed**

`@/lib/loyalty/server.ts` (`awardVisit`, `grantWelcomeCoupon`, `ensureLoyaltyAccount`,
`lookupByQr`, `resolveActiveCouponPercentOff`) exigen, **antes de escribir**:
1. **Sesión de usuario** (`createClient()` lee cookies) → un seed headless no la tiene.
2. **Pertenencia** a `salon_members` (`requireMembershipForSalon`).
3. **Add-on `loyalty` activo** en `salon_features` (`requireLoyaltyFeature`).

La RPC `public.staff_award_visit(...)` hace el mismo gate por `auth.uid()` ∈
`salon_members`; el **service role no tiene `auth.uid()`** ⇒ tampoco sirve para un
seed puro. (Ambos serían usables solo desde una **sesión de staff autenticada**.)

### 5.4 Seed de historial de puntos — replicar las escrituras de `awardVisit`

Para sembrar visitas de fidelización sin sesión, replica **exactamente** lo que
hace `awardVisit` (`server.ts:512`) / `staff_award_visit`, con el cliente **admin** y
reutilizando la **matemática pura** (§5.2). Por cada visita a acreditar:

1. Cuenta asegurada por el trigger (§5.1); si acaso, `upsert loyalty_accounts
   (salon_id, customer_id) on conflict do nothing`.
2. `({ pointsTotal, priceCentsTotal } = computeVisitPoints(lineItems, 200))`.
3. `UPDATE loyalty_accounts SET points_balance = points_balance + pointsTotal,
   visits_total = visits_total + 1, last_visit_at = now(), last_activity_at = now()`.
4. `INSERT points_movements (salon_id, customer_id, type='EARN', points=pointsTotal,
   reason, ref_type, ref_id)`. **Idempotencia:** ancla por `(ref_type, ref_id)` —
   antes de sumar, comprueba que no exista ya un `EARN` con esa referencia (patrón
   `findExistingEarn`, server.ts:630). Para tickets: `ref_type='pos_sale'`,
   `ref_id = saleId`.
5. **Hito**: `m = milestoneForVisitCount(newVisits)`; si `≠ null`, `INSERT rewards
   (type=m.rewardType, code=formatRewardCode(m.rewardType, randomRewardSuffix(...)),
   status='AVAILABLE', expires_at=addDaysIso(now, 90))`. Reintenta ante `23505`
   (código único `(salon_id, code)`).
6. **Cupón** (si procede): `UPDATE welcome_coupons SET status='USED', used_at=now()
   WHERE … AND status='ACTIVE'`; descuento = `computeCouponDiscountCents(total, %off)`.

**Enums (MAYÚSCULAS — contrato heredado de denueveanueve):**
- `points_movement_type`: `EARN | REDEEM | ADJUST | EXPIRE`.
- `coupon_status`: `ACTIVE | USED | EXPIRED`.
- `reward_status`: `AVAILABLE | REDEEMED | EXPIRED`.

**Tablas** (todas con FK compuesta `(customer_id, salon_id) → customers(id, salon_id)`
y RLS multi-tenant; el service role la bypasa pero **acota a mano por `salon_id`**):
`loyalty_accounts` (1:1 por `(salon_id, customer_id)`), `points_movements`
(append-only, sin UPDATE), `welcome_coupons` (1 por `(salon_id, customer_id)`),
`rewards` (`unique (salon_id, code)`).

> Alternativa "de verdad" (no headless): ejecutar el flujo real de TPV
> (`createSale` en `src/app/(dashboard)/tpv/actions.ts`) desde una **sesión de staff**,
> que ya llama a `awardVisit` en modo best-effort con `ref = { pos_sale, saleId }`.

---

## 6. Prerrequisitos y disparadores automáticos

**Ya sembrado (no tocar)** por `supabase/seed/denueveanueve.sql`: salón
`denueveanueve` (`Europe/Madrid`), 2 sedes, 13 profesionales, 25 servicios con las
3 fases, horarios Lun–Sáb 09:00–21:00. Precios a 0 → el seed demo puede **fijar
precios en las líneas del ticket** (snapshot) sin alterar el catálogo.

**Disparadores automáticos que el seed aprovecha (no reimplementar):**

| Trigger / DEFAULT | Cuándo | Efecto |
|---|---|---|
| `trg_salons_register_payment_methods` | `AFTER INSERT ON salons` | Crea métodos `efectivo`/`tarjeta`/`bizum` (`pos_base.sql:364`) |
| `customers.qr_token DEFAULT` | insert de cliente | Token QR único de fidelización |
| `trg_customers_bootstrap_loyalty` | `AFTER INSERT ON customers` | Cuenta de puntos + cupón bienvenida (§5.1) |
| `trg_appointment_blocks_sync` | INSERT/UPDATE/DELETE de cita | Regenera `appointment_blocks` por fase (§4.2) |
| `trg_appointments_create_visit` | `UPDATE status → completed` | Inserta en `public.visits` (§4.4) |
| `trg_pos_invoices_immutable` | UPDATE/DELETE de factura | **Aborta** (inmutabilidad legal, §3.3) |

**Prerrequisitos por dominio del seed demo:**
- **Facturas:** `salons.tax_id` y `legal_name` no nulos (emisor). Se rellenan en
  Ajustes › Fiscal; el seed debe garantizarlos antes de `emitInvoice`.
- **Fidelización (si se usa la UI/servidor):** add-on `loyalty` activo en
  `salon_features`. El seed por escritura directa (§5.4) **no** lo requiere, pero la
  UI que lo mostrará sí; conviene activarlo para la demo.
- **Facturación en UI:** módulo gated por `pos` (ver
  `docs/recon-tpv-facturacion-metricas.md`). Para que se vea, activar `pos`.
- **Clientes:** `phone` obligatorio para el dedup; normalízalo mentalmente con
  `normalizePhone` (la columna generada `phone_e164` y su único parcial
  `(salon_id, phone_e164)` rechazan duplicados). `tax_id`/`address` en `customers`
  solo si vas a emitir facturas **completas** a ese cliente.

---

## 7. Checklist para el generador de seed

- [ ] **Additivo:** nunca `UPDATE`/`DELETE` de salón, sedes, profesionales,
      servicios ni horarios existentes. Solo `INSERT` de datos nuevos.
- [ ] **Idempotente:** guardas de existencia antes de insertar (por `slug`, por
      teléfono E.164, por serie de factura ya poblada). Las facturas **no** admiten
      rehacer (inmutables): comprueba la serie antes de emitir.
- [ ] **Clientes:** `insert customers` (con `phone` normalizable) → cuenta+cupón por
      trigger. No fijar `qr_token`.
- [ ] **Citas futuras:** `createBookingForSalon(salonId, input)`.
- [ ] **Citas históricas:** `insert appointments` (deriva `ends_at` de las 3 fases);
      para generar `visits`, insertar activo y luego `UPDATE status='completed'`.
      No tocar `appointment_blocks` (trigger). Escalonar por profesional (anti-solape
      `23P01`).
- [ ] **Tickets/ventas:** `computeSaleTotals` → cabecera + líneas (`line_total_cents`)
      + pagos que cubran el total. Espejo: `createSale`.
- [ ] **Facturas:** garantizar datos fiscales del salón → `emitInvoice(adminClient,
      {…, issuedAt: <backdated>})` por ticket, en orden cronológico, serie demo
      dedicada. Verificar con `verifyHashChain(...) === -1`.
- [ ] **Fidelización histórica:** replicar escrituras de `awardVisit` con admin y
      matemática pura (§5.4); idempotencia por `(ref_type='pos_sale', ref_id=saleId)`.
- [ ] **Prerrequisitos de visibilidad:** activar add-ons `pos` y `loyalty` en
      `salon_features` para la demo.

### Ficheros clave (referencia rápida)

| Contrato | Fichero |
|---|---|
| Totales/IVA | `src/lib/payments/{totals,money,index}.ts` |
| Huella/cadena | `src/lib/invoicing/hash.ts` |
| Motor de factura | `src/lib/invoicing/engine.ts` |
| Emisión (orquestador) | `src/lib/invoicing/emit.ts` |
| Flujo TPV completo | `src/app/(dashboard)/tpv/{actions,cart,invoice-actions}.ts` |
| Disponibilidad (puro) | `src/lib/booking/availability.ts` |
| Reserva (servidor) | `src/lib/booking/server.ts` |
| Teléfono E.164 | `src/lib/customers/normalize-phone.ts` |
| Fidelización (puro) | `src/lib/loyalty/points.ts`, `.../types.ts` |
| Fidelización (servidor) | `src/lib/loyalty/server.ts` |
| Esquema base | `supabase/migrations/20260711100000_initial_schema.sql` |
| Fases de servicio | `supabase/migrations/20260713000000_services_phase_duration.sql` |
| `appointment_blocks` | `supabase/migrations/20260713160000_appointment_blocks.sql` |
| TPV (pos_*) | `supabase/migrations/20260713180000_pos_base.sql` |
| Facturas Veri\*factu | `supabase/migrations/20260714100000_verifactu_invoices.sql` |
| Fidelización (tablas+trigger) | `supabase/migrations/20260716120000_loyalty_base.sql` |
| Seed base del salón | `supabase/seed/denueveanueve.sql` |
