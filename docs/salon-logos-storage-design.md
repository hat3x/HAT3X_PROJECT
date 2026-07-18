# salon-os — Diseño del bucket de Storage `salon-logos` (logo white-label)

> **Propósito.** Documentar el bucket de Supabase Storage que aloja los **ficheros de
> logo** de cada salón, su **convención de ruta** y las **políticas de acceso**,
> creados en `supabase/migrations/20260718130000_storage_salon_logos.sql`
> (HAT3X-024, sub-6).
>
> **Contexto.** La migración `20260718110000_salon_branding.sql` (sub-4) creó
> `public.salon_branding.logo_url`, que guarda la **URL/ruta** del logo — pero
> deliberadamente **no** aloja el fichero (`salon-branding-design.md` §2 *logo_url*:
> «la validación real y el hosting del fichero viven en la capa de app/Storage»).
> Esta tarea materializa ese "hosting en Storage": el bucket donde viven los bytes.
>
> **Convenciones heredadas** (no reinventadas): aislamiento por `salon_id`, gate de
> escritura `owner/manager` vía `app.has_salon_role`, helpers en el esquema `app`,
> y guardián de aserción inline al estilo `rls_multitenant_guard` /
> `salon_branding §guard`.

---

## 1. Convención de ruta (clave de objeto)

```
salon-logos/{salon_id}/logo.<ext>
            └───┬────┘ └───┬────┘
         carpeta = uuid  fichero
         del salón       (nombre libre)
```

| Elemento | Regla |
|---|---|
| **Bucket** | `salon-logos` (público en lectura) |
| **Primer segmento** | **SIEMPRE** el `uuid` del salón. Es la clave del aislamiento: la política de escritura autoriza según `app.has_salon_role(salon_id_de_la_ruta, …)`. |
| **Nombre de fichero** | Libre. **Canónico recomendado:** `logo.png` (un logo por salón; se sobrescribe con *upsert* al cambiarlo). |
| **Extensiones** | `png`, `jpg/jpeg`, `webp`, `svg`, `avif` (impuesto por `allowed_mime_types` del bucket). |
| **Cache-busting** | La autorización depende **solo** del primer segmento, así que valen nombres versionados (`logo-1737200000.webp`) o un `?v=` en la URL, sin tocar las políticas. |

Ejemplo (uuid sintético):

```
salon-logos/9f2c1a4e-0000-0000-0000-000000000000/logo.png
```

**Cómo se deriva el `salon_id` de la ruta.** Las políticas usan
`storage.foldername(name)[1]` (primer segmento de carpeta) envuelto en el helper
`app.storage_object_salon_id(name)`, que castea a `uuid` de forma **segura** (NULL si
la ruta no empieza por un uuid válido → escritura denegada limpiamente, sin error de
cast que reviente la sentencia).

### Enlace con `salon_branding.logo_url`
`logo_url` guarda la **URL pública** del objeto (o una ruta relativa equivalente):

```
{SUPABASE_URL}/storage/v1/object/public/salon-logos/{salon_id}/logo.png
```

El panel (*Ajustes → Marca*, follow-up) sube el fichero al bucket y escribe esa URL en
`salon_branding.logo_url`. Un logo por salón mantiene la relación 1:1 coherente con la
tabla de branding.

---

## 2. Configuración del bucket

| Ajuste | Valor | Motivo |
|---|---|---|
| `id` / `name` | `salon-logos` | Identificador estable citado por todas las políticas (`bucket_id = 'salon-logos'`). |
| `public` | `true` | El logo es un **activo de marca de cara al público** (PWA de reservas, emails, web del salón): sus bytes se sirven sin autenticar por el endpoint `/object/public/…`, como un favicon. |
| `file_size_limit` | `2097152` (2 MiB) | De sobra para un logo; frena subidas abusivas. |
| `allowed_mime_types` | `image/png, image/jpeg, image/webp, image/svg+xml, image/avif` | Solo imágenes web habituales. Rechaza cualquier otro tipo en el propio Storage. |

El `insert … on conflict (id) do update` hace la creación **idempotente**: re-ejecutar
la migración en un entorno limpio/CI mantiene los ajustes en sync sin fallar.

> **Nota SVG.** Se admite `image/svg+xml` (logos vectoriales). El SVG puede contener
> scripts; Supabase sirve Storage desde un **origen distinto** al de la app y con
> `Content-Disposition`, lo que acota el riesgo XSS al mostrarlo como `<img src>`. Si en
> el futuro se incrustara SVG *inline* en el DOM del panel, sanearlo en la app.

---

## 3. Políticas de acceso (`storage.objects`)

Mismo modelo que `services`/`products`/`salon_branding`, pero sobre `storage.objects` y
acotado por `bucket_id = 'salon-logos'`:

| Comando | Política | Rol | Regla |
|---|---|---|---|
| SELECT | `salon_logos_public_read` | `anon, authenticated` | `bucket_id = 'salon-logos'` — **lectura pública** |
| INSERT | `salon_logos_managers_insert` | `authenticated` | `bucket` **y** `app.has_salon_role(salon_id_ruta, {owner,manager})` |
| UPDATE | `salon_logos_managers_update` | `authenticated` | ídem en `using` **y** `with check` |
| DELETE | `salon_logos_managers_delete` | `authenticated` | ídem en `using` |

- **Escritura = owner/manager** del salón **dueño de la ruta**. Un manager del salón A
  **no** puede subir/borrar bajo `{salon_B}/…`: el `has_salon_role` se evalúa contra el
  `salon_id` extraído de la propia ruta. El `staff` **lee** el logo (es público) pero
  **no** lo edita.
- **`with check` en UPDATE anclado a la carpeta del salón** → impide "mover" un objeto a
  la carpeta de otro salón.
- **anon nunca escribe**: las políticas de escritura son `to authenticated` y el
  guardián (e) lo asegura.
- El `drop policy if exists` previo a cada `create` hace las políticas **idempotentes**
  sobre `storage.objects` (tabla compartida por todos los buckets).

### Lectura pública del bucket vs. lectura anon diferida de la tabla — no se contradicen
`salon-branding-design.md` §3 **difiere** abrir lectura `anon` de la **tabla**
`salon_branding` (la FILA: colores + string `logo_url`) sobre `public.*`. Aquí se abre
lectura pública de los **BYTES de la imagen** sobre `storage.objects`. Son superficies
**distintas**:

- Un logo es un activo público no sensible; conocer un `salon_id` no da acceso a nada.
- El guardián *deny-by-default* de `public.*` (`rls_multitenant_guard`,
  `salon_branding §guard`) **no** aplica a `storage.objects`.

Cuando se aborde el white-label público (tema por subdominio antes del login), el logo
**ya** estará disponible por su URL pública; lo que faltará es el camino
`subdominio → salon_id` para los **colores**, que sigue siendo la tarea diferida en la
tabla de branding.

---

## 4. Guardián de aserción (defensa en profundidad)

Bloque `do $guard$` al final de la migración (mismo espíritu que `rls_multitenant_guard`
/ `salon_branding §guard`). Aborta ruidosamente si una migración futura degrada el
modelo. Comprueba:

- **(a)** el bucket `salon-logos` existe y es `public`.
- **(b)** `storage.objects` tiene RLS habilitada (se **asserta**, no se togglea, para no
  depender de la propiedad del esquema `storage`).
- **(c)** existe la política SELECT del bucket (lectura pública intacta).
- **(d)** **toda** política de escritura (INSERT/UPDATE/DELETE) del bucket cita
  `app.has_salon_role` — protege la invariante de esta tarea: nadie afloja una escritura
  sin gate de owner/manager.
- **(e)** ninguna política de escritura del bucket está abierta a `anon`/`public`.

---

## 5. Fuera de alcance / follow-ups

- **UI de subida (*Ajustes → Marca*):** el panel deberá subir a
  `salon-logos/{salon_id}/logo.png` con el cliente de Supabase Storage
  (`upsert: true`) y escribir la URL pública en `salon_branding.logo_url`. No se
  implementa aquí (coherente con el GAP de `salon_branding` ya anotado en
  `salon-branding-design.md` §5).
- **Limpieza de logos huérfanos:** al borrar `salon_branding.logo_url` o el salón, el
  objeto en Storage no se borra solo. Si se quiere, un trigger/Edge Function o una tarea
  de limpieza puede eliminar `salon-logos/{salon_id}/…`. No es crítico (bucket acotado y
  barato).
- **Tipos TS de Storage:** si se generan tipos del cliente de Storage, incluir el bucket
  `salon-logos`. Hoy ningún código de app lo consume todavía.
