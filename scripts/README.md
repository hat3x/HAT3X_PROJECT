# scripts/ — Utilidades de Node fuera del build de la app

Scripts operativos que se ejecutan con [`tsx`](https://tsx.is) y **no forman parte
del build de Next.js** (el `tsconfig.json` raíz excluye `scripts/`; este directorio
tiene su propio `scripts/tsconfig.json`). Pueden importar código de la app vía el
alias `@/*` (la dependencia es unidireccional: script → app, nunca al revés).

## Requisitos

- Node ≥ 20 (probado en v24).
- `.env.local` en la raíz del proyecto con, al menos:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (solo servidor — **nunca** se commitea ni se imprime)

  Las claves se leen del entorno; si no están ya presentes, se cargan de `.env.local`.
  Ver `.env.example` para la lista completa.

## `seed-demo-salon.ts` — Seed de datos demo

Crea (o reutiliza, idempotente) un **salón demo aislado** (`Bella Studio`, slug
`demo`) con su propio `salon_id` y siembra su **configuración base** (sub-3). Las
subtareas posteriores añaden clientes, citas, tickets, facturas y fidelización de
forma **additiva** (ver
[`docs/seed-demo-contracts.md`](../docs/seed-demo-contracts.md)).

```bash
npm run seed:demo                     # crea/reutiliza el salón demo y su config
npm run seed:demo:check               # valida entorno + credenciales SIN tocar la BD
npm run seed:demo -- --dry-run        # simula el flujo sin escribir en la BD
npm run seed:demo -- --reset-password # regenera la contraseña del owner si ya existe
npm run typecheck:scripts             # comprueba tipos de todos los scripts
```

### Configuración base que siembra (sub-3)

Todo idempotente y acotado por las guardas de seguridad:

| Objeto | Qué crea |
|---|---|
| `salons` | Fila `Bella Studio` (slug `demo`, `Europe/Madrid`, datos fiscales ficticios: `Bella Studio Demo S.L.` / `B00000000` / dirección demo, `active=true`). |
| `auth.users` | Usuario **owner** vía `admin.createUser`. Login por **ID de acceso** `demo` (→ email sintético `demo@salonos.app`) y contraseña **generada**. |
| `salon_members` | El owner con `role='owner'`. |
| `salon_features` | **Todos** los add-ons activos: `loyalty`, `client_app`, `staff_app`, `pos`, `ai_receptionist` (upsert `enabled=true`). |
| `salon_branding` | Logo placeholder **SVG** subido al bucket `salon-logos` (`{salon_id}/logo.svg`) + colores de marca con buen contraste (primario `#9D174D` ≈ 7.9:1 · secundario `#0F766E` ≈ 5.5:1 vs. blanco). |

> **Credenciales del owner.** Al crearlo (o con `--reset-password`), el script imprime
> el ID de acceso, el email de login y la **contraseña generada** en la salida —
> guárdala, no se puede recuperar. Fija una estable con `SEED_DEMO_OWNER_PASSWORD`.
> (Esto es una credencial de demo pensada para usarse; la `SUPABASE_SERVICE_ROLE_KEY`
> jamás se imprime.)

### Configuración operativa que siembra (sub-4)

El catálogo declarativo vive en [`seed-demo-data.ts`](./seed-demo-data.ts) (datos
**puros**, sin efectos, testeados en `src/tests/unit/seed-demo-operational.test.ts`).
Todo idempotente y additivo (no altera filas existentes):

| Objeto | Qué crea |
|---|---|
| `locations` | **2 sedes** en Madrid: `Bella Studio Centro` (`centro`, 09:30–20:30) y `Bella Studio Norte` (`norte`, 09:00–19:00), con dirección y teléfono. Idempotente por `(salon_id, slug)`. |
| `professionals` | **8 profesionales** con nombres realistas (5 en Centro, 3 en Norte), con `specialties` y color de agenda `#rrggbb`. Idempotente por `(salon_id, full_name)`. |
| `services` | **23 servicios** en 6 categorías (Corte, Peinado, Color, Mechas, Tratamiento, Barbería) con el modelo de **3 fases** (`application_min`/`exposure_min`/`post_exposure_min`) y **precios realistas en céntimos**. `duration_minutes(_total)` son generadas (no se insertan). Idempotente por `(salon_id, name)`. |
| `products` | **10 productos** retail (champús, mascarillas, etc.) con `price_cents`, `vat_rate` (21 %) y `stock`. Idempotente por `(salon_id, name)`. |
| `professional_services` | Enlaces servicio↔profesional derivados de las especialidades (espejo de `professionalCoversService`). Es lo que hace **reservable** cada servicio. UPSERT `ON CONFLICT DO NOTHING`. |
| `professional_schedules` | Horario recurrente **L–S** (`weekday` 1..6) de cada profesional con las horas de apertura de **su** sede. Idempotente por profesional (si ya tiene tramos, se respeta). |

> **Orden de siembra** (dependencias de FK): sedes → profesionales → servicios →
> productos → enlaces servicio↔profesional → horarios. En `--dry-run` se describe el
> plan sin escribir.

### Clientes que siembra (sub-5)

El generador **puro y determinista** vive en
[`seed-demo-customers.ts`](./seed-demo-customers.ts) (nombres, teléfonos y emails
ficticios, sin efectos ni BD; testeado en
`src/tests/unit/seed-demo-customers.test.ts`). Todo additivo e idempotente:

| Objeto | Qué crea |
|---|---|
| `customers` | **80–150 fichas** (por defecto **120**) con **nombres españoles realistas** (nombre de pila + dos apellidos), **teléfonos únicos y normalizables** (formatos variados que `app.normalize_phone` canonicaliza a E.164) y **mezcla con y sin email** (~⅔ con email, únicos). Dedup por `phone_e164`. |
| `customers.qr_token` | Token de fidelización (QR). Lo pone el **DEFAULT** de la columna, no el seed. |
| `loyalty_accounts` + `welcome_coupons` | **Automáticos por ficha** vía el trigger `trg_customers_bootstrap_loyalty` (cuenta de puntos a 0 + cupón de bienvenida 10 % / 90 días). |

> **Idempotencia por teléfono.** El generador es determinista: al reejecutar produce
> los mismos números y el dedup por `phone_e164` (único parcial `(salon_id,
> phone_e164)`) evita reinsertar. Ajusta el volumen con `SEED_DEMO_CUSTOMER_COUNT`
> (saturado a 80–150). En `--dry-run` describe el plan sin escribir.

### Citas que siembra (sub-6)

El generador **puro y determinista** vive en
[`seed-demo-appointments.ts`](./seed-demo-appointments.ts) (sin efectos ni BD;
testeado en `src/tests/unit/seed-demo-appointments.test.ts`). Produce ~**12 meses**
de citas con **estacionalidad** (más viernes/sábado + picos en fechas señaladas) y
una **agenda futura** de ~4 semanas. Reutiliza el contrato de citas de
[`docs/seed-demo-contracts.md`](../docs/seed-demo-contracts.md) §4. Todo additivo e
idempotente:

| Objeto | Qué crea |
|---|---|
| `appointments` | Citas vinculadas a **profesionales, servicios y sedes reales** ya sembrados. `starts_at` (UTC) se deriva de la hora local con `zonedWallTimeToUtc` (respeta DST); `ends_at = starts_at + (application+exposure+post)` minutos (**modelo de 3 fases**, igual que el motor de reservas). **Mayoría pasadas `completed`** con una minoría `cancelled`/`no_show`, y **futuras `confirmed`/`pending`** para poblar la agenda próxima. |
| `appointment_blocks` | **Automáticos por trigger** `trg_appointment_blocks_sync` (fases `application`/`post_exposure`). El plan NO solapa por profesional ⇒ la exclusión `appointment_blocks_no_overlap` (23P01) nunca salta. **El seed no los toca.** |
| `visits` | **Automáticas por trigger** `trg_appointments_create_visit`: las citas pasadas se insertan activas y se transicionan a `completed` (un INSERT directo con `completed` NO crearía la visita). Base del histórico de negocio y de la métrica de ocupación de agenda. |

> **Estacionalidad (España/Madrid).** Factor por día de la semana (fin de semana
> más cargado) y picos en campaña de **Navidad**, **Nochevieja**, **Semana Santa**
> (calculada con el algoritmo de Gauss), **Día de la Madre**, **San Valentín**,
> **pre-vacaciones de verano**, **Black Friday** y un **hueco de agosto**; más una
> tendencia de crecimiento (los meses recientes cargan más que los de hace un año).
> Ajusta el volumen con `SEED_DEMO_APPOINTMENT_DENSITY`. En `--dry-run` describe el
> plan (recuentos por estado) sin escribir.

### Garantías de seguridad

- **Salón real intocable.** El seed tiene *prohibido por diseño* escribir sobre
  `denueveanueve` (`abeef620-4fe3-4b29-a17b-6c51a8284f8f`), sea por id o por slug.
- **Solo salones propios.** Si el slug objetivo ya existe pero no lleva la marca
  `settings.seed_demo === true`, el seed **aborta** en vez de escribir sobre un
  salón que no creó él mismo.
- **Additivo e idempotente.** Nunca hace `UPDATE`/`DELETE`; re-ejecutar no duplica
  el salón demo (se busca por slug y se reutiliza). El helper `ensureRow` aplica el
  mismo patrón a las escrituras de dominio.

### Variables de entorno opcionales

| Variable | Por defecto | Nota |
|---|---|---|
| `SEED_DEMO_SALON_SLUG` | `demo` | **Nunca** puede ser `denueveanueve`. |
| `SEED_DEMO_SALON_NAME` | `Bella Studio` | |
| `SEED_DEMO_SALON_TZ` | `Europe/Madrid` | |
| `SEED_DEMO_SALON_TAX_ID` | `B00000000` | NIF/CIF demo (para facturación). |
| `SEED_DEMO_SALON_LEGAL_NAME` | `Bella Studio Demo S.L.` | Razón social demo. |
| `SEED_DEMO_SALON_FISCAL_ADDRESS` | *(cae a `_ADDRESS`)* | Domicilio fiscal demo. |
| `SEED_DEMO_SALON_ADDRESS` | `Calle Gran Vía 28, 3.º B, 28013 Madrid, España` | Dirección (visible) demo. |
| `SEED_DEMO_PRIMARY_COLOR` | `#9D174D` | Color de marca principal (`#rrggbb`). |
| `SEED_DEMO_SECONDARY_COLOR` | `#0F766E` | Color de marca secundario (`#rrggbb`). |
| `SEED_DEMO_OWNER_ID` | `demo` | ID de acceso del owner (→ `demo@salonos.app`). |
| `SEED_DEMO_OWNER_PASSWORD` | *(generada)* | Contraseña fija del owner (si se omite, se genera). |
| `SEED_DEMO_CUSTOMER_COUNT` | `120` | Nº de clientes demo a sembrar; **saturado** al rango pedido 80–150. |
| `SEED_DEMO_APPOINTMENT_DENSITY` | `1.2` | Densidad de citas (media/profesional/día antes de estacionalidad); **saturada** a 0.2–6. |
| `SEED_DEMO_RESET_PASSWORD` | — | `1` equivale a `--reset-password`. |
| `SEED_DRY_RUN` | — | `1` equivale a `--dry-run`. |
| `SEED_CHECK` | — | `1` equivale a `--check`. |

### Extensión (subtareas de dominio)

`seedDomainData(ctx)` es el punto de extensión. Cada paso nuevo debe:
1. Llamar `assertNotProductionSalon({ id: ctx.salonId, slug: ctx.slug })` antes de escribir.
2. Ser additivo/idempotente (`ensureRow` o guardas por clave natural).
3. Reutilizar la lógica ya existente descrita en `docs/seed-demo-contracts.md`
   (`computeSaleTotals`, `emitInvoice`, `createBookingForSalon`, matemática de puntos…)
   en lugar de reimplementar reglas de negocio.

## `teardown-demo-salon.ts` — Teardown del salón demo

Contrapartida **destructiva** del seed: borra por completo el salón demo (`demo`) y
**todo lo que cuelga de él** por `salon_id` (clientes, citas, tickets, pagos,
**facturas**, fidelización, marca, membership, add-ons), su **logo** en Storage y el
**usuario auth del owner**. Deja la BD limpia para regenerarla con `npm run seed:demo`.

```bash
npm run teardown:demo                 # borra el salón demo y todo lo suyo
npm run teardown:demo:check           # valida entorno + resuelve el salón SIN escribir
npm run teardown:demo -- --dry-run    # detalla el plan de borrado (recuentos) sin escribir
npm run teardown:demo -- --keep-owner # borra el salón pero conserva el usuario owner
```

### El reto: facturas inmutables (Veri\*factu)

`pos_invoices` es un registro fiscal **inmutable**: el trigger
`trg_pos_invoices_immutable` (BEFORE UPDATE OR DELETE) aborta cualquier borrado
**incluso para `service_role`**. Como todo cuelga de `salons` con `ON DELETE CASCADE`,
borrar el salón dispararía el borrado en cascada de sus facturas… que el trigger
bloquea. El teardown lo resuelve **dentro de una transacción**:

```sql
begin;
alter table public.pos_invoices disable trigger trg_pos_invoices_immutable;
delete from public.salons where id = $demo and id <> $real and settings->>'seed_demo' = 'true';
alter table public.pos_invoices enable trigger trg_pos_invoices_immutable;
commit;
```

Si algo falla, el `rollback` revierte también el `disable` (es transaccional); un
`finally` re-habilita el trigger de forma idempotente y una aserción post-commit
sobre `pg_trigger` verifica que quedó habilitado. **La inmutabilidad fiscal nunca se
queda desactivada.**

### Dos credenciales

`DISABLE TRIGGER` es **DDL**: la `SUPABASE_SERVICE_ROLE_KEY` (un JWT de PostgREST) no
puede ejecutarlo. Por eso el borrado real necesita **también**:

| Variable | Uso |
|---|---|
| `SUPABASE_DB_URL` | Conexión Postgres **directa** (rol `postgres`, dueño de las tablas). Solo para la transacción trigger-toggle + `delete from salons`. **Obligatoria** para el borrado real; no para `--check`/`--dry-run`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Lo que vive fuera de Postgres: borrar el logo en Storage y el usuario owner (`auth.admin.deleteUser`). |

Consíguela en **Project Settings › Database › Connection string (URI)** y añádela a
`.env.local` (ver `.env.example`).

### Garantías de seguridad

- **Salón real intocable.** `assertNotProductionSalon` (importada del seed) veta
  `denueveanueve` por id y por slug, y el propio `DELETE` re-afirma la guarda **en
  SQL** (`id <> <real>` + `settings.seed_demo = true`); exige borrar **exactamente 1**
  fila o revierte.
- **Solo salones propios.** Si el slug existe pero no lleva `settings.seed_demo`, aborta.
- **Idempotente.** Si el salón ya no existe, es un no-op limpio (y limpia un usuario
  owner demo huérfano si quedara). Re-ejecutar no rompe.

### Verificar reset limpio y regeneración

```bash
npm run teardown:demo        # → borra el salón demo (facturas incluidas)
npm run teardown:demo:check  # → "No existe ningún salón con slug 'demo'": limpio
npm run seed:demo            # → recrea el salón demo desde cero
```
