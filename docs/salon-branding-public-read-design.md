# salon-os — Diseño de la lectura pública del branding (`public.get_salon_branding`)

> **Propósito.** Justificar la implementación de la **lectura pública (anónima) del
> white-label por slug**, creada en la migración
> `supabase/migrations/20260718140000_rpc_get_salon_branding.sql` (HAT3X-024, sub-5).
>
> **Contexto.** sub-4 (`salon_branding`, migración `…110000`) dejó la lectura pública
> **explícitamente diferida** como *decisión consciente* (ver
> `docs/salon-branding-design.md §3 "Lectura pública (diferida)"`): el PWA de reservas
> y las apps cliente/staff (un solo código, servido por subdominio) necesitan pintar
> la marca del salón para **visitantes anónimos** (tema por subdominio *antes* del
> login), pero no se abrió acceso `anon` a la tabla para no romper la postura
> *deny-by-default* del esquema. sub-4 señaló la salida preferible: *"una RPC/Edge
> Function pública que devuelva el branding por `slug` (sin exponer la tabla)"*. Esta
> tarea la implementa.

---

## 1. El problema: `salons` mezcla marca y datos sensibles en la misma fila

La identidad visual vive en dos sitios:

| Dato | Tabla | ¿Público? |
|---|---|---|
| `name` (nombre comercial), `slug` | `public.salons` | **sí** (el slug ya va en la URL de reservas) |
| `logo_url`, `primary_color`, `secondary_color` | `public.salon_branding` (1:1) | **sí** |
| `tax_id` (NIF/CIF), `legal_name` (razón social), `fiscal_address` | `public.salons` | **NO** — dato fiscal del emisor |
| `phone`, `email`, `address`, `settings` (jsonb) | `public.salons` | **NO** — PII / configuración |

El nombre comercial y el slug conviven **en la misma fila** que los datos fiscales y
de contacto del salón (columnas añadidas en `fiscal_base`, migración `…170000`). Por
eso **no se puede** "abrir la tabla al `anon`": cualquier `SELECT` anónimo sobre
`public.salons`, por muy acotado que empezara, deja la **superficie** de la tabla
expuesta al rol anónimo y a merced de una regresión futura.

---

## 2. Por qué una RPC `SECURITY DEFINER` y **no** una política `anon`

| Criterio | RPC `get_salon_branding` (elegido) | Política `anon SELECT` sobre la tabla |
|---|---|---|
| Superficie expuesta a `anon` | **5 columnas fijas**, cerradas por el tipo de retorno | la tabla entera; las columnas seguras dependen de que la policy nunca falle |
| Riesgo de fuga por regresión | por construcción imposible añadir `tax_id`/`email` al `RETURNS TABLE` sin tocar el guardián | una policy futura mal escrita (`using (true)`, `select *` de PostgREST, vista heredando el grant) filtra la fila entera |
| Postura del esquema | intacta: **ninguna** tabla tiene lectura `anon`; el guardián de aislamiento sigue verde | rompe *deny-by-default* y el "nada a anon/public" de los guardianes |
| Filtrado de estado (`active`) | dentro de la función, no evadible | hay que recordarlo en cada policy |
| Punto de auditoría | **uno solo**, nominado y con guardián propio | disperso en el catálogo de políticas |

La RPC es una **superficie de datos cerrada por tipo**: `RETURNS TABLE (name, slug,
logo_url, primary_color, secondary_color)`. Aunque el cuerpo cambiara, el tipo de
retorno no puede emitir una columna sensible. La tabla `salons` **sigue intocada**
(RLS *deny-by-default*, cero políticas `anon`), y el acceso anónimo entra por **un
único punto** auditable.

### Contrato (campos EXCLUSIVAMENTE seguros)

```
get_salon_branding(p_slug text) → setof (
  name             text,        -- nombre COMERCIAL (salons.name; NUNCA legal_name)
  slug             text,        -- el propio slug (ya público, va en la URL)
  logo_url         text | null, -- salon_branding.logo_url
  primary_color    text,        -- #rrggbb (default #111827 si no hay branding)
  secondary_color  text | null  -- #rrggbb o null
)
```

**NUNCA:** `tax_id` · `legal_name` · `fiscal_address` · `email` · `phone` · `address`
· `settings`.

---

## 3. Decisiones de implementación

- **`SECURITY DEFINER` + `STABLE` + `search_path=''`** — mismo endurecimiento que
  `app.user_salon_ids()` / `app.salon_has_feature()`. Omite RLS de forma controlada
  (la función lee `salons`/`salon_branding` como su *definer*) sin inyección de
  `search_path`: todo objeto va cualificado (`public.salons`, `public.salon_branding`);
  los built-ins (`lower`, `btrim`, `coalesce`) viven en `pg_catalog`, siempre en el
  path implícito. `language sql` porque es lectura pura.
- **`LEFT JOIN` a `salon_branding` + `coalesce(primary_color,'#111827')`** — el branding
  se provisiona *lazy* (`salon-branding-design §5`): un salón activo puede no tener aún
  su fila. Con `INNER JOIN` devolvería 0 filas y la página de reservas lo creería
  inexistente. Con `LEFT JOIN` + `coalesce` (el **mismo** default `#111827` de la
  columna) un salón activo sin personalizar **aún se pinta**: nombre + slug reales,
  logo `null`, color por defecto. Cumple la invariante del roadmap ("las apps siempre
  tienen con qué pintar en runtime").
- **Filtro `and s.active`** — un salón dado de baja (soft-delete `active=false`) **no**
  filtra ni su marca ni su existencia: devuelve 0 filas, indistinguible de un slug
  inexistente.
- **Sin errores SQLSTATE; "no encontrado" = conjunto vacío** — a diferencia de las RPC
  de escritura (`register_my_customer_account`, `staff_award_visit`), esta **no** lanza
  excepciones. Un error distinto para "slug inexistente" sería un **oráculo de
  enumeración** gratuito. El conjunto vacío filtra lo mínimo (y el slug ya es público).
- **Normalización `lower(btrim(p_slug))`** — la `CHECK` de `salons.slug` garantiza que
  todos los slugs almacenados son *kebab* en minúsculas, así que normalizar la entrada
  solo convierte un fallo por formato en un acierto legítimo; nunca cruza salones.
  `p_slug` entra como **parámetro** (bind), nunca concatenado → sin inyección SQL.
- **Grants** — `revoke all from public;` y luego `grant execute to anon, authenticated`.
  Es la **única** RPC del esquema abierta a `anon` (a propósito). Se concede también a
  `authenticated` porque un cliente logueado de **otro** salón (no miembro de éste)
  también debe poder cargar la marca por slug (RLS le ocultaría la tabla).

---

## 4. Guardián de aserción (defensa en profundidad)

Bloque `do $guard$` al final de la migración (mismo espíritu que `loyalty_base §6` /
`rls_multitenant_guard` / `salon_features §5`). Aborta ruidosamente en CI/entorno
limpio si una regresión futura:

- **(0)** borra la RPC, la degrada de `SECURITY DEFINER`, o le quita el `EXECUTE` de
  `anon` (rompería la lectura pública) — *inverso* al check de helpers de `app.*`.
- **(a)** *(candado central)* cambia el retorno para **exponer** una columna fuera de
  las 5 seguras: comprueba a nivel de catálogo (`pg_proc.proargnames`/`proargmodes`)
  que las columnas `OUT` son **exactamente** `{logo_url, name, primary_color,
  secondary_color, slug}`. Garantía **estructural** del "nunca expongas
  tax_id/legal_name/fiscal_address/email/phone".
- **(b)** abre **cualquier** política a `anon`/`public` sobre `salons` o
  `salon_branding` — la **línea roja** de la tarea: la lectura pública debe pasar
  **solo** por la RPC, la tabla entera nunca se expone al rol anónimo.

---

## 5. Verificación (aplicación real en Postgres 16 efímero)

Se aplicó **toda la cadena** de migraciones (bootstrap Supabase-fiel: roles
`anon`/`authenticated`/`service_role` + `auth.uid()`/`auth.users` stub) sobre un
contenedor `postgres:16` limpio, excluyendo los dos ficheros de sub-tareas concurrentes
(`backfill_salon_features`, `storage_salon_logos`) por no ser dependencias de esta RPC.
Resultado — el guardián de la migración imprimió su `NOTICE` verde y, actuando **como
rol `anon`**:

| Caso | Resultado |
|---|---|
| Salón activo **con** branding (con `tax_id`/`email`/`legal_name` sembrados) | 1 fila, **solo** las 5 columnas de marca; **cero** datos fiscales/PII |
| `"  MI-SALON "` (mayúsculas + espacios) | normalizado → misma fila |
| Salón activo **sin** fila de branding | 1 fila: nombre/slug reales, `logo_url` null, `primary_color = #111827` |
| Salón **inactivo** | 0 filas (sin fuga de existencia) |
| Slug inexistente | 0 filas |
| Columnas `OUT` de la función (catálogo) | `{logo_url, name, primary_color, secondary_color, slug}` |
| Políticas `anon`/`public` en `salons` / `salon_branding` | **0** / **0** |
| `has_table_privilege('anon', …, 'select')` sobre ambas tablas | `false` / `false` |
| `anon` leyendo `salons` / `salon_branding` directamente | `permission denied` en ambas |

La RPC (definer) sirve la marca; el rol `anon` **no** tiene ningún camino directo a la
tabla ni, por tanto, a las columnas sensibles.

---

## 6. Fuera de alcance / follow-ups

- **`src/types/database.ts`** — el bloque `Functions` sigue `Record<never, never>`:
  **ninguna** RPC está reflejada todavía (tampoco `register_my_customer_account` ni
  `staff_award_visit`; es el GAP de tipos ya anotado en `convenciones-rls-rpc-audit
  §0.1`). Se difiere a una tarea de tipos que las incorpore **todas** a la vez
  (`supabase gen types`), en vez de un alta suelta e inconsistente. Firma TS esperada:
  ```ts
  get_salon_branding: {
    Args: { p_slug: string };
    Returns: {
      name: string; slug: string; logo_url: string | null;
      primary_color: string; secondary_color: string | null;
    }[];
  }
  ```
- **Rate-limiting / anti-abuso** — la enumeración de "¿existe el slug X y está activo?"
  es inherente a cualquier reserva por URL y no filtra dato sensible. El abuso por
  volumen se mitiga en el **borde** (PostgREST/Supabase/CDN), no en SQL. Al ser `STABLE`
  con un único argumento escalar, PostgREST admite `GET` (cacheable en CDN).
- **Nuevas columnas de marca** — si `salon_branding` gana una columna pública, hay que
  (1) añadirla al `SELECT` y al `RETURNS TABLE` y (2) actualizar `_expected` en el
  guardián (a), o la migración aborta (intencional: fuerza revisar que es segura para
  `anon`).

---

## 7. Colisión de timestamp (nota de proceso)

Al trabajar en paralelo con otras sub-tareas de HAT3X-024, el slot `20260718120000` fue
tomado por `backfill_salon_features` y `20260718130000` por `storage_salon_logos`. Esta
migración se ubicó en el siguiente slot libre, **`20260718140000`**. El orden es
correcto: solo depende de `salon_branding` (`…110000`), muy anterior.
