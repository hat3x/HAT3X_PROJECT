# Task 3 — Report: Migración (2 tablas + RLS + RPC) + tipos en database.ts

Rama: `hat3x/HAT3X-038`. Ejecutados los pasos **1, 3, 4, 5** del brief. El paso 2
(aplicar la migración en Supabase) se deja explícitamente al controlador/usuario,
tal como se indicó en el encargo.

## Ficheros cambiados

### 1. `supabase/migrations/20260811130000_ortho_payments.sql` (nuevo)

Creado **verbatim** a partir del brief (Step 1): 2 enums (`ortho_plan_status`,
`ortho_installment_status`), tablas `ortho_payment_plan` + `ortho_installment`,
RLS (`ortho_payment_plan_rw`, `ortho_installment_rw`), índices
(`ortho_installment_plan_idx`, `ortho_installment_overdue_idx`), índice único
parcial de plan activo (`ortho_payment_plan_one_active`) y la función RPC
`create_ortho_payment_plan` (`SECURITY DEFINER`, `search_path = ''`, gate
owner/manager, inserción atómica del plan + sus cuotas). No se modificó ni un
carácter del contenido dado en el brief.

### 2. `src/types/database.ts` (modificado — solo adiciones, 153 líneas)

Todas las inserciones son aditivas; no se tocó ninguna línea existente.

- **Línea ~206-210** (justo antes de `export interface Database {`, tras
  `PrescriptionStatus`): dos alias de enum nuevos, siguiendo el mismo patrón
  que `TreatmentPlanStatus`/`PlanItemState`/`ConsentStatus`:
  ```ts
  export type OrthoPlanStatus = "activo" | "completado" | "cancelado";
  export type OrthoInstallmentStatus = "pendiente" | "pagada";
  ```

- **Tras el bloque `ortho_visit` (línea ~3265, dentro de
  `Database["public"]["Tables"]`)**: los dos bloques de tabla nuevos,
  `ortho_payment_plan` y `ortho_installment`, insertados justo después de
  `ortho_visit` y antes de `plan_phase` — exactamente donde indicaba el
  encargo ("tras el bloque `ortho_visit` que ya existe"). Cada uno con
  Row/Insert/Update/Relationships siguiendo el molde de las tablas dentales
  vecinas (`treatment_plan`, `plan_phase`, `customer_insurance`):
  - Columnas mapeadas 1:1 con el `create table` de la migración.
  - `total_cents`, `down_payment_cents`, `installment_count`, `day_of_month`,
    `seq`, `amount_cents`, `paid_amount_cents` → `number`.
  - `start_date`, `due_date`, `paid_at`, `created_at`, `updated_at` → `string`.
  - `status` → `OrthoPlanStatus` / `OrthoInstallmentStatus` (los alias
    definidos arriba, en vez de unions inline — consistente con
    `TreatmentPlanStatus`/`PlanItemState` en el resto del fichero).
  - Nullables (`notes`, `created_by`, `paid_at`, `paid_method`,
    `paid_amount_cents`) → `| null`.
  - Columnas con `default` en SQL (`id`, `down_payment_cents`, `currency`,
    `status`, `created_at`, `updated_at`) → opcionales (`?`) en `Insert`;
    columnas nullable sin default (`notes`, `created_by`, `paid_at`, etc.)
    también opcionales en `Insert`, siguiendo la convención uniforme del
    resto del fichero (toda columna nullable es opcional en Insert,
    independientemente de si tiene DEFAULT explícito en SQL).
  - `Relationships`: solo se listan las FKs **compuestas con constraint
    nombrado** (`ortho_payment_plan_customer_fk` → `clinical_records`,
    `ortho_installment_plan_fk` → `ortho_payment_plan`), igual que hacen
    `treatment_plan`/`plan_phase`/`customer_insurance`. Las FKs de columna
    simple (`salon_id → salons(id)`) se omiten en todo el fichero (incluido
    en `ortho_visit`, que sirvió de molde), así que seguí ese mismo criterio.

- **Sección `Database["public"]["Functions"]`, tras `salon_invoices_totals`
  (antes del `};` de cierre, línea ~3986→4071 tras las inserciones previas)**:
  añadido el bloque `create_ortho_payment_plan` **literal** del brief (Args +
  `Returns: string`), con un comentario JSDoc breve siguiendo el estilo de los
  demás bloques de RPC del fichero.
  - **Cómo tipé la sección `Functions`**: no hizo falta convertir nada — la
    sección ya era un objeto con entradas reales (`salon_sales_summary`,
    `salon_invoices_totals`, etc.), no `{ [_ in never]: never }`. El ejemplo
    `staff_award_visit` que mencionaba el encargo como referencia **no existe**
    en este fichero (verificado por grep); usé en su lugar los bloques RPC ya
    presentes (`salon_invoices_totals`, `salon_agenda_occupancy`, …) como
    molde de formato/indentación.

- **Alias de dominio (línea ~4093, junto a `OrthoVisit`)**:
  ```ts
  export type OrthoPaymentPlan = Tables<"ortho_payment_plan">;
  export type OrthoInstallment = Tables<"ortho_installment">;
  ```

No toqué la sección `Enums:` (línea ~4113): siguiendo el precedente de
`TreatmentPlanStatus`/`PlanItemState` (que tampoco están ahí pese a usarse en
tablas), los enums de ortodoncia-pago no se añadieron a esa sección.

## Cómo aislé el commit (cambios ajenos en `database.ts`)

Al empezar, `src/types/database.ts` ya tenía **39 líneas sin commitear de otra
tarea/rama en curso** (tabla `salon_opening_hours` + su alias
`SalonOpeningHour`, parte de un trabajo de horarios de apertura no relacionado
con ortodoncia — visible también en ~15 ficheros más modificados/sin trackear
en `git status`). Un `git add src/types/database.ts` normal habría arrastrado
esos cambios ajenos al commit.

Procedimiento usado (staging por blob, sin tocar el working tree):

1. Hice **todas** mis ediciones sobre el fichero real (working tree), que ya
   contenía el diff ajeno de `salon_opening_hours` — así `npx tsc --noEmit`
   corrió contra el estado real y completo del repo (evité usar `git stash`
   parcial, que habría roto el typecheck de los ~15 ficheros que ya consumen
   `SalonOpeningHour`/`salon_opening_hours`).
2. Con un script Node de un solo uso (`strip-opening-hours.mjs`, en el
   scratchpad, borrado al terminar) generé una copia del fichero = HEAD + mis
   adiciones de ortodoncia, **sin** el bloque `salon_opening_hours` ni su
   alias (localizados y verificados por texto exacto, con chequeo de que cada
   patrón aparecía exactamente una vez antes de sustituir; el fichero usa
   CRLF, normalizado ida y vuelta para el match).
3. Verifiqué con `git diff --no-index` que esa copia = HEAD + exactamente 153
   inserciones, 0 borrados (mis cambios, nada más).
4. `git hash-object -w` sobre la copia limpia + `git update-index --cacheinfo
   100644,<blob>,src/types/database.ts` para stagear ese contenido
   directamente en el índice, sin tocar el working tree.
5. `git add supabase/migrations/20260811130000_ortho_payments.sql`.
6. Confirmé `git diff --cached --stat` (153 + 138 líneas, solo mis 2 ficheros)
   y `git diff --stat` (39 líneas restantes de `salon_opening_hours`, intactas
   en el working tree, sin commitear) antes de hacer el commit.

Resultado: el working tree del usuario queda exactamente como estaba respecto
al trabajo ajeno de horarios (nada perdido, nada commiteado de más); mi commit
contiene únicamente los 2 ficheros de esta tarea.

## Resultado de `npx tsc --noEmit`

**0 errores** (exit code 0), ejecutado dos veces: una vez con mis cambios ya
aplicados sobre el working tree completo (incluyendo el trabajo ajeno de
horarios) y una segunda vez tras el commit, para confirmar que el estado final
del repo sigue compilando limpio.

## Self-review

- Migración: contenido verbatim del brief, sin modificaciones (diff carácter
  por carácter equivalente al bloque SQL del brief).
- Tipos: 2 tablas nuevas con Row/Insert/Update/Relationships completos y
  consistentes con las columnas exactas del `create table`; función RPC
  tipada literal del brief; 2 alias de dominio nuevos junto a `OrthoVisit`.
- No se modificó ninguna línea preexistente de `database.ts` — confirmado por
  `git diff --no-index` (153 inserciones, 0 borrados) contra HEAD.
- El commit (`a52ba4d`) contiene exactamente 2 ficheros: la migración nueva y
  `database.ts` con solo mis adiciones — confirmado por
  `git show --stat HEAD`.
- El diff ajeno de `salon_opening_hours` en `database.ts` sigue presente y sin
  commitear en el working tree, tal como estaba antes de empezar esta tarea.
- **Paso 2 (aplicar la migración en Supabase) NO se ejecutó** — queda
  pendiente para el controlador/usuario, tal como se indicó explícitamente en
  el encargo. No hay test en esta tarea que toque la BD real.

## Commit

```
a52ba4d feat(ortodoncia): tablas plan de pago + RPC atomica + tipos
 2 files changed, 291 insertions(+)
 create mode 100644 supabase/migrations/20260811130000_ortho_payments.sql
```
