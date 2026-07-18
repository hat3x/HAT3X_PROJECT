# salon-os — Diseño de `public.salon_branding` (white-label por salón)

> **Propósito.** Justificar la elección de columnas, tipos, constraints y políticas
> RLS de la tabla `public.salon_branding`, creada en la migración
> `supabase/migrations/20260718110000_salon_branding.sql` (HAT3X-024, sub-4).
>
> **Contexto.** Realiza la opción "tabla dedicada" del roadmap de productización
> (`docs/roadmap-productizacion.md` §"Productización — planes + white-label",
> líneas 52-56): *logo + color de marca por salón, en `salons.settings` **o** tabla
> `salon_branding`; panel y apps se pintan con la identidad del salón en runtime*.
> Esta migración escoge la tabla dedicada. Convive con `salons.settings` (jsonb),
> que sigue reservada para **planes/entitlements** (audit §2).
>
> **Convenciones heredadas** (no reinventadas): FK simple a la raíz `salons`
> (audit §2), CHECK de color de `professionals.color`, patrón RLS de
> `products`/`services`, trigger `app.set_updated_at()`, guardián inline al estilo
> `loyalty_base §6` / `rls_multitenant_guard`.

---

## 1. ¿Tabla dedicada o `salons.settings` (jsonb)?

| Criterio | `salon_branding` (elegido) | `salons.settings` jsonb |
|---|---|---|
| Validación de formato de color | **CHECK nativo** (`~ hex`) | manual en app; la BD no la garantiza |
| Tipado / autocompletado | columnas → `database.ts` tipa `Row/Insert/Update` | `Json` opaco |
| Documentación | `comment on column` por campo | ninguna a nivel BD |
| Superficie RLS | explícita y **auditable por el guardián** | heredada de `salons` (grano de fila, no de clave jsonb) |
| Coste | +1 tabla 1:1 | 0 (ya existe) |

Se elige la **tabla dedicada** porque el branding tiene forma fija y conocida (logo
+ 2 colores) y se beneficia de CHECK de color, tipos y una política de escritura
propia y verificable. `settings` queda para lo que sí es abierto/variable
(planes/entitlements). Es exactamente la disyuntiva que el roadmap dejó abierta.

---

## 2. Elección de columnas

### `salon_id uuid` — **PK y FK a la vez**
- **1:1 con `salons`.** Que `salon_id` sea **PRIMARY KEY** garantiza *como máximo una*
  fila de branding por salón sin un `unique` extra. Que sea **FK** a `salons(id)`
  garantiza que el salón existe.
- **FK simple, no compuesta.** `salons` es la raíz del tenant y **no** tiene clave
  `(id, salon_id)`; todas las tablas la referencian con FK simple
  `salon_id → salons(id) on delete cascade` (audit §2). Aquí igual.
- **`on delete cascade`**: al borrar el salón se borra su branding. (El hard-delete
  de un salón con actividad está bloqueado por otras FKs `restrict`/inmutabilidad →
  en la práctica se hace soft-delete `active=false`; el cascade solo actúa en el
  borrado real, p. ej. de un salón vacío de pruebas.)
- **Índice del FK "gratis":** la PK ya crea el índice único sobre `salon_id`, que es
  la propia columna del FK → **no** hace falta un `idx_salon_branding_salon_id`
  aparte (a diferencia de las tablas cuyo FK no es la PK).

### `logo_url text` — nullable, **sin** CHECK de formato
- **Opcional:** un salón puede no tener logo aún.
- **Texto libre**, como `salons.address` / `customers.notes`: un CHECK de URL
  rígido rechazaría valores válidos (rutas de Supabase Storage, `data:` URIs, rutas
  relativas servidas por subdominio). La validación real y el hosting del fichero
  viven en la **capa de app/Storage**, no en la BD.

### `primary_color text` — **NOT NULL**, default `#111827`, CHECK hex
- **NOT NULL a propósito:** el spec lista `secondary_color text null` pero **no**
  marca null en `primary_color`; se honra ese contraste → el color principal es
  obligatorio.
- **`default '#111827'` (gris neutro casi negro):** el roadmap exige que las apps
  se pinten con la identidad del salón *en runtime*; el default hace que **siempre**
  haya un color renderizable, incluso antes de que el owner personalice. Es un
  **fallback neutro deliberadamente poco opinado** (no un tono de marca inventado),
  pensado para que el owner lo sobrescriba en *Ajustes → Marca*. Al ser tabla nueva
  y vacía, el NOT NULL + default no requiere backfill.
- **CHECK `~ '^#[0-9a-fA-F]{6}$'`:** reutiliza **exactamente** la regex de
  `professionals.color` (migración inicial, línea 97) → una sola convención de color
  en todo el esquema: hex de 6 dígitos con `#`, case-insensitive. Se descartan a
  propósito el atajo de 3 dígitos (`#fff`) y el alfa de 8 (`#rrggbbaa`), por
  coherencia con lo ya existente.

### `secondary_color text` — nullable, mismo CHECK hex
- **Opcional** (acento). `NULL` = el salón no define acento propio; la app decide el
  fallback (p. ej. derivarlo del primario).
- **Mismo CHECK hex** que el primario. Un CHECK sobre columna nullable **se cumple
  cuando el valor es NULL** (evalúa a `unknown`), así que solo restringe los valores
  no nulos. El spec solo pedía validar el primario, pero aplicar el mismo formato al
  secundario es integridad de datos gratis y sin efectos colaterales.

### `created_at` / `updated_at timestamptz not null default now()`
- Invariante del esquema. `updated_at` lo mantiene el trigger compartido
  `trg_salon_branding_updated_at → app.set_updated_at()` (igual que el resto de
  tablas mutables).

---

## 3. Políticas RLS

Mismo patrón que `products`/`services` (audit y `20260711100100_rls_policies.sql`):

| Comando | Política | Regla |
|---|---|---|
| SELECT | `members_select_salon_branding` | `salon_id in (select app.user_salon_ids())` — cualquier miembro |
| INSERT | `managers_insert_salon_branding` | `app.has_salon_role(salon_id, {owner,manager})` |
| UPDATE | `managers_update_salon_branding` | idem en `using` **y** `with check` |
| DELETE | `managers_delete_salon_branding` | idem en `using` |

- **Escritura = owner/manager** (INSERT/UPDATE/DELETE), exactamente lo pedido
  ("Políticas de escritura restringidas a owner/manager … usando
  `app.has_salon_role`"). El `staff` puede leer el branding (lo necesita para pintar
  la app) pero **no** editarlo.
- **`to authenticated`, deny-by-default, nada a anon/public** — postura del esquema.
- El **provisioning** (crear la fila inicial al dar de alta un salón) puede hacerse
  por `service_role`/definer, que **bypasa RLS**; no hace falta una política de
  INSERT para `staff`.

### Lectura pública (diferida) — decisión consciente
El PWA de reservas podría necesitar el logo/colores para **visitantes anónimos**
(tema por subdominio antes del login). **No se abre lectura anon aquí** a propósito:

1. Rompería el guardián (`nada a anon/public`) y la postura deny-by-default de todo
   el esquema (hoy **ninguna** tabla tiene lectura anon).
2. El anon no tiene forma de acotar a un salón sin un camino público
   subdominio→`salon_id` que aún no existe.

Cuando se aborde el white-label público será una tarea **deliberada**: o una política
`anon` de SELECT que exponga **solo** columnas de branding de salones `active`, o —
preferible— una **RPC/Edge Function pública** que devuelva el branding por `slug`
(sin exponer la tabla). Se deja anotado para no bloquear el roadmap ni abrir anon en
silencio.

---

## 4. Guardián de aserción (defensa en profundidad)

Bloque `do $guard$` inline al final de la migración (mismo espíritu que
`loyalty_base §6` / `rls_multitenant_guard`). Aborta ruidosamente si una migración
futura degrada el aislamiento. Comprueba sobre `salon_branding`:

- **(a)** RLS habilitada.
- **(b)** existe SELECT acotado por `app.user_salon_ids()`.
- **(c)** ninguna política a `anon`/`public`.
- **(d)** *(extensión propia)* **toda** política de escritura (INSERT/UPDATE/DELETE)
  cita `app.has_salon_role` — protege específicamente la invariante de esta tarea:
  si alguien añade/afloja una escritura sin gate de owner/manager, la migración falla
  en CI en vez de exponer la edición del branding a cualquier miembro.

> Nota: `salon_branding` es una tabla **de tenant** (escritura owner/manager), así que
> pertenece a la familia del *multitenant guard*, **no** a la del *self guard*
> (`rls_self_guard`, que solo barre las 5 tablas de superficie de cliente y exige
> anclas `user_customer_ids`/`auth.uid`). No se toca aquel guardián.

---

## 5. Fuera de alcance / follow-ups

- **`src/types/database.ts`:** aún **no** incluye `salon_branding` (ni hay código de
  app que la consuma todavía). Regenerar los tipos (`supabase gen types typescript`)
  o añadir el bloque `Tables.salon_branding` a mano cuando el panel implemente
  *Ajustes → Marca*. Coherente con el GAP de tipos ya anotado en el audit §0.1.
- **Provisioning inicial:** decidir si se crea una fila de branding por defecto al
  alta del salón (tercer trigger `AFTER INSERT` en `salons`, que convive con
  `trg_salons_register_owner` y `trg_salons_register_payment_methods` — audit §2) o
  se crea *lazy* desde la UI. No se implementa aquí: la tabla admite ambos (el
  default de `primary_color` permite insertar solo con `salon_id`).
- **Lectura pública** para el PWA anónimo: ver §3.
