# `@/lib/customers/*` — Identidad del cliente por teléfono

Modelo de **cuenta de cliente** y **dedup por teléfono** de Salón OS (FASE 3 del
roadmap, ver `docs/roadmap-productizacion.md`). Implementa el principio rector:

> **Un cliente = una ficha, entre por donde entre** — el salón (alta manual en el
> dashboard), la **app de cliente** (autoservicio) o la **recepcionista IA** (nombre
> + teléfono en la llamada). El **teléfono es la clave natural** con la que se
> reconoce a la persona; la cuenta de auth es un enlace **opcional** sobre esa ficha.

Es el "cómo se persiste y se enlaza" que las migraciones
`20260717100000_customers_user_id.sql`, `20260717110000_customers_phone_e164.sql` y
`20260717120000_rls_self_customer.sql` cimentan en la base de datos.

## Ficheros

| Fichero | Contenido |
| --- | --- |
| `normalize-phone.ts` | `normalizePhone(input)` — teléfono en cualquier formato → E.164. **Espejo byte a byte** de la función SQL `app.normalize_phone(text)`. Pura y testeable. |
| `account.ts` | Acciones de **servidor**: `findCustomerByPhone`, `linkOrCreateCustomerAccount`, `getMyCustomer` + `CustomerAccountError`. |

## El modelo de datos en una imagen

```
                       (app de cliente, tras verificar OTP)
auth.users ──user_id?──▶ customers ◀── phone (crudo, tal como se tecleó/dictó)
 (opcional, nullable)      │  └─ phone_e164  = app.normalize_phone(phone)   ← columna GENERADA
                           │                                                  (no escribible)
                           ├─ UNIQUE (salon_id, phone_e164)  → un teléfono = una ficha por salón
                           └─ UNIQUE (salon_id, user_id)     → una cuenta = una ficha por salón
```

- **`customers.user_id` es NULLABLE a propósito.** La MAYORÍA de las fichas no tienen
  cuenta: nacen cuando el salón o la recepcionista IA dan de alta a alguien (solo
  nombre + teléfono). El enlace a `auth.users` se rellena **solo si —y cuando— esa
  persona se registra en la app** y se vincula a su ficha. Forzar `NOT NULL` rompería
  casi toda el alta de clientes. Espejo exacto de `professionals.user_id`.
- **El único es `(salon_id, phone_e164)`, no `(phone_e164)` global.** Salón OS es
  multi-tenant y multi-marca: la misma persona puede ser cliente de **varios salones**
  (una ficha por salón, todas con el mismo teléfono / el mismo `user_id`). Acotar por
  salón permite "misma persona en N salones" y a la vez prohíbe **dos fichas del mismo
  teléfono dentro de un salón**. Mismo criterio que el email único por salón.
- **Índices parciales `where … is not null`.** Las fichas sin teléfono o sin cuenta
  quedan **fuera** del único y pueden coexistir sin límite.
- **`on delete set null` en `user_id`.** Si se borra la cuenta de auth, la ficha del
  cliente **sobrevive** y solo se desvincula (el historial no se pierde).

## Normalización a E.164 — y por qué hay DOS implementaciones idénticas

Un teléfono se teclea/dicta de mil formas — `612 34 56 78`, `+34 612 345 678`,
`0034612345678`, `(+34) 612-345-678` — y **todas son el mismo número**. Sin
canonicalizar, el dedup por teléfono es imposible. `normalizePhone` (TS) y
`app.normalize_phone` (SQL) reducen cualquier variante a **`+34612345678`**.

Reglas (idénticas y en el mismo orden en ambas):

1. Quedarse solo con dígitos y el `+` de cabecera (fuera espacios, guiones, puntos,
   paréntesis, letras). El `+` sobrevive aunque venga entre paréntesis.
2. Prefijo internacional explícito (`+` o `00`) ⇒ el número ya trae su código de país,
   se respeta. **Sin prefijo ⇒ número nacional español, se antepone `34`** (España es
   el país por defecto de Salón OS).
3. Guarda de cordura E.164: **6–15 dígitos**. Sin número real ⇒ `null` (nunca un
   `+34`/`+` fantasma que colisionaría en el índice único). Así `''`, `'sin tel'`,
   `'()'`, `'---'`, `null`, `undefined` → `null`.

> ⚠️ **Las dos implementaciones DEBEN producir siempre el mismo resultado.** La SQL
> alimenta la columna generada y el índice único; la TS valida/normaliza **antes** de
> escribir (avisar de un duplicado, mostrar la forma canónica, buscar "¿existe ya este
> número?"). Si divergen, la app creería que un número es nuevo y el índice lo
> rechazaría al insertar — o al revés, dos formas del mismo número pasarían el control
> de la app y colisionarían en la BD. **Cualquier cambio en una hay que replicarlo, byte
> a byte, en la otra.** Ver la cabecera de `normalize-phone.ts` para el mapa regla-a-regla.

Es una **normalización pragmática**, no un validador E.164 completo (longitud por país,
móvil vs fijo, operador…). Solo garantiza una forma canónica **estable y comparable**
para el dedup. La validación fina, si se quisiera, va en la capa de app (libphonenumber).

## `phone_e164`: columna GENERADA, no trigger

`phone_e164` es una **columna generada `STORED`**:

```sql
alter table public.customers
  add column phone_e164 text
  generated always as (app.normalize_phone(phone)) stored;
```

**Por qué generada y no un trigger `BEFORE INSERT/UPDATE`** (la opción más robusta):

- **No se puede saltar.** `GENERATED ALWAYS … STORED` lo aplica el **motor** en cada
  `INSERT`/`UPDATE`, venga de la app, de un `COPY` masivo, de SQL manual o de un seed.
  Un trigger `BEFORE` se puede desactivar (`ALTER TABLE … DISABLE TRIGGER`) y, sobre
  todo, la **replicación lógica** corre con `session_replication_role = 'replica'`, que
  **omite los triggers de usuario** por defecto → `phone_e164` quedaría desincronizado.
  La columna generada no.
- **Siempre coherente con el origen.** El valor es *exactamente* `app.normalize_phone(phone)`,
  imposible que "derive". No es escribible: nadie puede meter a mano un `phone_e164` que
  no cuadre con `phone` (un trigger con un bug, o un `UPDATE … SET phone_e164 = …`, sí
  podría).
- **Declarativa y auto-documentada.** La derivación se ve en el esquema (`\d customers`),
  no escondida en el cuerpo de un trigger, y sin preocuparse del orden frente a otros
  triggers (`trg_customers_updated_at`).
- **Requisito cumplido:** la expresión debe ser `IMMUTABLE` — `app.normalize_phone` lo
  es (no lee ninguna tabla). PostgreSQL 12+ soporta `STORED` (Supabase corre PG15+).

**Contrapartida (asumida a propósito):** al ser `STORED`, el valor se calcula al
**escribir**. Si algún día cambia la lógica de normalización, un simple
`CREATE OR REPLACE FUNCTION` **no** recalcula las filas existentes: hay que **recrear la
columna generada** (o hacer un backfill). Además la columna crea una **dependencia**
sobre la función: no se podrá `DROP FUNCTION app.normalize_phone` sin quitar antes la
columna (o con `CASCADE`). Contrapartida preferible a un trigger frágil.

## API (`account.ts`)

```ts
import {
  findCustomerByPhone,
  linkOrCreateCustomerAccount,
  getMyCustomer,
  CustomerAccountError,
} from "@/lib/customers/account";

// STAFF: "¿ya tengo a esta persona en mi salón?" (antes de dar de alta un duplicado).
// Normaliza el teléfono y busca por phone_e164. Devuelve la ficha o null.
const existing = await findCustomerByPhone(salonId, "612 34 56 78");

// AUTOSERVICIO (app de cliente): enlaza/crea la ficha de MI cuenta por mi teléfono.
// Idempotente. El teléfono se asume YA verificado como mío (OTP) aguas arriba.
const { customer, outcome } = await linkOrCreateCustomerAccount({
  salon_id: salonId,
  user_id: myAuthUserId,        // DEBE ser el del usuario autenticado
  phone: "+34 612 345 678",
  full_name: "Ada Lovelace",
  email: "ada@example.com",     // opcional
});
// outcome: "created" | "linked" | "already_linked"

// AUTOSERVICIO: la(s) ficha(s) del cliente autenticado (una por salón → es un ARRAY).
const misFichas = await getMyCustomer();
```

### `linkOrCreateCustomerAccount` — las tres ramas + el conflicto

Identifica a la persona por su teléfono normalizado y reconcilia con la cuenta:

| Situación de la ficha con ese `phone_e164` en el salón | Resultado | `outcome` |
| --- | --- | --- |
| No existe | Se **crea** enlazada a `user_id` | `created` |
| Existe **sin cuenta** (`user_id` null) | Se **enlaza** a esta cuenta | `linked` |
| Existe con **esta misma** cuenta | No-op idempotente | `already_linked` |
| Existe con **otra** cuenta | **Conflicto 409** (teléfono de otra persona) | — (`CustomerAccountError`) |

Al **crear**, el resto lo hace la BD sola: el `DEFAULT` rellena `qr_token`, la columna
generada calcula `phone_e164` y el trigger **`trg_customers_bootstrap_loyalty`**
(`app.bootstrap_customer_loyalty()`) crea la cuenta de puntos + el cupón de bienvenida.

**Idempotencia y carreras.** Si dos peticiones concurren, los índices únicos
`(salon_id, phone_e164)` / `(salon_id, user_id)` protegen la BD; ante un `23505`
(unique violation) el código **re-resuelve** por teléfono y por cuenta y reaplica la
misma lógica de enlace, de modo que el reintento **converge** sin duplicar ni lanzar un
error opaco. El `UPDATE` del enlace es condicional a `user_id is null` para no pisar una
carrera con otro enlace concurrente.

## Seguridad

- **Dos clientes Supabase** (mismo patrón que `@/lib/loyalty/server` y `@/lib/booking/server`):
  - **Cliente RLS de la sesión** (`@/lib/supabase/server`) para **autorizar** y para las
    lecturas del propio usuario. Las políticas de Postgres ya acotan por salón y por
    `user_id = auth.uid()`, así que una consulta cruzada no ve nada ajeno.
  - **Cliente admin** (service role, omite RLS) **solo** en el enlace/creación de cuenta:
    quien se registra en la app **no es miembro del salón** y su ficha aún tiene
    `user_id = NULL` — bajo RLS no podría ni verla ni enlazarla. Con el admin se acota
    **siempre a mano por `salon_id`** y se exige que la cuenta enlazada sea la del propio
    usuario autenticado.
- **Autoservicio estricto.** `linkOrCreateCustomerAccount`/`getMyCustomer` verifican que
  `user_id` == usuario de la sesión (`forbidden` 403 si no). `findCustomerByPhone` exige
  **pertenencia** (`salon_members`) al salón: es una herramienta de **staff**.
- **RLS SELF (defensa en profundidad).** La migración `20260717120000_rls_self_customer.sql`
  da a la cuenta enlazada acceso **solo a su propia** ficha (SELECT/UPDATE) y lectura de
  su fidelización, con un **candado de columnas** (trigger `trg_customers_enforce_self_update_columns`)
  que en la ruta de autoservicio congela `salon_id`, `qr_token`, `notes`, `user_id`, `id`
  y `created_at`. Ver esa migración y `docs/multitenant-loyalty-contract.md`.

> ⚠️ **Requisito NO cubierto aquí: PROPIEDAD del teléfono.** `linkOrCreateCustomerAccount`
> **confía** en que el teléfono ya se verificó como del usuario (p. ej. OTP por SMS)
> **antes** de llamar. Sin esa verificación, cualquiera podría reclamar el teléfono de
> otra persona y apropiarse de su ficha. La verificación OTP es responsabilidad de la
> capa que invoca esta función.

## `CustomerAccountError` → HTTP

Mismo patrón que `BookingError` / `LoyaltyActionError`: error de dominio con estado HTTP
asociado, para que un Route Handler o Server Action lo traduzca sin filtrar detalles.

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `invalid_request` | 400 | Datos inválidos o teléfono sin número real |
| `unauthorized` | 401 | Sin sesión |
| `forbidden` | 403 | La cuenta no es la del usuario autenticado / no es miembro del salón |
| `not_found` | 404 | Salón inexistente |
| `conflict` | 409 | El teléfono ya está vinculado a **otra** cuenta en el salón |
| `internal` | 500 | Fallo de consulta |

## Tests

- `src/tests/unit/normalize-phone.test.ts` — la normalización (paridad con el SQL).
- `src/tests/integration/customers-account.test.ts` — idempotencia y las tres ramas
  (crear/enlazar/no-op), el conflicto de teléfono ajeno, "solo tu propia cuenta" y el
  acotado por `salon_id`, sobre un doble con estado de Supabase (la RLS real se valida en
  la capa de BD: migraciones + guardianes).

## Troubleshooting

El **dedup, la resolución de un duplicado previo** al aplicar el índice único y el
**conflicto 409** de teléfono ajeno están en
**[MANTENIMIENTO.md → Identidad del cliente](../../../MANTENIMIENTO.md#identidad-del-cliente--cuenta-teléfono-y-dedup)**.
