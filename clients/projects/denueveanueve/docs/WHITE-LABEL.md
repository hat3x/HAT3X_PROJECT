# White-label multi-salón — resolución, marca y contraste (referencia)

> Sub-tarea **sub-11** · App CLIENTE · 2026-07-19
> Referencia ampliada del [README § Multi-salón](../README.md#multi-salón-white-label-resolución-marca-y-contraste):
> heurística del subdominio, flujo de branding, matriz de fallback y el cálculo del
> contraste **WCAG AA**, con ejemplos y las pruebas que fijan cada contrato.

La app cliente es **white-label multi-tenant**: un **único build** sirve a todos los
salones y el salón se resuelve en **runtime**. El `salon_id` (uuid) **se deriva** del
branding resuelto, no de ninguna variable de build (`VITE_SALON_ID` queda deprecada).

Módulos (los **puros** no dependen de React ni de Supabase, y se prueban en aislamiento):

| Módulo | Rol | Puro | Pruebas |
|---|---|:---:|---|
| [`src/lib/salon.ts`](../src/lib/salon.ts) | `resolveSalonSlug` (prioridad) + `mapSalonBrandingRow` | ✅ | [`salon.test.ts`](../src/lib/salon.test.ts) |
| [`src/lib/salon-branding.ts`](../src/lib/salon-branding.ts) | `fetchSalonBranding` (RPC) + `resolveSalonLogoUrl` (bucket) | — | — |
| [`src/lib/salon-theme.ts`](../src/lib/salon-theme.ts) | `resolveBrandTheme` + contraste WCAG | ✅ | [`salon-theme.test.ts`](../src/lib/salon-theme.test.ts) |
| [`src/lib/salon-context.tsx`](../src/lib/salon-context.tsx) | `<SalonProvider>` / `useSalon()` | — | — |

---

## 1. Resolución del slug — `subdominio > ?salon= > env`

`resolveSalonSlug({ hostname, search, envSlug })` devuelve `{ slug, source }`, con
`source ∈ { 'subdomain', 'query', 'env', 'none' }`. Prioridad **estricta**: el
primero que produce un slug válido gana.

```
window.location.hostname ─┐
                          ├─▶ extractSubdomain()  ── válido ──▶ { slug, 'subdomain' }
                          │                             │
window.location.search  ──┼─▶ ?salon= (normalizado) ── válido ──▶ { slug, 'query' }
                          │                             │
import.meta.env           │                             │
  .VITE_SALON_SLUG      ──┴─▶ envSlug  (normalizado) ── válido ──▶ { slug, 'env' }
                                                        │
                                                    (ninguno) ──▶ { null, 'none' }
```

`<SalonProvider>` invoca la función pura **una vez por carga** (`useMemo([])`) con
el host y la URL reales, y pasa `VITE_SALON_SLUG` como `envSlug`.

### Formato de slug

Kebab-case en minúsculas, `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longitud 1–63. Es la
**misma** convención que la `CHECK` de `salons.slug` y que una etiqueta DNS. Las
entradas de `?salon` y `VITE_SALON_SLUG` se **normalizan** (recorte + minúsculas)
antes de validar; si no cumplen, se **descartan** y se cae al siguiente nivel.

### Heurística del subdominio (`extractSubdomain`)

Se asume un dominio raíz de **dos etiquetas** (`salonos.app`, el del despliegue):
un host con **> 2 etiquetas** tiene subdominio (la primera). Antes se normaliza
(minúsculas, sin puerto, sin punto final) y se descartan hosts sin subdominio útil.

| Host de entrada | Slug | `source` | Motivo |
|---|---|---|---|
| `jotabarber.salonos.app` | `jotabarber` | `subdomain` | Subdominio directo. |
| `JotaBarber.salonos.app` | `jotabarber` | `subdomain` | Se pasa a minúsculas. |
| `jotabarber.salonos.app.` | `jotabarber` | `subdomain` | Se tolera el punto final (FQDN). |
| `www.jotabarber.salonos.app` | `jotabarber` | `subdomain` | Se ignora el `www.` inicial. |
| `foo_bar.salonos.app` | *(cae a env)* | `env` | `_` no es slug válido → no es subdominio. |
| `salonos.app` | *(cae a env)* | `env` | Apex desnudo (≤ 2 etiquetas). |
| `www.salonos.app` | *(cae a env)* | `env` | `www` + apex. |
| `localhost` / `localhost:5173` | *(cae a env/query)* | `env`/`query` | Dev: sin subdominio. |
| `jotabarber.localhost` | *(cae a env/query)* | `env`/`query` | `*.localhost` (túneles/dev). |
| `127.0.0.1` | *(cae a env/query)* | `env`/`query` | IPv4. |
| `::1` | *(cae a env/query)* | `env`/`query` | IPv6. |

> **Sin Public Suffix List.** Para un apex de 3+ niveles (p. ej. `example.co.uk`)
> esta heurística trataría `example` como subdominio. Está **fuera de alcance a
> propósito**: el despliegue es `*.salonos.app`.

---

## 2. Carga de la marca — RPC `get_salon_branding` + bucket `salon-logos`

### La RPC

`fetchSalonBranding(slug)` llama a la RPC **pública** (anon) de Salón OS. Es
`RETURNS TABLE`, así que PostgREST devuelve un **array**:

```ts
const { data, error } = await supabase.rpc('get_salon_branding', { p_slug: slug });
if (error) throw error;                      // red/PostgREST → pantalla de error controlada
const row = Array.isArray(data) ? data[0] : data;
return mapSalonBrandingRow(row ?? null);     // primera fila (o null si []) → shape de la app
```

`data` es `[]` para un slug inexistente/inactivo (→ `data[0] === undefined` →
mapper `null`), o `[{ … }]` con la única fila del salón.

### Mapeo de la fila (puro)

`mapSalonBrandingRow` traduce snake_case → camelCase y **deriva el `salon_id`** del
`id`. Devuelve `null` si no hay fila o —defensivamente— si falta el `id`.

| Fila RPC (`SalonBrandingRow`, snake_case) | `SalonBranding` (camelCase) | Notas |
|---|---|---|
| `id` (uuid) | `id` | **Fuente del `salon_id`** de todas las lecturas "self". |
| `name` | `name` | Nombre comercial. |
| `slug` | `slug` | Slug público. |
| `logo_url` `\| null` | `logoUrl` `\| null` | URL absoluta **o** ruta de objeto en `salon-logos`. |
| `primary_color` (`#rrggbb`) | `primaryColor` | La RPC garantiza un valor por defecto. |
| `secondary_color` `\| null` | `secondaryColor` `\| null` | Acento opcional. |

Ejemplo (valores sintéticos de las pruebas):

```jsonc
// data[0] de get_salon_branding('jotabarber')
{
  "id": "abeef620-4fe3-4b29-a17b-6c51a8284f8f",
  "name": "Jota Barber",
  "slug": "jotabarber",
  "logo_url": "jotabarber/logo.png",   // ruta en el bucket salon-logos
  "primary_color": "#c9a24b",
  "secondary_color": "#1a1712"
}
```

El branding se cachea con react-query (`queryKey: ['salon-branding', slug]`,
`staleTime`/`gcTime: Infinity`, `retry: 1`, `enabled: !!slug`): **estable durante
la sesión**.

### Logo — `resolveSalonLogoUrl`

`logo_url` puede llegar de dos formas; ambas se soportan:

- **URL absoluta** (`http(s):`, `data:`, `blob:`) → se usa **tal cual**.
- **Ruta de objeto** en el bucket **público** `salon-logos` (p. ej.
  `jotabarber/logo.png`) → se construye con
  `supabase.storage.from('salon-logos').getPublicUrl(path)` (se recortan las `/`
  iniciales).

Devuelve `null` si no hay logo → la UI cae limpiamente al wordmark de texto.

### Render de la marca — `<SalonWordmark>`

[`SalonWordmark.tsx`](../src/components/SalonWordmark.tsx) pinta el `<img>` del logo
resuelto y, si **no hay logo** o la imagen **falla al cargar** (404 / URL rota, vía
`onError`), cae al **nombre** del salón como texto. Nunca cablea la marca de un salón
concreto ni arriesga mostrar el logo de otro.

### Efectos de marca en `<SalonProvider>`

Al resolver el branding:

- `document.title = branding.name` (título de la pestaña).
- `meta[name="theme-color"]` ← `branding.primaryColor` (barra del navegador/PWA).
- Se inyectan los overrides de tema (§4) en `document.documentElement`, espejados
  también en los tokens del sidebar (`--sidebar-primary`, `--sidebar-ring`).

Alcance de la marca en la PWA instalada (manifest neutro): ver [`PWA.md`](PWA.md).

---

## 3. Matriz de fallback — nunca un pantallazo en blanco

`<SalonProvider>` cubre cada punto de fallo con una salida **controlada**:

| Orden | Condición | Pantalla / efecto | Recuperación |
|:---:|---|---|---|
| 1 | `slug` no resuelto (`source: 'none'`) | `<SalonError variant="not-found">` | Recargar. |
| 2 | Branding cargando (`isPending`) | `<SalonLoading>` (spinner, `role="status"`) | — (automática). |
| 3 | RPC con error de red/servidor (`isError`) | `<SalonError variant="error">` | `refetch()`. |
| 4 | Slug resuelto pero RPC `[]` (`!data`) | `<SalonError variant="not-found">` | `refetch()`. |
| — | Salón **sin logo** o logo 404 | `<SalonWordmark>` → texto con el nombre | — |
| — | `primary_color` inválido / branding nulo | `resolveBrandTheme` → `null`: **no se toca ninguna variable**; manda el tema por defecto de `index.css` | — |

`resolveBrandTheme` **nunca lanza** ante branding mal formado (cubierto en
[`salon-theme.test.ts`](../src/lib/salon-theme.test.ts)): a lo sumo devuelve `null`
y el tema dorado por defecto queda intacto.

---

## 4. Contraste — WCAG 2.1 AA (texto normal, 4.5:1)

El tema **no asume** claro/oscuro: **mide** el contraste WCAG real y escoge el texto
más legible sobre cada relleno de marca. Todo en [`salon-theme.ts`](../src/lib/salon-theme.ts).

### Del color de marca a los tokens

1. `hexToHsl('#rrggbb')` — mismo patrón `^#[0-9a-fA-F]{6}$` que la `CHECK` de
   `salon_branding.primary_color` (sin 3 dígitos ni alfa de 8). Hex inválido →
   `null` → fallback limpio.
2. `resolveBrandTheme(branding)` re-tinta los tokens de acento reproduciendo las
   relaciones ya calibradas del oro por defecto:

   | Token | Derivación desde el primario | Con oro base `#cc9433` → `38 60% 50%` |
   |---|---|---|
   | `--primary`, `--ring`, `--gold` | el propio primario | `38 60% 50%` |
   | `--gold-light` | S−5, L+15 (tope 92) | `38 55% 65%` |
   | `--gold-dark` | S−10, L−15 | `38 50% 35%` |
   | `--gold-muted` | S/2, L/2 | `38 30% 25%` |
   | `--accent` | S·0.75 (25–65), L−10 (25–55); matiz del **secundario** si es válido | `38 45% 40%` |
   | `--gradient-gold` / `--shadow-gold` | reconstruidos desde el primario | `linear-gradient(135deg, hsl(38 60% 50%), …)` |

   Con `#cc9433` la salida coincide **exactamente** con los valores escritos a mano
   en `index.css`, así que el salón insignia se ve idéntico y cualquier otro hereda
   esas mismas relaciones.

### Elección del texto por contraste real

`contrastRatio(a, b) = (Lclaro + 0.05) / (Loscuro + 0.05)` (WCAG 1.4.3, sobre la
luminancia relativa; rango `[1, 21]`). `readableForeground(color)` compara el color
con los **dos** textos del sistema y elige el de **mayor** contraste (empate → claro):

- claro `LIGHT_TEXT = 40 20% 92%` (espejo de `--foreground`).
- oscuro `DARK_TEXT = 30 10% 6%` (espejo de `--background` / `--primary-foreground`).

Umbral AA de texto normal: `WCAG_AA_TEXT = 4.5`.

### Garantías y ejemplos (fijados en pruebas)

| Marca (primario) | Texto elegido | Contraste `--primary`/`--primary-foreground` | ¿AA? |
|---|---|---|:---:|
| `#cc9433` (oro insignia) | oscuro | ≈ 7.1 | ✅ |
| `#111827` (carbón) | claro (`40 20% 92%`) | ≥ 4.5 | ✅ |
| `#ff0000` (rojo) | — | ≥ 4.5 | ✅ |
| `#2ecc71` (verde) | — | ≥ 4.5 | ✅ |

- **`--primary` / `--primary-foreground`** (relleno de botones/CTA, la superficie que
  **de verdad** lleva texto) **cumple AA** para toda marca representativa.
- **`--accent` / `--accent-foreground`** es un mid-tone **deliberadamente apagado**
  (estados activos sutiles): su texto es **siempre el más legible posible**, aunque
  ese máximo pueda quedar algo por debajo de AA (≈ 4.3 en el acento insignia). Es una
  decisión de diseño consciente; si se re-calibra el acento, revisar esa cifra.
- `assessFillLegibility(hex)` devuelve `{ ratio, meetsAA, text }` para **avisar sin
  bloquear**. Un color problemático se **detecta**: p. ej. el gris medio `#727272`,
  cuyo mejor texto ≈ 4.03 < 4.5 → `meetsAA: false` (no se finge legible).

---

## 5. Probar otra peluquería en local

En `localhost` no hay subdominio (se ignora): la resolución cae a `?salon=` (query)
o a `VITE_SALON_SLUG` (env).

```sh
npm run dev                                   # http://localhost:8080

# (a) Salón por defecto = VITE_SALON_SLUG del .env (p. ej. "denueveanueve")
open http://localhost:8080/

# (b) Otra peluquería: ?salon=<slug> gana al fallback de .env
open http://localhost:8080/?salon=jotabarber

# (c) Verificar el fallback "salón no encontrado": un slug inexistente
open http://localhost:8080/?salon=no-existe

# (d) Simular el subdominio de producción: añade a tu hosts
#     127.0.0.1  jotabarber.salonos.app
#     y entra por http://jotabarber.salonos.app:8080/
```

Recuerda:

- El slug debe **existir y estar activo** en Salón OS (que `get_salon_branding` lo
  devuelva); si no, verás la pantalla **"salón no encontrado"** (comportamiento
  correcto).
- El slug se resuelve **una vez por carga** (`useMemo([])` leyendo
  `window.location.search`) y el branding se cachea toda la sesión: para cambiar de
  salón, **recarga** con otro `?salon=`.
