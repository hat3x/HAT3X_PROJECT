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
| Catálogo de servicios | `/services` | ✅ Operativa (catálogo público de Salón OS) |
| **Reservar cita** | `/book` | ✅ Operativa (API pública de reserva de Salón OS) |
| **Mis citas** | `/appointments` | ✅ Operativa · lectura *self* — *depende de una política RLS/RPC self en el servidor (ver [limitación pendiente](#reservas-y-mis-citas--api-pública-de-salón-os))* |
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
| `VITE_SALON_OS_API_URL` | ✅¹ | Origen (scheme + host, **sin barra final**) del despliegue de Salón OS que sirve la **API pública de reserva** (`{base}/api/public/booking/{slug}`). Es **build-time** y **común a todo el despliegue** (no depende del salón). Producción: `https://app.salonos.app`; en local: `http://localhost:3000`; desde el móvil, la **IP de red** del PC (no `localhost`). Detalle: [Reservas y «Mis Citas»](#reservas-y-mis-citas--api-pública-de-salón-os). |
| ~~`VITE_SALON_ID`~~ | — | **Deprecada.** Ya no es fuente de verdad: `salon_id` se deriva del branding en runtime. Puede eliminarse. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | Sólo si se re-activan las suscripciones (Club/Premium). |

> ¹ **Obligatoria para reservar.** `/book` la exige: si falta, la pantalla lanza
> `SalonOsConfigError` con un mensaje claro (capturado por el `<ErrorBoundary>`), no
> falla en silencio. `/appointments` la usa sólo para **enriquecer** los nombres de
> servicio/profesional de forma **no bloqueante**: sin ella, las citas se listan igual
> (sin esos nombres). El resto de la app (perfil, fidelización) no depende de ella.

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
`register_my_customer_account` de Salón OS. Desde la implementación del **OTP de
teléfono**, el enlace por RPC se ejecuta **sólo tras verificar el teléfono por SMS**
(detalle, requisitos de proveedor y pruebas en
[Verificación de teléfono por SMS (OTP)](#verificación-de-teléfono-por-sms-otp)). El
flujo es:

1. **Alta en Supabase Auth** (`signUp` con email + contraseña y metadatos). El
   trigger `handle_new_user` crea la ficha base del cliente. Ya **no** hay
   pre-check manual de email/teléfono: la unicidad y el enlace los resuelve la RPC
   del paso 4 de forma atómica (sin condición de carrera).
2. **Comprobación de sesión.** La RPC necesita una sesión activa (se ejecuta con
   `auth.uid()`). Si el proyecto exige confirmación de correo, todavía no hay
   sesión: se informa al usuario ("revisa tu correo") y **el enlace se aplaza al
   primer inicio de sesión**.
3. **Verificación de teléfono por SMS (OTP)** — con la sesión activa, se normaliza el
   teléfono a E.164 y se **verifica por SMS antes** de confiar en el enlace
   ([`PhoneOtpStep`](src/components/PhoneOtpStep.tsx)). El SMS lo **envía Supabase
   Auth** (`updateUser({ phone })` → `verifyOtp({ type: 'phone_change' })`), no la app.
   Sólo si el teléfono queda verificado se ejecuta el paso 4. Detalle completo, el
   **paso humano** de configurar Twilio y cómo probarlo:
   [Verificación de teléfono por SMS (OTP)](#verificación-de-teléfono-por-sms-otp).
4. **Enlace por teléfono** vía RPC (**sólo tras el OTP correcto**):

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

---

## Verificación de teléfono por SMS (OTP)

> **Estado: implementado ✅.** Sustituye a la antigua nota *«OTP pendiente»*. El enlace
> de la ficha por teléfono **ya no se confía a ciegas**: el teléfono se **verifica por
> SMS antes** de llamar a la RPC de enlace, cerrando (en cliente) el riesgo de que
> alguien reclame la ficha de otra persona registrándose con un teléfono ajeno.
> Diseño y punto de inserción:
> [`docs/AUDITORIA-sub1-flujo-auth-verificacion-telefono.md`](docs/AUDITORIA-sub1-flujo-auth-verificacion-telefono.md).

### El SMS lo envía **Supabase Auth** (no esta app, no Salón OS)

El código de verificación lo **envía Supabase Auth** (GoTrue). Esta app **no** manda
ningún SMS por su cuenta: sólo invoca tres métodos del cliente de Auth. La capa con
efectos está en [`src/lib/phone-verification.ts`](src/lib/phone-verification.ts) y la
lógica **pura** (normalización E.164, cooldown de reenvío, mapeo de errores, saneo del
código) en [`src/lib/otp.ts`](src/lib/otp.ts):

| Acción de la app | Llamada a Supabase Auth | Qué hace Supabase |
|---|---|---|
| **Enviar** el código | `supabase.auth.updateUser({ phone })` | Deja el teléfono como `new_phone` pendiente y **envía el SMS**. |
| **Reenviar** el código | `supabase.auth.resend({ type: 'phone_change', phone })` | Reenvía el SMS del cambio de teléfono en curso. |
| **Confirmar** el código | `supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })` | Sella `auth.users.phone_confirmed_at` **sin** cambiar `auth.uid()`. |

> **Mecanismo inamovible — `type: 'phone_change'`, nunca `'sms'`.** El usuario ya tiene
> sesión email+contraseña; añadir el teléfono a **esa misma identidad** es un *cambio de
> teléfono*. Usar `signInWithOtp` / `type: 'sms'` crearía una **identidad de teléfono
> nueva**, re-apuntaría `auth.uid()` y rompería login, fidelización y reservas. Ver el
> encabezado de [`phone-verification.ts`](src/lib/phone-verification.ts) y la auditoría §9.

### ⚙️ Paso HUMANO (no de código): activar **Twilio** como proveedor *Phone* en Supabase

> **Esto no se configura en este repositorio.** [`supabase/config.toml`](supabase/config.toml)
> sólo contiene el `project_id`; **no hay** (ni debe haber) credenciales de SMS en el
> código. Para que Supabase Auth pueda enviar el SMS, alguien con acceso al proyecto debe
> **activar y configurar un proveedor de SMS (Twilio) en el panel de Supabase**. Es un
> paso de **consola, manual y por única vez** (implica coste por SMS en Twilio).

Pasos en el **Supabase Dashboard** del proyecto de **Salón OS**:

1. **Authentication → Providers → Phone** *(según la versión del panel puede aparecer
   como **Authentication → Sign In / Providers → Phone**)*.
2. **Activa** el proveedor *Phone* y marca **«Enable phone confirmations»**.
3. En **SMS provider** elige **Twilio** y rellena las credenciales de tu cuenta Twilio:
   - **Account SID**
   - **Auth Token**
   - **Message Service SID** *(o el número/`From` de Twilio)*
4. *(Opcional pero recomendado)* Revisa la **longitud del código** (la app espera
   **6 dígitos**), la **caducidad**, la **plantilla del SMS** (`Your code is {{ .Code }}`)
   y los **rate limits** de SMS (**Authentication → Rate Limits**; Supabase limita los
   SMS/hora por defecto).
5. **Guarda.** No hay que desplegar nada en esta app: el cambio vive en el servidor de Auth.

**Si el proveedor NO está configurado, la app no se rompe:** detecta el error de
configuración y muestra un **mensaje honesto** (clave `auth.error.otpProviderUnavailable`:
*«el envío de SMS todavía no está activado en esta peluquería; puedes continuar sin
verificar…»*) con la salida **«Continuar sin verificar»** —siempre que el servidor no
**exija** la verificación (ver el gating del paso 6 más abajo).

### El flujo, paso a paso

Todo se orquesta en [`src/pages/Register.tsx`](src/pages/Register.tsx), con el paso de UI
en [`src/components/PhoneOtpStep.tsx`](src/components/PhoneOtpStep.tsx):

1. **Formulario** → `signUp(email, password, metadata)` crea la cuenta de Auth (y, vía
   trigger, la ficha base). Se guarda el teléfono tecleado en `user_metadata`.
2. **Sesión.** Con sesión activa (`auth.uid()` disponible) se pasa al OTP. *Rama «revisa
   tu correo»:* si el proyecto exige confirmar el email, todavía **no hay sesión** →
   aviso y `/login`; la verificación se retomará más tarde (ver paso 7).
3. **Envío del SMS (Supabase Auth).** Al entrar en el paso de verificación, `PhoneOtpStep`
   normaliza el teléfono a **E.164** y llama a `updateUser({ phone })`; Supabase **envía el
   código** al móvil.
4. **Introducir el código.** Campo de **6 dígitos** que **auto-verifica** al completarse
   (`verifyOtp({ type: 'phone_change' })`). Incluye **reenviar** con espera anti-spam
   (**cooldown 60 s** con cuenta atrás `m:ss`), **cambiar número** y **errores legibles**
   (código incorrecto/caducado, demasiados intentos, fallo de envío…).
5. **Teléfono verificado** (`phone_confirmed_at` sellado) → `finishRegistration` llama a la
   RPC `register_my_customer_account` y navega a `/home` (toast de bienvenida / ficha
   vinculada).
6. **Gating del servidor.** Si la RPC responde `PHONE_NOT_VERIFIED` (el servidor **exige**
   el teléfono verificado), la app **reabre** la verificación con un aviso de *«verificación
   obligatoria»*, **reenvía un código nuevo** y **retira** la salida «continuar sin verificar»
   para no crear un bucle. Sin callejón sin salida.
7. **Reanudación de un registro a medias.** Si el usuario cierra la app con la cuenta creada
   pero el teléfono **sin confirmar**, al volver: aparece un banner en **Home** (*«Te queda un
   pasito»*, [`Home.tsx`](src/pages/Home.tsx)) y, al entrar en `/register`, se **retoma el
   mismo paso de OTP** en lugar de dejar una cuenta inservible. La detección es **pura** (mira
   sólo la sesión: `phone_confirmed_at` vacío + teléfono conocido) en
   [`registration-flow.ts`](src/lib/registration-flow.ts).

**Mensajes al usuario** (i18n en [`src/lib/i18n.tsx`](src/lib/i18n.tsx), ES/EN):

| Situación | Clave i18n | Mensaje (ES) |
|---|---|---|
| Código incorrecto | `auth.error.otpInvalid` | «El código introducido no es correcto…» |
| Código caducado | `auth.error.otpExpired` | «El código ha caducado. Pide uno nuevo…» |
| Demasiados intentos | `auth.error.otpTooManyAttempts` | «Demasiados intentos. Espera unos minutos…» |
| No se pudo enviar el SMS | `auth.error.otpSendFailed` | «No hemos podido enviar el código por SMS…» |
| Sin proveedor SMS configurado | `auth.error.otpProviderUnavailable` | «…el envío de SMS todavía no está activado…» |
| Servidor exige verificar | `auth.error.phoneNotVerified` | «Debes verificar tu número de teléfono…» |
| Verificado / completando | `auth.otp.verified` / `auth.otp.finishing` | «¡Teléfono verificado!» / «…completando tu registro…» |

### Cómo probarlo — end-to-end

**Requisito previo:** Twilio configurado como proveedor *Phone* en Supabase (sección
anterior) y un número de móvil real que pueda recibir SMS.

**Camino feliz (con proveedor configurado):**

```sh
npm run dev            # cliente en http://localhost:8080
# 1) Abre http://localhost:8080/?salon=denueveanueve  →  "Crear cuenta".
# 2) Rellena el formulario con un TELÉFONO REAL (España: 9 dígitos, p. ej. 600 123 456)
#    y envía. La app pasa al paso "Verifica tu teléfono".
# 3) Llega el SMS (lo envía Supabase Auth vía Twilio). Teclea el código de 6 dígitos:
#    al completarlo se verifica solo → "¡Teléfono verificado!" → RPC de enlace → /home.
```

**Casos a comprobar además del feliz:**

| Caso a probar | Cómo provocarlo | Resultado esperado |
|---|---|---|
| **Reenvío** con cooldown | Espera el SMS y pulsa «Reenviar código» | Botón deshabilitado con cuenta atrás `m:ss` (60 s); tras reenviar, aviso «Te hemos enviado un código nuevo». |
| **Código incorrecto/caducado** | Teclea 6 dígitos erróneos o deja caducar el código | Error legible; el campo se limpia para reintentar sin borrar a mano. |
| **Cambiar número** | Pulsa «Cambiar número» | Vuelve al formulario para corregir el teléfono. |
| **Servidor exige verificar** | RPC devuelve `PHONE_NOT_VERIFIED` (gating de Salón OS) | Aviso «verificación obligatoria»; reenvía código; desaparece «continuar sin verificar». |
| **Reanudación** | Crea la cuenta, **cierra** la app antes de meter el código y **vuelve a entrar** | Banner «Te queda un pasito» en Home y, en `/register`, se retoma el mismo OTP. |
| **Sin proveedor SMS** | Prueba con Twilio **sin** configurar en Supabase | Mensaje honesto `otpProviderUnavailable` + «Continuar sin verificar» (si el servidor no lo exige). |

**Sin gastar SMS (pruebas automáticas).** La lógica del flujo está cubierta por Vitest sin
tocar Supabase ni enviar SMS reales (inyección de dependencias en toda la capa OTP):

```sh
npm test    # ejecuta, entre otros:
#   src/lib/otp.test.ts                    → E.164, cooldown, mapeo de errores, saneo del código
#   src/lib/phone-verification.test.ts     → enviar/reenviar/confirmar (cliente de Auth simulado)
#   src/lib/registration-flow.test.ts      → desenlace de la RPC + detección de reanudación
#   src/components/PhoneOtpStep.test.tsx    → UI del paso de OTP (estados, reenvío, errores)
#   src/pages/Register.test.tsx            → encadenado registro → OTP → enlace
```

### Alcance y dependencia con Salón OS

El OTP en cliente es **defensa en profundidad y UX**, pero **por sí solo no cierra** el
secuestro de ficha: `register_my_customer_account` es una RPC de servidor invocable con la
anon key **saltándose la UI**. La garantía completa requiere que la **RPC de Salón OS**
compruebe la propiedad del teléfono (`auth.users.phone_confirmed_at` = `p_phone`) —trabajo
del servidor, fuera de este repo. El gating `PHONE_NOT_VERIFIED` (paso 6) es precisamente ese
refuerzo cuando el servidor lo aplica. Ver auditoría §11.

---

## Reservas y «Mis Citas» — API pública de Salón OS

Las rutas `/book` (reservar) y `/appointments` («Mis Citas») están **operativas**
contra el backend de **Salón OS** tras la re-integración de la migración (sub-1…sub-9).
Ambas requieren sesión (`RequireAuth`). Principio de oro: **el servidor manda** — la app
**no** recalcula disponibilidad, duraciones ni husos; consume lo que la API pública
declara reservable, tal cual.

### Dos vías de datos (dos backends)

| Pantalla | Cómo lee/escribe | Origen |
|---|---|---|
| **Reservar** (`/book`) | API **pública HTTP** de reserva (anon, sin sesión) | `{VITE_SALON_OS_API_URL}/api/public/booking/{slug}` |
| **Mis Citas** (`/appointments`) | **SDK de Supabase** con RLS *self* (con sesión) | `public.appointments` del proyecto Salón OS |

- La **reserva** habla con la app Next.js de Salón OS por HTTP: base = `VITE_SALON_OS_API_URL`
  (build-time), slug **resuelto en runtime**. Transporte tipado en
  [`src/lib/salon-os-api.ts`](src/lib/salon-os-api.ts); config (base + slug) en
  [`src/config/salon-os.ts`](src/config/salon-os.ts); lógica pura del asistente en
  [`src/lib/booking.ts`](src/lib/booking.ts).
- **Mis Citas** lee `public.appointments` directamente en Supabase con la política RLS *self*
  (ver **⚠️ Limitación pendiente** al final de esta sección). Los **nombres** de
  servicio/profesional se enriquecen con el catálogo público (mismo
  endpoint `bootstrap`), de forma **no bloqueante**. Hook en
  [`src/hooks/useAppointments.ts`](src/hooks/useAppointments.ts).

### Configurar `VITE_SALON_OS_API_URL`

Origen (scheme + host, **sin barra final**) del despliegue de Salón OS que sirve la API
pública de reserva. Es **build-time** e **igual para todos los salones** del despliegue
(no depende del salón resuelto). El cliente tipado construye sobre ella
`{base}/api/public/booking/{slug}` con el slug de runtime. Si falta, la app lanza
`SalonOsConfigError` con un mensaje claro; no falla en silencio.

| Entorno | Valor de `VITE_SALON_OS_API_URL` |
|---|---|
| **Producción** | `https://app.salonos.app` (dominio real del despliegue de Salón OS) |
| **Local (mismo PC)** | `http://localhost:3000` (la app Next.js de `salon-os` en tu máquina) |
| **Móvil físico (misma Wi-Fi)** | `http://<IP-LAN-de-tu-PC>:3000` — p. ej. `http://192.168.1.42:3000`. **Nunca `localhost`**: en el móvil, `localhost` es el propio móvil, no tu PC. |

> ⚠️ **Es build-time.** Vite **inyecta** las `VITE_*` al arrancar el dev server / al construir;
> **no** se leen en runtime. Si cambias `VITE_SALON_OS_API_URL`, **reinicia** `npm run dev`
> (o reconstruye). Definirla en tu `.env` local; en producción, en las variables del proveedor.

Endpoints públicos (anon) que consume el cliente ([`salon-os-api.ts`](src/lib/salon-os-api.ts)):

| Método · ruta | Para qué |
|---|---|
| `GET  /api/public/booking/{slug}` | **bootstrap**: salón + catálogo (servicios, profesionales, quién presta qué, zona horaria). |
| `GET  …/{slug}/availability?serviceId=&date=&professionalId=` | **huecos** reservables (los calcula el servidor). |
| `POST /api/public/booking/{slug}` | **crea la reserva** (cita en estado `pending`). |

### El flujo de reserva (`/book`)

Asistente **multi-paso, una decisión por pantalla** ([`BookAppointment.tsx`](src/pages/BookAppointment.tsx)):

1. **Servicio** — del catálogo público (`bootstrap`). Se puede **preseleccionar** con
   `?serviceId=<uuid>` (enlace desde el catálogo).
2. **Profesional** — uno concreto **o «cualquiera»** (`any`); en «cualquiera» lo asigna el servidor.
3. **Fecha** — calendario; sólo se bloquea el **pasado** (del resto decide el servidor).
4. **Hueco** — los que devuelve `availability`, pintados **tal cual**: sólo se ordenan y
   deduplican por hora (presentación), sin ninguna aritmética de disponibilidad en cliente.
5. **Confirmar** — datos de contacto **prellenados de la ficha *self*** del cliente (nombre +
   teléfono **normalizado** `phone_e164`, para reutilizar la misma ficha que el servidor enlazó
   por teléfono), editables. El **POST** reserva con el **profesional concreto del hueco** elegido
   (nunca `any`), con el cuerpo **exacto** que valida el servidor (Zod `.strict()`).

Al confirmar, la cita se crea en estado **`pending`**: la pantalla de éxito lo dice con
honestidad (no promete confirmación) e **invalida** la caché de `['appointments']` para que
aparezca en «Mis Citas».

**Errores legibles sin romper la app** (clasificación pura `classifyBookingError` en
[`src/lib/booking.ts`](src/lib/booking.ts)):

| Caso | HTTP | Comportamiento en la UI |
|---|:---:|---|
| `slotTaken` | 409/410 | El hueco se ocupó entre verlo y reservar → vuelve a **huecos** y **recalcula**. |
| `invalidData` | 400/422 | Datos rechazados por el servidor → aviso, **sin perder** lo tecleado. |
| `salonUnavailable` | 403/404 | Salón no encontrado / no reservable. |
| `network` | 0 | La petición ni llegó: red caída, API inaccesible o **CORS**. |
| `server` | 5xx | El servicio de reservas falló al procesar. |

### «Mis Citas» (`/appointments`)

Lista **sólo las citas del cliente autenticado** desde `public.appointments`, con **mínimo
privilegio** ([`useAppointments.ts`](src/hooks/useAppointments.ts)):

- **Columnas explícitas** (nunca `SELECT *`): se omiten `notes`/`cancelled_reason` (posibles
  notas internas del staff; RLS filtra **filas**, no columnas).
- **Doble filtro** `(customer_id, salon_id)` como defensa en profundidad sobre la RLS.
- **Sólo lectura**: no hay cancelar/reprogramar desde la app (iría por una RPC controlada,
  fuera de alcance).
- **Enriquecido no bloqueante**: los nombres salen del catálogo público; si esa consulta falla,
  las citas se ven igual (sin nombres) — nunca convierte una carga correcta en error.
- Pestañas **próximas/historial** y estados legibles: **carga**, **vacío**, **error** y el
  aviso honesto de **acceso bloqueado** (ver limitación).

### Cómo probarlo — local y móvil

**En local (mismo PC):**

```sh
# 1) Levanta el backend Salón OS (app Next.js) en http://localhost:3000
# 2) En este repo, en tu .env:
#      VITE_SALON_OS_API_URL="http://localhost:3000"
npm run dev            # cliente en http://localhost:8080
# Abre http://localhost:8080/?salon=denueveanueve, inicia sesión y ve a "Reservar".
```

**Desde el móvil físico (misma Wi-Fi):** el dev server ya escucha en **todas las interfaces**
(`server.host: "::"`, puerto **8080** en [`vite.config.ts`](vite.config.ts)), así que es
accesible por la **IP de red** de tu PC — pero `localhost` **desde el móvil** apunta al propio
móvil, no a tu PC. Por eso hay que usar la **IP LAN** del PC en **ambos** sitios (la URL del
cliente **y** `VITE_SALON_OS_API_URL`):

```sh
# 1) Averigua la IP LAN de tu PC (Windows):  ipconfig  →  "Dirección IPv4" (p. ej. 192.168.1.42)
# 2) En .env, apunta la API a esa IP (NO localhost) y REINICIA el dev server (es build-time):
#      VITE_SALON_OS_API_URL="http://192.168.1.42:3000"
npm run dev
# 3) En el móvil (misma Wi-Fi) abre:
#      http://192.168.1.42:8080/?salon=denueveanueve
```

Notas para la prueba desde móvil:

- **Reinicia `npm run dev`** tras cambiar `VITE_SALON_OS_API_URL` (Vite la inyecta en build-time).
- **CORS**: el backend Salón OS debe permitir el **origen** desde el que se sirve el cliente
  (`http://192.168.1.42:8080`). Si no, la reserva falla como error de **red** (`status 0` →
  «No se pudo conectar con el servicio de reservas»). Es configuración **del servidor**, no de esta app.
- El **salón** se resuelve igual que siempre: en una IP no hay subdominio, así que usa
  `?salon=<slug>` o el fallback `VITE_SALON_SLUG`.
- **Firewall de Windows**: la primera vez, permite el acceso entrante a los puertos **8080**
  (cliente) y **3000** (API) en tu red **privada**.
- **HTTP vs HTTPS/PWA**: en LAN es HTTP plano; algunas capacidades PWA sólo aplican en
  `localhost` o HTTPS. Para probar reserva y «Mis Citas» no hace falta.

### ⚠️ Limitación pendiente — «Mis Citas» depende de una política/RPC *self* en el servidor

«Mis Citas» **sólo funciona** si el proyecto Supabase de **Salón OS** tiene activa una política
RLS (o RPC) **self de solo lectura** que deje a un cliente autenticado ver **sólo sus** citas
(`self_select_own_appointments`). **Esa política vive en el servidor de Salón OS y no se gobierna
desde este repo.** Dos casos si falta:

| Estado en el servidor | Respuesta | Qué percibe el usuario |
|---|---|---|
| Falta el **GRANT SELECT** al rol `authenticated` | `42501 permission denied` | **Detectable** → aviso honesto (`BlockedNotice`, tono ámbar): «aún no disponible», con **reservar** y **reintentar**. |
| RLS activa pero **sin política SELECT** para el cliente | **0 filas, sin error** | **Indistinguible** de «no tienes citas» (limitación conocida). |

**Regla dura:** si el cliente no puede leer sus citas, **NO se abren políticas amplias** desde el
frontend (nada de `service_role`, ni leer sin filtro `customer_id`/`salon_id`, ni `USING (true)`).
Se avisa con honestidad en pantalla y **se resuelve en el servidor**. Guía completa (SQL de la
política, verificación y «definición de hecho»):
[`docs/PENDIENTE-mis-citas-rls.md`](docs/PENDIENTE-mis-citas-rls.md). Auditoría de aislamiento de
datos: [`docs/SECURITY-AUDIT-sub7-aislamiento-mis-citas.md`](docs/SECURITY-AUDIT-sub7-aislamiento-mis-citas.md).

> **Nota histórica.** El código del flujo original (multi-servicio, Google Calendar, realtime,
> cancelar/reprogramar sobre el esquema legacy) se conserva **verbatim** en
> [`src/pages/_deferred/reservations-3B-2/`](src/pages/_deferred/reservations-3B-2/) sólo como
> referencia; la implementación **activa** es la descrita arriba, sobre la API pública de Salón OS.

---

## Estructura del proyecto

```
src/
├── App.tsx                         # rutas (React Router) + feature flags
├── config/
│   ├── features.ts                 # flags de capacidades gated en Salón OS
│   └── salon-os.ts                 # config API pública: base (env) + slug (runtime) + hooks
├── integrations/supabase/
│   ├── client.ts                   # cliente Supabase (lee VITE_SUPABASE_*)
│   └── types.ts                    # tipos generados del esquema Salón OS
├── lib/
│   ├── auth.tsx                    # AuthProvider + mapeo de errores (auth y RPC)
│   ├── salon.ts                    # resolución PURA del slug + mapper de branding
│   ├── salon-branding.ts           # fetchSalonBranding (RPC) + logo (bucket salon-logos)
│   ├── salon-theme.ts              # tema white-label PURO + contraste WCAG AA
│   ├── salon-context.tsx           # <SalonProvider> / useSalon() (salon_id runtime)
│   ├── salon-os-api.ts             # cliente HTTP tipado de la API pública de reserva (VITE_SALON_OS_API_URL)
│   ├── booking.ts                  # lógica PURA del asistente de reserva (huecos, contacto, errores)
│   ├── appointments.ts             # transformación PURA de "Mis Citas" (enriquecido, isAccessDeniedError)
│   └── i18n.tsx                    # traducciones
├── hooks/
│   ├── useCustomer.ts              # ficha SELF del cliente autenticado (customerId)
│   └── useAppointments.ts          # "Mis Citas": lectura self + catálogo (no bloqueante)
├── pages/
│   ├── Register.tsx                # alta + enlace por teléfono vía RPC
│   ├── Home.tsx / Profile.tsx / Loyalty.tsx  # pantallas operativas
│   ├── ServiceCatalog.tsx          # catálogo público de Salón OS
│   ├── BookAppointment.tsx         # asistente de reserva (API pública de Salón OS) ✅
│   ├── Appointments.tsx            # "Mis Citas" (RLS self · lectura) ✅
│   └── _deferred/reservations-3B-2/           # flujo legacy conservado (referencia)
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
