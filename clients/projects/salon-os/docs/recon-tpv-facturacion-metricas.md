# Reconocimiento — TPV, facturación y métricas del panel

> **Artefacto de sub-1 (HAT3X).** Mapa de columnas reales y helpers reutilizables
> para las tareas siguientes (métricas del panel, listado de tickets, sección de
> facturas, gráficas/históricos). Documentación de solo lectura: **no toca código.**
>
> Fuentes leídas: `src/lib/payments/*`, `src/lib/invoicing/*`, `src/lib/tpv/*`,
> `src/lib/format.ts`, `src/lib/salon.ts`, `src/lib/salon-features.ts`, migraciones
> `pos_base`, `verifactu_invoices`, `fiscal_base`, `salon_features` (+ `rpc_feature_gate`),
> páginas de `/ajustes`, `/dashboard`, `/arqueo`, `/tpv` y `api/facturacion/*`.

---

## 0. TL;DR para quien construya lo siguiente

- **El dinero es SIEMPRE entero de céntimos** (`*_cents integer >= 0`) + `currency char(3)`.
  Nunca `float`/`numeric` para importes. Toda la aritmética vive en `@/lib/payments`
  (`money.ts` + `totals.ts`) — **no recalcular importes en la UI ni en queries.**
- **Formateo en UI:** usar `formatMoney(cents, currency)` de `@/lib/format` (no crear
  otro `Intl.NumberFormat`).
- **Patrón de página de dominio:** Server Component que resuelve salón/permiso con los
  helpers de `@/lib/salon`, hace la query scopeada por `salon_id`, y delega el render a
  un componente `-view`. Cabecera con `SectionHeader`, vacío con `SectionPlaceholder`.
- **Ya existe:** TPV completo (`/tpv`), arqueo de caja (`/arqueo`), API de factura
  imprimible y export del libro (`/api/facturacion/*`), motor Veri*factu (`@/lib/invoicing`).
- **NO existe todavía** (probable trabajo nuevo): página **UI** de listado de facturas,
  listado/histórico de tickets fuera del TPV, y cualquier **gráfica/histórico**. Las
  **métricas del `/dashboard` son placeholders** (`—`), sin queries.

---

## 1. Capa de dinero — `@/lib/payments`

Fuente única de aritmética, reutilizada por caja (TPV) y facturación. Importar SIEMPRE
desde el índice `@/lib/payments`, no de los submódulos.

### 1.1 `money.ts` — primitivas de céntimos
Redondeo comercial español "half away from zero", robusto ante error de coma flotante.

| Función | Firma | Qué hace |
|---|---|---|
| `roundHalfAwayFromZero` | `(value:number) => number` | Redondeo comercial (2,5→3). Lanza si no finito. |
| `multiplyCents` | `(unitCents:number, quantity:number) => number` | `unitCents × quantity` (quantity puede ser fraccionaria) → céntimos enteros. |
| `splitVatFromGross` | `(grossCents:number, vatRate:number) => {baseCents, taxCents}` | **Extrae** base+IVA de un BRUTO (PVP IVA incl.). `base + tax === gross` exacto. |
| `assertIntegerCents` | `(value:number, label?) => void` | Guardarraíl: lanza si no es entero. |
| `distributeProportionally` | `(amount:number, weights:number[]) => number[]` | Reparto mayor-resto (Hamilton). `Σ === amount` exacto. Base del prorrateo de descuentos. |

> **Modelo de precios del proyecto: BRUTO / PVP (IVA incluido).** La base y la cuota
> se EXTRAEN del bruto, no se suman. `money.ts:41-64`.

### 1.2 `totals.ts` — totales por línea y por venta
Mapea directamente a las columnas snapshot de `pos_sales` / `pos_sale_lines`.

| Función | Firma | Salida |
|---|---|---|
| `computeLineTotals` | `(line: SaleLineInput) => SaleLineTotals` | Bruto, descuento saturado, base, cuota, vatRate de una línea. |
| `computeSaleTotals` | `(lines: readonly SaleLineInput[]) => SaleTotals` | Agregados de venta + **desglose de IVA por tipo** (ordenado desc). |
| `prorateDiscountAcrossLines` | `(lines, discountCents) => SaleLineInput[]` | Reparte un descuento de ticket (cupón) por línea sin descuadrar base+IVA. |

**Tipos clave** (`totals.ts:34-86`):
- `SaleLineInput = { quantity, unitPriceCents, vatRate?, discountCents? }`
- `SaleTotals = { subtotalCents, discountCents, taxCents, totalCents, vatBreakdown }`
  — mapa: `subtotalCents→subtotal_cents`, `taxCents→tax_cents`, `totalCents→total_cents`,
  `discountCents→discount_cents` (informativo).
- `VatBreakdownEntry = { vatRate, baseCents, taxCents, grossCents }`

Identidad garantizada por construcción: **`subtotal + tax === total`** y
**`Σ bruto de línea === total`** (céntimos exactos).

### 1.3 Pasarela de pago (`gateway.ts` / `manual-gateway.ts`)
Abstracción `PaymentGateway`; hoy solo `manual` implementada. Selector
`getPaymentGateway(id)` — único punto a tocar para enchufar SumUp/Stripe/Redsys (TODO).
Helpers de validación exportados: `assertTendersCoverSale`, `assertTendersCoverTotal`,
`isMixedPayment`, `sumTenders`, `PaymentValidationError`.

---

## 2. Esquema real — módulo TPV (`pos_*`) y fiscal

Regla del esquema: identificadores en inglés, comentarios en español; `salon_id not null`
+ índice en toda tabla; FKs de dominio **compuestas** `(fk_id, salon_id) → tabla(id, salon_id)`;
snapshots de nombre/precio en líneas; `updated_at` + trigger `app.set_updated_at()`.

### 2.1 Enums (migración `pos_base`)
- `public.pos_sale_status`: `open | completed | voided | refunded`
- `public.pos_payment_method`: `efectivo | tarjeta | bizum | transferencia | otro`
- `public.pos_session_status`: `open | closed`
- `public.pos_invoice_type` (migración `verifactu_invoices`): `ticket | completa`
- `public.salon_feature` (migración `salon_features`): `loyalty | client_app | staff_app | ai_receptionist | pos`

### 2.2 `pos_sales` — cabecera de ticket/venta
Columnas: `id, salon_id, session_id?, appointment_id?, customer_id?, professional_id?,
status(pos_sale_status='open'), subtotal_cents, discount_cents, tax_cents, total_cents,
currency(char3='EUR'), sold_by?(auth.users), sold_at(now), notes?, created_at, updated_at`.
- Totales son **snapshot** mantenido por la app al cerrar (`total = subtotal − discount + tax`,
  ojo: con precios brutos el descuento ya está en el bruto, ver `totals.ts:22-26`).
- Índices útiles para listados/históricos: `(salon_id, sold_at desc)`, y parcial
  `(salon_id, sold_at desc) where status='open'`. FKs anulan solo su columna (registro
  financiero sobrevive a borrados).

### 2.3 `pos_sale_lines` — líneas del ticket
`id, salon_id, sale_id, service_id?, product_id?, item_kind (generado: service|product|manual),
description(snapshot), quantity numeric(12,3), unit_price_cents, discount_cents,
vat_rate numeric(5,2)=21.00, line_total_cents (bruto IVA incl., tras descuento), created_at, updated_at`.
- `item_kind` es **columna generada** read-only. Una línea es servicio O producto O ninguno.

### 2.4 `pos_payments` — pagos que liquidan la venta (pago mixto = varias filas)
`id, salon_id, sale_id, session_id?, method(pos_payment_method), payment_method_id?,
amount_cents(>0), paid_at, reference?, created_at`. Registro casi inmutable (insert/delete,
sin update). Índice de arqueo: `(session_id, method)`.

### 2.5 `pos_sessions` — sesión de caja (apertura/cierre/arqueo)
`id, salon_id, location_id?, status(pos_session_status='open'), currency,
opened_by?, opened_at, opening_float_cents, closed_by?, closed_at?, expected_cash_cents?,
counted_cash_cents?, cash_variance_cents?, closing_totals(jsonb), notes?, created_at, updated_at`.
- `closing_totals` = snapshot `{"efectivo":12300,"tarjeta":45600}`.
- Único parcial: como mucho una sesión `open` por `(salon_id, location_id)`.

### 2.6 `pos_payment_methods` — catálogo por salón
`id, salon_id, kind(pos_payment_method), name, affects_cash_drawer, active, sort_order,
created_at, updated_at`. Se **autoprovisiona** (efectivo/tarjeta/bizum) por trigger al crear salón.

### 2.7 `pos_invoices` — registro Veri*factu **inmutable y encadenado** (modo NO VERI*FACTU)
`id, salon_id, sale_id?, invoice_type(pos_invoice_type='ticket'), series, sequential_number(bigint>0),
full_number (generado: series-number), issued_at, currency, tax_breakdown(jsonb array),
taxable_base_cents, tax_cents, total_cents, issuer_data(jsonb), recipient_data(jsonb, NULL en ticket),
hash_algorithm='SHA-256', current_hash(64 hex), previous_hash?(64 hex), created_at`.
- **Inmutable a nivel de motor**: trigger `trg_pos_invoices_immutable` aborta UPDATE/DELETE
  (bloquea incluso a `service_role`). **No hay policies UPDATE/DELETE.** No hay `updated_at`.
- Constraints: `total = base + tax`; `tax_breakdown` debe ser array; hashes hex 64;
  `completa` exige `recipient_data`. Unicidad `(salon_id, series, sequential_number)` y
  `(salon_id, current_hash)`. FK de cadena `(salon_id, previous_hash) → (salon_id, current_hash)`.
- `tax_breakdown` fila: `{vat_rate, base_cents, cuota_cents, total_cents}`.
- Índice de libro de facturas: `(salon_id, issued_at desc)`.

### 2.8 Fiscal (migración `fiscal_base`)
- `salons` += `tax_id varchar(20)?`, `legal_name varchar(200)?`, `fiscal_address text?` (emisor).
- `customers` += `tax_id varchar(20)?`, `address text?` (receptor, factura nominativa).
- **`products`** (retail): `id, salon_id, name(unique por salón), description?, price_cents,
  currency, vat_rate numeric(5,2)=21.00, stock?, active, created_at, updated_at`. Clave de apoyo
  `products_id_salon_key unique(id, salon_id)`.

### 2.9 RLS (patrón común)
- Lectura: `salon_id in (select app.user_salon_ids())` para cualquier miembro.
- Escritura operativa TPV (venta/línea/pago/sesión): cualquier miembro.
- Config/borrados sensibles (métodos de pago, delete de venta/sesión/pago): `owner|manager`
  vía `app.has_salon_role(salon_id, array['owner','manager'])`.
- `pos_invoices`: insert = miembro; **sin** update/delete.

---

## 3. Entitlements / feature-gating — `salon_features`

Productización opt-in: un add-on está activo **solo** si existe fila y `enabled=true`.
La **escritura la hace HAT3X** (service_role); RLS no concede escritura a `authenticated`.

### 3.1 Tabla `public.salon_features`
`id, salon_id, feature(salon_feature), enabled(bool=true), notes?, created_at, updated_at`.
Unicidad `(salon_id, feature)`. RLS: solo `SELECT` para miembros (deny-by-default en escritura).

### 3.2 Gate SQL — `app.salon_has_feature(p_salon_id uuid, p_feature text) → boolean`
`SECURITY DEFINER + STABLE + search_path=''`. Reutilizable dentro de policies. Vive en el
esquema `app` (**no** invocable por `supabase.rpc()`). Ya cablea las RPC de fidelización
(`register_my_customer_account` → `client_app`+`loyalty`; `staff_award_visit` →
`staff_app`+`loyalty`); error de negocio `FEATURE_NOT_ENABLED` (SQLSTATE `P0001`).

### 3.3 Helpers TS de servidor — `@/lib/salon-features`
| Helper | Firma | Uso |
|---|---|---|
| `salonHasFeature` | `(client, salonId, feature) => Promise<boolean>` | Gate de UN add-on (lee `salon_features`, filtra `enabled=true`). |
| `listSalonFeatures` | `(client, salonId) => Promise<Map<SalonFeature, boolean>>` | Todos los add-ons en 1 query. Distingue 3 estados (ausente/true/false). |
| `LOYALTY_FEATURE_DISABLED_MESSAGE` | const | Copy único del gate de fidelización. |

Envoltorio de conveniencia en `@/lib/salon`: `activeSalonHasFeature(feature)` (resuelve
salón activo de sesión). **El gating de UI es solo presentación**, nunca sustituye al gate de datos.

---

## 4. Patrón de página de `/ajustes` (y del panel en general)

### 4.1 Guard y navegación
- `ajustes/layout.tsx`: comprueba sesión (`supabase.auth.getUser()`) y rol
  (`getActiveMembership()` + `canManageSettings()`), redirige si no procede. Renderiza
  `AjustesNav` (barra lateral) + contenido.
- `ajustes/page.tsx`: `redirect("/ajustes/sedes")` (índice sin contenido propio).
- `AjustesNav` (`ajustes-nav.tsx`): array `NAV_ITEMS` de `{href,label,icon}`, marca activa
  con `aria-current`. **Añadir una sección = añadir una entrada aquí.** Secciones actuales:
  Sedes, Servicios, Personal, Horarios, Datos del salón, Datos fiscales, Marca, Complementos.

### 4.2 Estructura de una sección (dos variantes)
- **Solo lectura** (ej. `complementos/page.tsx`): Server Component resuelve `getActiveSalonId()`,
  llama a un helper de datos (`listSalonFeatures`), y delega en un `-view` presentacional.
- **Con formulario** (ej. `fiscal/page.tsx`): Server Component carga la fila (`salons`) y
  la pasa a un componente cliente `SalonFiscalForm` (server actions + Zod aparte).

### 4.3 Componentes de layout reutilizables
| Componente | Ruta | Props |
|---|---|---|
| `SectionHeader` | `ajustes/section-header.tsx` | `{icon, title, description, action?, className?}` — chip de marca + título + acción. |
| `SectionPlaceholder` | `ajustes/section-placeholder.tsx` | `{title, description}` — estado vacío / “en construcción”. |

### 4.4 Helpers de sesión/salón — `@/lib/salon`
| Helper | Devuelve |
|---|---|
| `getActiveSalonId()` | `string \| null` — primera pertenencia (más antigua). |
| `getActiveSalon()` | `{id, name, slug, timezone} \| null`. |
| `getActiveMembership()` | `{salonId, role} \| null`. |
| `canManageSettings(role)` | `boolean` (owner/manager). `SETTINGS_ROLES` = `['owner','manager']`. |
| `activeSalonHasFeature(feature)` | `boolean` — gating de UI del salón activo. |

> Todas resuelven la **primera** pertenencia; el modelo multi-tenant admite varias pero hoy
> se toma la más antigua. Las queries se scopean además con `.eq("salon_id", …)` explícito.

---

## 5. Métricas del panel — `/dashboard/page.tsx`

Estado actual: **placeholders, sin datos reales.** El `MetricCard` pinta `—` y una `hint`.
Array `METRICS` (`dashboard/page.tsx:36-45`):
- "Citas de hoy" (Reservas confirmadas) → futura query sobre `appointments`.
- "Ingresos de hoy" (Cobros del día) → futura query sobre `pos_payments`/`pos_sales`.
- "Clientes nuevos" (Altas esta semana) → `customers`.
- "Ocupación" (Agenda completada) → derivada de agenda/disponibilidad.

`SHORTCUTS` enlaza a `/day-panel`, `/appointments`, `/customers`, `/ajustes/servicios`.
El componente está explícitamente diseñado para **recibir un valor real sin cambiar el layout**
(comentario `dashboard/page.tsx:31-35, 167-171`). El header ya muestra `user.email` y logout.

> Para cablear métricas de ingresos/tickets: agregar sobre `pos_sales`/`pos_payments`
> scopeado por `salon_id` + rango de fechas; formatear con `formatMoney`.

---

## 6. Facturación — API existente y motor

### 6.1 Rutas API (`src/app/api/facturacion/`)
- `documento/[id]/route.ts` — `GET`: documento HTML/PDF autónomo de un `pos_invoices`.
  Resuelve salón con `getActiveSalon()`, lee la factura `.eq("id", params.id).eq("salon_id", salon.id)`,
  adjunta líneas de `pos_sale_lines` si hay `sale_id`, y llama `buildInvoiceDocumentHtml`.
  `force-dynamic`, `Cache-Control: no-store`. Env `VERIFACTU_ENVIRONMENT` (test|production).
- `export/route.ts` — `GET`: **libro registro** (CSV por defecto / JSON) del salón.
  Auth + `canManageSettings` (solo owner/manager). Filtros Zod `invoiceExportQuerySchema`:
  `series?, from?, to?, format?`. Usa `buildInvoicesCsv` / `buildInvoicesJson` / `exportFilename` / `exportContentType`.

> **No hay página UI de facturación** (`/app/(dashboard)/facturacion` no existe). La sección
> de facturas de la que habla el brief probablemente es nueva: listaría `pos_invoices` y
> enlazaría a `/api/facturacion/documento/[id]` + botón de export.

### 6.2 Motor `@/lib/invoicing` (índice `index.ts`)
Exports públicos (todos importan desde el índice):
- **Hash/cadena**: `buildCanonicalString`, `computeInvoiceHash`, `verifyHashChain`.
- **Motor puro** (`engine.ts`): `buildInvoiceRecord(input) → {insert, currentHash, fullNumber}`,
  `toTaxBreakdownRows(totals)`, `InvoiceEmissionError`. Tipos `BuildInvoiceRecordInput`,
  `IssuerData {taxId, legalName, fiscalAddress}`, `RecipientData {taxId, name, address}`, `TaxBreakdownRow`.
- **Orquestador server-only** (`emit.ts`): `emitInvoice(supabase, params) → EmittedInvoice`.
  Resuelve numeración **sin huecos** por serie con concurrencia optimista (relee la cola de
  serie, reintenta ante `23505`, hasta `MAX_ATTEMPTS=5`) y encadena `previous_hash`.
- **Export** (`export.ts`): `buildInvoicesCsv`, `buildInvoicesJson`, `toExportRecord`,
  `mapInvoiceTypeToAeat`, `centsToAmount`, `parseTaxBreakdown`, `exportFilename`, `exportContentType`,
  tipos `ExportableInvoice`, `ExportFilters`, `InvoiceExportRecord`.
- **QR / URL AEAT**: `buildVerifactuUrl`, `VERIFACTU_LEGEND`, `VERIFACTU_MODE`, `encodeQrSvg`, `QrCode`.
- **Documento**: `buildInvoiceDocumentHtml(data, options)` + tipos `InvoiceDocumentData`,
  `DocumentIssuer/Recipient/TaxRow/LineItem`.

El motor consume `SaleTotals` de `@/lib/payments` (fuente única de IVA). Datos fiscales del
emisor salen de `salons.{tax_id, legal_name, fiscal_address}`; si faltan, `buildInvoiceRecord`
lanza con mensaje que remite a **Ajustes › Fiscal**.

---

## 7. TPV — lib, acciones y ticket imprimible

### 7.1 `@/lib/tpv/ticket-document.ts` — ticket térmico (función PURA)
`buildTicketDocumentHtml(data: TicketDocumentData, options?) → string` (HTML autónomo, 58/80 mm).
Tipos de entrada: `TicketDocumentData` (salonName, ticketRef, issuedAt, currency, lines[],
grossTotalCents, coupon?, taxableBaseCents, vatBreakdown[], totalCents, tenders[], loyalty?, notes?),
`TicketDocumentLine`, `TicketDocumentVatRow`, `TicketDocumentTender`, `TicketDocumentCoupon`,
`TicketDocumentLoyalty`, `TicketDocumentReward`. Opciones: `rollWidthMm(58|80)`, `timezone`,
`showPrintButton`, `footerNote`. Escapa HTML; lleva la leyenda “Este documento no es una factura”.
(Ver también `src/lib/tpv/README.md`.)

### 7.2 Server actions / cliente del TPV (`src/app/(dashboard)/tpv/`)
- `actions.ts`: `createSale(input) → ActionResult<SaleReceipt>` (crea venta+líneas+pagos+fidelización),
  `retrySaleLoyalty(...)`, `lookupLoyaltyByQr(...)`. Tipos `ActionResult<T>`, `SaleReceipt`,
  `SaleLoyaltyOutcome`.
- `invoice-actions.ts`: `emitInvoiceAction(...)` (envuelve `emitInvoice`), tipo `ActionResult<T>`.
- `cart.ts` (helpers de carrito, reutilizables): `parseEuroToCents`, `parseQuantity`,
  `centsToEuroInput`, `isLineComplete`, `computeTicketTotals`, `lineFromService`, `lineFromProduct`,
  `blankManualLine`; tipos `TicketLine`, `TenderDraft`, `TicketTotals extends SaleTotals`.
- `print-ticket.ts`: imprime el HTML en un iframe oculto.

### 7.3 Reporte de caja existente — `/arqueo`
`arqueo/page.tsx` → `ArqueoView` (client) agrega `pos_sessions`/`pos_payments`. Es el
**precedente más cercano** a un histórico/reporte con importes; útil como referencia de estilo
para las gráficas.

---

## 8. Helpers de formato compartidos — `@/lib/format`

| Helper | Firma | Salida |
|---|---|---|
| `formatMoney` | `(cents:number, currency="EUR") => string` | `12,30 €` (Intl es-ES). **Usar este en toda la UI.** |
| `formatDate` | `(iso:string) => string` | `12 jul 2026` (date-fns + locale es). |
| `formatDateTime` | `(iso:string) => string` | `12 jul 2026, 10:00`. |

> Nota: `ticket-document.ts` y `invoicing/document.ts` tienen sus **propios** formateadores
> internos (documentos HTML autónomos, sin dependencias de la app) — no confundir con `@/lib/format`,
> que es el de la UI del panel.

---

## 9. Superficie que YA existe vs. lo que probablemente falta

| Área | Existe | Ruta / módulo |
|---|---|---|
| TPV (carrito, cobro, fidelización, ticket) | ✅ | `/tpv`, `@/lib/tpv`, `@/lib/payments` |
| Arqueo de caja | ✅ | `/arqueo` |
| Factura imprimible (F1/F2) | ✅ (API) | `GET /api/facturacion/documento/[id]` |
| Export libro registro (CSV/JSON) | ✅ (API) | `GET /api/facturacion/export` |
| Motor Veri*factu (hash, emisión, export) | ✅ | `@/lib/invoicing` |
| Complementos (entitlements, solo lectura) | ✅ | `/ajustes/complementos` |
| Datos fiscales del salón (form) | ✅ | `/ajustes/fiscal` |
| **Métricas reales del panel** | ❌ placeholder | `/dashboard` (cifras `—`) |
| **Página UI de facturas** (listado) | ❌ | — (solo API) |
| **Listado/histórico de tickets** fuera del TPV | ❌ | — |
| **Gráficas / históricos** | ❌ | — |

**Recomendaciones para las siguientes tareas** (no vinculantes):
1. Reutilizar `@/lib/payments` para cualquier importe agregado; formatear con `formatMoney`.
2. Seguir el patrón Server Component → `-view`, scopeando con `getActiveSalon*` + `.eq("salon_id", …)`.
3. Para facturas/tickets, apoyarse en los índices `(salon_id, issued_at desc)` /
   `(salon_id, sold_at desc)` y en las columnas snapshot ya calculadas (no recomputar).
4. Respetar la **inmutabilidad** de `pos_invoices` (solo lectura/insert; nunca update/delete).
5. Gating de módulos de pago/factura con `pos` (y de fidelización con `loyalty`) vía
   `activeSalonHasFeature` / `salonHasFeature` — presentación; el gate de datos vive en servidor.
