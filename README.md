# denueveanueve — App de cliente

> Aplicación web (PWA) **white-label** de fidelización y perfil de cliente para
> salones, conectada al backend **Salón OS** sobre Supabase. El salón se resuelve
> en runtime (por subdominio), de modo que la misma app sirve a cualquier salón.

Stack: **Vite · React · TypeScript · @supabase/supabase-js · Tailwind + shadcn/ui**

---

## Qué es

App móvil-first para clientes del salón: alta de cuenta, perfil, y programa de
fidelización (puntos, cupón de bienvenida, recompensas). Originalmente generada
en Lovable, **desde la migración apunta al proyecto Salón OS** (multi-tenant) y
ya **no depende de Lovable** para funcionar.

La app es **multi-salón (white-label)**: el salón se resuelve en runtime
(subdominio del host > `?salon=<slug>` > `VITE_SALON_SLUG`) y su `salon_id` se
**deriva** del branding que devuelve `get_salon_branding` — ya **no** de
`VITE_SALON_ID`. Todas las lecturas "self" del cliente (`customers`,
`loyalty_accounts`, `welcome_coupons`, `rewards`, `points_movements`) se filtran
además por ese `salon_id`, coherente con las FKs compuestas `(id, salon_id)` del
esquema y como defensa en profundidad sobre las RLS.

### Estado por pantalla

| Pantalla | Ruta | Estado |
|---|---|---|
| Bienvenida / Login / Registro | `/`, `/login`, `/register` | ✅ Operativa (Supabase Auth de Salón OS) |
| Home | `/home` | ✅ Operativa |
| Perfil | `/profile` | ✅ Operativa (lee de Salón OS) |
| Fidelización | `/loyalty` | ✅ Operativa (lee de Salón OS) |
| Catálogo de servicios | `/services` | ✅ Operativa |
| **Reservar cita** | `/book` | ⏳ **Próximamente** — sub-fase 3B-2 |
| **Mis citas** | `/appointments` | ⏳ **Próximamente** — sub-fase 3B-2 |
| Club / Premium | `/club`, `/premium` | 🚫 Desactivada (sin backend en Salón OS) |
| Promos | `/promos` | 🚫 Desactivada (sin backend en Salón OS) |
| Admin / API Keys | `/admin/*` | 🚫 Desactivada (sin backend en Salón OS) |

Las pantallas 🚫 se controlan con feature flags en
[`src/config/features.ts`](src/config/features.ts); sus rutas legacy redirigen a
`/home` para no romper enlaces antiguos. Consulta ese archivo para el checklist
de re-activación cuando exista el backend correspondiente.

---

## Multi-salón (white-label): resolución, marca y contraste

Un **único build** sirve a **todos** los salones. Cada salón se identifica por su
**slug** (kebab-case: `jotabarber`, `denueveanueve`) y su marca (nombre, logo,
colores) se resuelve en **runtime**, sin recompilar ni cablear ningún salón. El
`salon_id` (uuid) **se deriva** del branding resuelto — ya **no** de
`VITE_SALON_ID`, que queda deprecada.

Toda la lógica vive en cuatro módulos, tres de ellos **puros** (sin React ni
Supabase, probados en aislamiento):

| Módulo | Responsabilidad | Puro |
|---|---|:---:|
| [`src/lib/salon.ts`](src/lib/salon.ts) | Resuelve el **slug** (prioridad) y mapea la fila de la RPC. | ✅ |
| [`src/lib/salon-branding.ts`](src/lib/salon-branding.ts) | Llama a la RPC `get_salon_branding` y resuelve la URL del logo (bucket `salon-logos`). | — |
| [`src/lib/salon-theme.ts`](src/lib/salon-theme.ts) | Deriva los tokens de tema desde el color de marca, con **contraste WCAG AA**. | ✅ |
| [`src/lib/salon-context.tsx`](src/lib/salon-context.tsx) | `<SalonProvider>` / `useSalon()`: orquesta carga, tema, fallbacks. | — |

`<SalonProvider>` se monta **por encima de las rutas** ([`src/App.tsx`](src/App.tsx)),
de modo que la marca está disponible **antes del login**.

### 1. Cómo se resuelve el salón — `subdominio > ?salon= > env`

`resolveSalonSlug()` ([`salon.ts`](src/lib/salon.ts)) es una función **pura** que
recibe host + URL + fallback y elige el slug por este orden de prioridad estricto,
devolviendo también el **origen** (`source`) del que salió:

| Prioridad | Origen (`source`) | De dónde sale | Ejemplo |
|:---:|---|---|---|
| **1.º** | `subdomain` | Subdominio del host `<slug>.salonos.app` | `jotabarber.salonos.app` → `jotabarber` |
| **2.º** | `query` | Parámetro `?salon=<slug>` de la URL | `localhost:8080/?salon=jotabarber` → `jotabarber` |
| **3.º** | `env` | Fallback de build-time `VITE_SALON_SLUG` | `.env` → `denueveanueve` |
| — | `none` | Ninguna vía resolvió → **pantalla "salón no encontrado"** | — |

Un origen de mayor prioridad **siempre gana**: con subdominio válido, se ignora
`?salon` y `VITE_SALON_SLUG`.

**Reglas de validación y extracción del subdominio** (`salon.ts`):

- Un **slug** válido es kebab-case en minúsculas (`^[a-z0-9]+(?:-[a-z0-9]+)*$`),
  de ≤ 63 caracteres — la **misma** convención que la `CHECK` de `salons.slug` y
  que una etiqueta DNS. `?salon` y `VITE_SALON_SLUG` se **normalizan** (recorte de
  espacios + minúsculas) antes de validar; un valor vacío o inválido **cae** al
  siguiente nivel de prioridad.
- El **subdominio** se extrae asumiendo un dominio raíz de **dos etiquetas**
  (`salonos.app`): un host con > 2 etiquetas tiene subdominio (la primera). Se
  **ignoran** (→ sin subdominio, se cae a `?salon`/env): `localhost` y
  `*.localhost`, IPs **v4 y v6**, un `www.` inicial (`www.jotabarber.salonos.app`
  → `jotabarber`; `www.salonos.app` → apex) y el **apex desnudo** (`salonos.app`).
  Se toleran puerto (`:8080`) y punto final de FQDN (`salonos.app.`).

> No se usa la Public Suffix List: para un apex de 3+ niveles (p. ej.
> `example.co.uk`) la heurística trataría `example` como subdominio. Está **fuera de
> alcance a propósito**, porque el despliegue es `*.salonos.app`.

### 2. Cómo se carga la marca — `get_salon_branding` + bucket `salon-logos`

`fetchSalonBranding(slug)` ([`salon-branding.ts`](src/lib/salon-branding.ts)) llama
a la RPC **pública** (anon) de Salón OS:

```ts
const { data, error } = await supabase.rpc('get_salon_branding', { p_slug: slug });
```

La RPC es `RETURNS TABLE`, así que `data` llega como **array**: `[]` cuando el
slug no existe / el salón está inactivo, o `[{ id, name, slug, logo_url,
primary_color, secondary_color }]`. Se toma la **primera fila** y se normaliza a
camelCase con el mapper puro `mapSalonBrandingRow` (`salon.ts`), que devuelve
`null` si no hay fila (o, defensivamente, si falta el `id`):

```ts
interface SalonBranding {
  id: string;              // salons.id → de aquí se DERIVA el salon_id de todas las lecturas
  name: string;            // nombre comercial
  slug: string;            // slug público (kebab)
  logoUrl: string | null;  // URL o ruta del logo, o null
  primaryColor: string;    // #rrggbb (la RPC garantiza un valor por defecto)
  secondaryColor: string | null; // #rrggbb o null
}
```

El branding se cachea con react-query (`queryKey: ['salon-branding', slug]`,
`staleTime`/`gcTime: Infinity`): es **estable durante la sesión**.

**Logo — bucket `salon-logos`.** `resolveSalonLogoUrl(logoUrl)`
([`salon-branding.ts`](src/lib/salon-branding.ts)) admite las dos formas en que
puede llegar `logo_url`:

- **URL absoluta** (`http(s):`, `data:`, `blob:`) → se usa **tal cual**.
- **Ruta de objeto** dentro del bucket público `salon-logos` (p. ej.
  `jotabarber/logo.png`) → se construye su URL pública con
  `supabase.storage.from('salon-logos').getPublicUrl(path)`.

Devuelve `null` si no hay logo. `<SalonWordmark>`
([`src/components/SalonWordmark.tsx`](src/components/SalonWordmark.tsx)) pinta el
`<img>` del logo y, si **no hay logo o la imagen falla al cargar** (404 / URL
rota, vía `onError`), **cae al nombre del salón** como wordmark de texto. Nunca
cablea la marca de un salón concreto ni muestra el logo de otro.

Al resolver el branding, `<SalonProvider>` además titula la pestaña
(`document.title = name`) y alinea la barra del navegador/PWA
(`meta[name="theme-color"]` ← `primary_color`). Ver [`docs/PWA.md`](docs/PWA.md)
para el alcance de la marca en la PWA.

### 3. El fallback — nunca un pantallazo en blanco

Cada punto de fallo tiene una salida **controlada** (definidas en
[`salon-context.tsx`](src/lib/salon-context.tsx) y
[`salon-theme.ts`](src/lib/salon-theme.ts)):

| Situación | Resultado |
|---|---|
| No se resuelve ningún slug (`source: 'none'`) | Pantalla **"salón no encontrado"** (recargable). |
| Slug resuelto pero la RPC devuelve `[]` (inexistente/inactivo) | Pantalla **"salón no encontrado"** (reintentable). |
| La RPC falla (red/servidor) | Pantalla de **error de conexión**, reintentable (`refetch`). |
| Cargando el branding | Pantalla de **carga** (spinner, `aria-live`). |
| Salón **sin logo** o logo roto (404) | Wordmark de **texto** con el nombre del salón. |
| `primary_color` inválido / branding nulo | `resolveBrandTheme` → `null` ⇒ **no se toca ninguna variable** y manda el **tema dorado por defecto** de `index.css`. |

La derivación del tema **nunca lanza** ante un branding mal formado: a lo sumo
devuelve `null` y el tema por defecto queda intacto (sin regresión ni crash).

### 4. Criterio de contraste — WCAG 2.1 AA (texto normal, 4.5:1)

El tema white-label **no asume** texto claro u oscuro sobre la marca: lo **elige
midiendo el contraste WCAG real**. En [`salon-theme.ts`](src/lib/salon-theme.ts):

- El color de marca `#rrggbb` (mismo patrón `^#[0-9a-fA-F]{6}$` que la `CHECK` de
  `salon_branding.primary_color`; sin atajo de 3 dígitos ni alfa) se convierte a
  HSL y alimenta los tokens de acento (`--primary`, `--ring`, la familia
  `--gold`, `--accent`, gradiente y sombra), **re-tintando** las relaciones ya
  calibradas del tema dorado por defecto (con el oro base `#cc9433` la salida
  coincide **exactamente** con `index.css`).
- Para el **texto sobre el relleno**, `readableForeground()` calcula la **razón de
  contraste** (fórmula WCAG 1.4.3, `(L1+0.05)/(L2+0.05)` sobre la luminancia
  relativa) entre el color y los **dos** textos del sistema —claro `40 20% 92%` /
  oscuro `30 10% 6%`— y escoge el de **mayor** contraste. Umbral AA:
  `WCAG_AA_TEXT = 4.5`.

Garantías (fijadas en [`salon-theme.test.ts`](src/lib/salon-theme.test.ts)):

- **`--primary` / `--primary-foreground`** (relleno de botones/CTA, la superficie
  que realmente lleva texto) **cumple AA** (≥ 4.5:1) para toda marca representativa.
- **`--accent` / `--accent-foreground`** es un mid-tone **deliberadamente apagado**
  para estados activos sutiles: su texto es **siempre el más legible posible**,
  aunque ese máximo pueda quedar algo por debajo de AA (≈ 4.3) en el acento
  insignia. La superficie de CTA sí cumple holgado (≈ 7.1).
- `assessFillLegibility(hex)` expone `ratio` + `meetsAA` para **avisar sin
  bloquear**: un color problemático (p. ej. un gris medio cuyo mejor texto ≈ 4.03)
  se **detecta** como no-AA en vez de fingir legibilidad.

### 5. Probar otra peluquería en local — `?salon=<slug>`

En `localhost` **no hay subdominio** (se ignora), así que la resolución cae a
`?salon=<slug>` (2.ª prioridad) o a `VITE_SALON_SLUG` (3.ª):

```sh
npm run dev
# Por defecto sirve el salón de VITE_SALON_SLUG (.env), p. ej. "denueveanueve":
#   http://localhost:8080/

# Para probar OTRA peluquería, añade ?salon=<slug> (gana al fallback de .env):
#   http://localhost:8080/?salon=jotabarber
```

Notas:

- El slug debe **existir y estar activo** en Salón OS (que `get_salon_branding` lo
  devuelva). Un slug inexistente muestra la pantalla **"salón no encontrado"** —
  que es, precisamente, el comportamiento white-label correcto a verificar.
- El slug se resuelve **una vez por carga** (al montar `<SalonProvider>`, leyendo
  `window.location.search`), y el branding se cachea toda la sesión. Mantén el
  `?salon=` en la **carga inicial**; para cambiar de salón, recarga con otro valor.
- Para simular el subdominio real de producción, mapea
  `jotabarber.salonos.app → 127.0.0.1` en tu `hosts` y entra por ahí; para el día
  a día, `?salon=` es lo más simple.

> Referencia ampliada (heurística del subdominio, matriz de fallback y cálculo del
> contraste con ejemplos): [`docs/WHITE-LABEL.md`](docs/WHITE-LABEL.md).

---

## Requisitos

- **Node.js 18+** y **npm** (o [bun](https://bun.sh), hay `bun.lock` en el repo).
- Acceso al proyecto Supabase de **Salón OS** (URL + anon/publishable key). El
  salón se resuelve en runtime por subdominio; en local se fija con
  `VITE_SALON_SLUG` (fallback) o `?salon=<slug>`.

---

## Configuración (`.env`)

Copia la plantilla y rellena los valores. **Nunca subas el `.env` real** (está en
`.gitignore`; sólo se versiona `.env.example`).

```sh
cp .env.example .env
```

### Variables del cliente (bundle del navegador — prefijo `VITE_`)

| Variable | Obligatoria | Descripción |
|---|:---:|---|
| `VITE_SUPABASE_URL` | ✅ | URL del proyecto Salón OS (p. ej. `https://jztoyekixcziaicrnlce.supabase.co`). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Anon / publishable key de Supabase (pública). |
| `VITE_SUPABASE_PROJECT_ID` | — | ID del proyecto (informativo). |
| `VITE_SALON_SLUG` | — | **Fallback** del slug cuando el host no trae subdominio ni `?salon` (p. ej. en local). El salón real se resuelve en runtime. |
| ~~`VITE_SALON_ID`~~ | — | **Deprecada.** Ya no es fuente de verdad: `salon_id` se deriva del branding en runtime. Puede eliminarse. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | Sólo si se re-activan las suscripciones (Club/Premium). |

> **Arranque estricto.** Si falta `VITE_SUPABASE_URL` o
> `VITE_SUPABASE_PUBLISHABLE_KEY`, la app lanza un error claro al iniciar en lugar
> de fallar en silencio. Si no se resuelve ningún salón (sin subdominio, sin
> `?salon` y sin `VITE_SALON_SLUG`), `<SalonProvider>` muestra una pantalla
> controlada de "salón no encontrado". Ver
> [`src/integrations/supabase/client.ts`](src/integrations/supabase/client.ts) y
> [`src/lib/salon-context.tsx`](src/lib/salon-context.tsx).

### Variables de servidor (Edge Functions — **NUNCA** en el bundle del cliente)

`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_API_TOKEN`,
`API_KEY_APP_DENUEVEANUEVE`. Sólo se usan del lado servidor; no llevan prefijo
`VITE_` para que Vite no las incluya en el bundle.

---

## Puesta en marcha

```sh
npm install        # instala dependencias
npm run dev        # servidor de desarrollo con recarga (http://localhost:8080)
npm run build      # build de producción en dist/
npm run preview    # sirve el build de producción localmente
npm run lint       # ESLint
npm test           # Vitest (una pasada)
npm run test:watch # Vitest en modo watch
```

---

## White-label: resolución del salón, marca y tema

Un **único build** sirve a **cualquier salón**. En cada carga la app resuelve *qué*
salón mostrar, carga su marca desde Salón OS y re-tinta el tema con sus colores —
todo **en runtime**, sin recompilar y sin cablear ningún salón concreto. Cuatro
módulos, con su parte pura probada en aislamiento:

| Módulo | Responsabilidad | Puro (test) |
|---|---|:---:|
| [`src/lib/salon.ts`](src/lib/salon.ts) | Resuelve el slug (prioridad) y mapea la fila de branding | ✅ `salon.test.ts` |
| [`src/lib/salon-branding.ts`](src/lib/salon-branding.ts) | Llama a la RPC `get_salon_branding` y resuelve la URL del logo | — (Supabase) |
| [`src/lib/salon-theme.ts`](src/lib/salon-theme.ts) | Deriva los tokens del tema y elige el texto por **contraste WCAG** | ✅ `salon-theme.test.ts` |
| [`src/lib/salon-context.tsx`](src/lib/salon-context.tsx) | `<SalonProvider>` / `useSalon()`: orquesta carga, estados y aplica el tema | — (React) |

`<SalonProvider>` se monta **por encima de las rutas** (ver `App.tsx`), de modo que
el salón y su tema están disponibles **antes del login**.

### 1. Cómo se resuelve el salón (subdominio > `?salon=` > env)

`resolveSalonSlug()` —función **PURA** en [`src/lib/salon.ts`](src/lib/salon.ts)— elige
el slug por este **orden de prioridad**, y se detiene en la primera vía que resuelve:

1. **Subdominio del host** — `jotabarber.salonos.app` → `jotabarber`. Es la vía de
   **producción**. Heurística de apex de **dos etiquetas** (`salonos.app`): un host con
   > 2 etiquetas tiene subdominio (la primera). Se ignora un `www` inicial, `localhost`,
   `*.localhost`, las IPs (v4/v6) y el apex desnudo; la etiqueta debe ser un slug
   **kebab** válido (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 63 car.) o cae a la siguiente vía.
2. **Parámetro `?salon=<slug>`** — p. ej. `?salon=jotabarber`. Pensado para
   **local / preview** (ver [§5](#5-probar-otra-peluquería-en-local-con-salonslug)). Se
   normaliza (minúsculas + `trim`) y se valida como slug.
3. **`VITE_SALON_SLUG`** (fallback de *build-time*) — **sólo** cuando el host no trae
   subdominio **y** no hay `?salon`.

Si **ninguna** vía resuelve un slug → `{ slug: null, source: 'none' }` → el proveedor
pinta la pantalla controlada **"salón no encontrado"** (nunca un pantallazo en blanco).

Ejemplos (fijados en `salon.test.ts`):

| `hostname` | `?salon` | `VITE_SALON_SLUG` | → slug | fuente |
|---|---|---|---|---|
| `jotabarber.salonos.app` | `otro` | `denueveanueve` | `jotabarber` | `subdomain` |
| `www.jotabarber.salonos.app` | — | — | `jotabarber` | `subdomain` |
| `salonos.app` (apex) | — | `denueveanueve` | `denueveanueve` | `env` |
| `localhost` | `barbershop` | `denueveanueve` | `barbershop` | `query` |
| `localhost:8080` | — | `denueveanueve` | `denueveanueve` | `env` |
| `localhost` | — | — | `null` | `none` → **not-found** |

> El `salon_id` de todas las lecturas "self" del cliente se **deriva** del branding
> resuelto (`useSalon().id`), **no** de `VITE_SALON_ID` (deprecada).

### 2. Cómo se carga la marca — RPC `get_salon_branding` + bucket `salon-logos`

Con el slug resuelto, `<SalonProvider>` carga el branding con **react-query** llamando
a la RPC **pública** (anon) de Salón OS a través de
[`fetchSalonBranding()`](src/lib/salon-branding.ts):

```ts
supabase.rpc('get_salon_branding', { p_slug: slug })
// RETURNS TABLE → data llega como array:
//   []                       → slug inexistente o salón inactivo  → branding null
//   [{ id, name, slug, logo_url, primary_color, secondary_color }] → se toma data[0]
```

La fila (snake_case) se normaliza a camelCase con el mapper puro `mapSalonBrandingRow()`
(`{ id, name, slug, logoUrl, primaryColor, secondaryColor }`). De `branding.id` se
**deriva el `salon_id`**. El branding se cachea toda la sesión
(`staleTime: Infinity`, `gcTime: Infinity`, `retry: 1`).

**Logo — bucket público `salon-logos`.** `resolveSalonLogoUrl(logoUrl)`
([`src/lib/salon-branding.ts`](src/lib/salon-branding.ts)) acepta dos formas y devuelve
`null` si no hay logo:

- **URL absoluta** (`http(s):`, `data:`, `blob:`) → se usa **tal cual**.
- **Ruta de objeto** dentro del bucket público `salon-logos` (p. ej. `jotabarber/logo.png`)
  → se construye la URL pública con `supabase.storage.from('salon-logos').getPublicUrl(path)`.

El componente [`SalonWordmark`](src/components/SalonWordmark.tsx) pinta el `<img>` del
logo o, si **no hay logo** o la imagen **falla al cargar** (404 / URL rota), cae limpiamente
al **wordmark de texto** con el **nombre** del salón. Nunca crashea ni muestra el logo de
otro salón. Además, `<SalonProvider>` titula la **pestaña** con el nombre del salón y
alinea la meta `theme-color` (barra del navegador/PWA) con su color de marca.

### 3. Fallback — estados siempre controlados

Cada punto de fallo degrada de forma limpia; nunca hay pantallazo en blanco ni marca
cruzada entre salones:

| Situación | Comportamiento |
|---|---|
| No se resuelve ningún slug (sin subdominio, sin `?salon`, sin `VITE_SALON_SLUG`) | Pantalla **"salón no encontrado"** (recargable). |
| La RPC falla (red/servidor) | Pantalla **"error de conexión"** con botón **reintentar** (`refetch`). |
| Slug resuelto pero la RPC devuelve `[]` (inexistente/inactivo) | Pantalla **"salón no encontrado"**. |
| Branding sin logo, o `<img>` con error | **Wordmark** de texto con el nombre del salón. |
| `primary_color` no es un `#rrggbb` válido | `resolveBrandTheme` → `null` ⇒ **no** se toca ninguna variable ⇒ manda el **tema dorado por defecto** de `index.css`. |
| Falta `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Error claro **al arrancar** (no fallo silencioso). Ver `client.ts`. |

### 4. Criterio de contraste WCAG AA

El tema se **re-tinta** desde `primaryColor`: el primario alimenta botones, anillo de
foco y toda la familia dorada (`--gold*`, gradiente y sombra), y el acento sutil toma el
matiz del secundario (o del primario). La derivación completa está en
[`src/lib/salon-theme.ts`](src/lib/salon-theme.ts) (`resolveBrandTheme`), reproduciendo
las relaciones ya calibradas del tema por defecto (re-tinta, no reescribe la UI).

El punto **accesible** es el **color de texto sobre el relleno de marca** (botones,
estados activos → `--primary-foreground` / `--accent-foreground`), que se elige por
**contraste WCAG 2.1 REAL**, no asumiendo claro/oscuro:

- **Umbral:** AA para **texto normal = 4.5:1** (`WCAG_AA_TEXT`).
- La app mide el **contraste** de dos candidatos del sistema —texto claro "hueso"
  (`40 20% 92%`) y oscuro casi negro (`30 10% 6%`)— contra el color de marca y elige el
  de **mayor** contraste (empate ⇒ claro). Así una marca **clara** recibe texto **oscuro**
  y una **oscura** recibe texto **claro**: un botón nunca queda con texto ilegible.
- El contraste usa la **luminancia relativa** de WCAG §1.4.3: `(L1 + 0.05) / (L2 + 0.05)`,
  el más claro sobre el más oscuro, en `[1, 21]`.
- `assessFillLegibility(hex)` expone `{ ratio, meetsAA, text }` para que la UI pueda
  **avisar sin bloquear** cuando `ratio < 4.5:1`: aun por debajo del umbral, ya se pinta el
  texto de **máximo contraste** posible.

Ejemplos (fijados en `salon-theme.test.ts`):

| Color de marca (relleno) | Texto elegido | ¿AA? |
|---|---|:---:|
| `#ffe000` (amarillo brillante) | **oscuro** | ✅ |
| `#2a1a5e` (índigo profundo) | **claro** | ✅ |
| `#c8a97e` (oro insignia actual) | **oscuro** | ✅ |

### 5. Probar otra peluquería en local con `?salon=<slug>`

En local el host es `localhost` (sin subdominio usable), así que el salón se toma del
parámetro **`?salon=`**, que **gana** a `VITE_SALON_SLUG`. No hace falta tocar el `.env`:

```sh
npm run dev
# luego abre en el navegador:
#   http://localhost:8080/?salon=jotabarber
```

- `?salon=<slug>` **sobrescribe** `VITE_SALON_SLUG` para esa carga → ves el nombre, el
  logo y los colores **de ese salón** al instante.
- El slug debe **existir y estar activo** en Salón OS (la RPC debe devolver fila); si no,
  sale la pantalla **"salón no encontrado"** — que es el comportamiento correcto y una
  buena forma de probarla (p. ej. `http://localhost:8080/?salon=no-existe`).
- El branding se **cachea** durante la sesión (`staleTime: Infinity`): para cambiar de
  salón, cambia el parámetro y **recarga**.
- El camino por **subdominio** (`<slug>.salonos.app`) es **sólo de producción**;
  `*.localhost` y las IPs se ignoran a propósito, así que **en local usa siempre `?salon=`**.
- Sin `?salon` y con `VITE_SALON_SLUG=denueveanueve`, el local arranca por defecto en el
  salón insignia (fuente `env`).

---

## Backend: Salón OS

La app se conecta a **Supabase Auth** y a las tablas de Salón OS. La
autenticación es **email + contraseña** con sesión persistente en `localStorage`
(`persistSession: true`, `autoRefreshToken: true`).

- El listener `onAuthStateChange` se registra de forma síncrona **antes** de pedir
  la sesión inicial y sin llamadas async a Supabase dentro del callback (evita el
  deadlock conocido del cliente de auth). Ver
  [`src/lib/auth.tsx`](src/lib/auth.tsx).
- El alta (`signUp`) escribe en `raw_user_meta_data` los metadatos que el trigger
  `handle_new_user` de Salón OS espera (`first_name`, `last_name`, `phone`,
  `date_of_birth`, `consent_marketing`, `consent_whatsapp`), y ese trigger crea la
  ficha base en `public.customers`.

---

## Registro de clientes — enlace por teléfono vía RPC

El registro ([`src/pages/Register.tsx`](src/pages/Register.tsx)) enlaza la cuenta
de Auth con la ficha de cliente **a través del teléfono**, usando la RPC
`register_my_customer_account` de Salón OS. El flujo tiene 3 pasos:

1. **Alta en Supabase Auth** (`signUp` con email + contraseña y metadatos). El
   trigger `handle_new_user` crea la ficha base del cliente. Ya **no** hay
   pre-check manual de email/teléfono: la unicidad y el enlace los resuelve la RPC
   del paso 3 de forma atómica (sin condición de carrera).
2. **Comprobación de sesión.** La RPC necesita una sesión activa (se ejecuta con
   `auth.uid()`). Si el proyecto exige confirmación de correo, todavía no hay
   sesión: se informa al usuario ("revisa tu correo") y **el enlace se aplaza al
   primer inicio de sesión**.
3. **Enlace por teléfono** vía RPC:

   ```ts
   const { data, error } = await supabase.rpc('register_my_customer_account', {
     p_salon_id: salonId,    // derivado del salón en runtime (useSalon().id)
     p_phone: phone,
     p_full_name: fullName,
     p_email: email,
   });
   ```

   Desenlaces posibles (todos son éxito para el usuario):

   | `outcome` | Significado |
   |---|---|
   | `created` | Se creó la cuenta de cliente para este teléfono. |
   | `linked` | Se enlazó una ficha existente creada por el salón. |
   | `already_linked` | El teléfono ya estaba enlazado a esta cuenta. |

   Errores (la RPC lanza `EXCEPTION` con SQLSTATE `P0001`), mapeados a claves i18n
   por `mapRegisterError` en [`src/lib/auth.tsx`](src/lib/auth.tsx):

   | Mensaje | Causa | Mensaje al usuario |
   |---|---|---|
   | `INVALID_PHONE` | El teléfono no tiene un formato válido. | "El número de teléfono no es válido." |
   | `PHONE_CONFLICT` | El teléfono ya pertenece a otra cuenta/ficha. | "Este teléfono ya está vinculado a otra cuenta." |
   | `FEATURE_NOT_ENABLED` | El salón **no tiene contratado** el add-on de app de cliente/fidelización (gating autoritativo en servidor). | "Esta peluquería no tiene contratado este servicio…" |

   El gating de `FEATURE_NOT_ENABLED` es **autoritativo en el servidor**: la app
   sólo traduce el motivo a un mensaje claro (`auth.error.featureNotEnabled`),
   **sin** sortearlo ni conceder acceso al cliente.

### ⚠️ Nota: OTP pendiente

Hoy el enlace por teléfono **se confía sin verificar** que el teléfono pertenece
realmente a quien se registra. Está pendiente (marcado con `TODO(OTP)` en
`Register.tsx`) **verificar el teléfono por SMS (OTP) antes de confiar en el
enlace**, para impedir que alguien reclame la ficha de otra persona registrándose
con un teléfono ajeno. Es trabajo de una fase posterior.

---

## Reservas y citas — diferidas a la sub-fase 3B-2

La gestión de reservas está **fuera del alcance de la fase de migración actual**.
Las rutas `/book` y `/appointments` renderizan un estado **"Próximamente"**
([`PlaceholderPage`](src/pages/PlaceholderPage.tsx)) para que el build quede verde
contra el nuevo esquema de Salón OS.

Los flujos originales se conservan **verbatim** en
[`src/pages/_deferred/reservations-3B-2/`](src/pages/_deferred/reservations-3B-2/):

- `BookAppointment.tsx` — flujo multi-paso (ubicación → sección → servicios →
  personal → fecha/hora → confirmar, con comprobación de disponibilidad y sync con
  Google Calendar).
- `Appointments.tsx` — pestañas de próximas/historial, realtime, cancelar y
  reprogramar (`RescheduleDialog.tsx`), sobre las tablas legacy `appointments` /
  `appointment_services`.
- `ServiceCatalog.tsx` — versión con selección para reserva.

Se **re-integrarán con el motor de reservas de Salón OS en la sub-fase 3B-2**.
Detalles en el [README de esa carpeta](src/pages/_deferred/reservations-3B-2/README.md).

---

## Estructura del proyecto

```
src/
├── App.tsx                         # rutas (React Router) + feature flags
├── config/features.ts              # flags de capacidades gated en Salón OS
├── integrations/supabase/
│   ├── client.ts                   # cliente Supabase (lee VITE_SUPABASE_*)
│   └── types.ts                    # tipos generados del esquema Salón OS
├── lib/
│   ├── auth.tsx                    # AuthProvider + mapeo de errores (auth y RPC)
│   ├── salon.ts                    # resolución PURA del slug + mapper de branding
│   ├── salon-branding.ts           # fetchSalonBranding (RPC) + logo (bucket salon-logos)
│   ├── salon-theme.ts              # tema white-label PURO + contraste WCAG AA
│   ├── salon-context.tsx           # <SalonProvider> / useSalon() (salon_id runtime)
│   └── i18n.tsx                    # traducciones
├── pages/
│   ├── Register.tsx                # alta + enlace por teléfono vía RPC
│   ├── Home.tsx / Profile.tsx / Loyalty.tsx  # pantallas operativas
│   ├── BookAppointment.tsx / Appointments.tsx # "Próximamente" (3B-2)
│   └── _deferred/reservations-3B-2/           # flujos de reservas conservados
└── components/                     # UI (shadcn/ui), navegación, guards
```

---

## PWA (white-label)

La app es instalable (PWA) vía [`vite-plugin-pwa`](vite.config.ts). El **color de
la barra** del navegador/PWA **sí** sigue a la marca del salón en runtime (meta
`theme-color`, fijada por `<SalonProvider>`). En cambio, el **nombre y el icono**
del manifest son **build-time** y, con un único build multi-salón, se sirven
**neutros** (no por-salón). Opciones para marca completa por salón (build por
salón o manifest dinámico en servidor) y el detalle de la limitación:
[`docs/PWA.md`](docs/PWA.md).

## Despliegue

Build estático (`npm run build` → `dist/`) desplegable en cualquier hosting de
estáticos (Vercel, Netlify, etc.). Recuerda definir las variables `VITE_*` en el
entorno del proveedor antes de construir; se inyectan **en tiempo de build**, no
en runtime.
