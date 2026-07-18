# Salón OS — App de Staff

Panel interno del personal del salón. Es la app que usa el equipo para **escanear
el QR del cliente y acreditarle la visita** (fidelización: visitas, puntos,
recompensas y cupón de bienvenida).

Está conectada a la base de datos de **Salón OS**, la plataforma multi-tenant de
HAT3X. Todos los datos (clientes, fidelización, miembros del salón, RPCs) viven
en ese Supabase; esta app es un cliente más de ese backend.

> **Salón OS es multi-tenant y la app NO está cableada a ningún salón.** El salón
> concreto (id, nombre, logo y colores) se **resuelve en runtime** por subdominio /
> `?salon=` / fallback (ver más abajo). Nombre, logo, colores y el título de la PWA
> salen del salón resuelto; ya **no** hay valores fijos de un salón en el código.
> `VITE_SALON_ID` quedó **obsoleto** como fuente de verdad y `VITE_SALON_SLUG` es
> solo el **fallback** del slug para la resolución en runtime. Este despliegue usa,
> por defecto, el slug `denueveanueve`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Build / dev server | [Vite](https://vitejs.dev/) 5 |
| UI | [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) (strict) |
| Backend / datos | [Supabase](https://supabase.com/) vía [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript) |
| Estado servidor | [TanStack Query](https://tanstack.com/query) v5 |
| Rutas | [React Router](https://reactrouter.com/) v6 |
| Componentes | [shadcn/ui](https://ui.shadcn.com/) (Radix UI) + [Tailwind CSS](https://tailwindcss.com/) |
| Escáner QR | [`html5-qrcode`](https://github.com/mebjas/html5-qrcode) |
| Tests | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |

---

## Configuración

Vite solo expone al cliente las variables con prefijo `VITE_`. Copia la plantilla
y rellena los valores:

```sh
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase de Salón OS. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | **Anon key** (`role: anon`) del proyecto. Es pública y segura en el cliente. |
| `VITE_SUPABASE_PROJECT_ID` | ID del proyecto Supabase de Salón OS. |
| `VITE_SALON_SLUG` | Slug de reserva por defecto. Es el **fallback** (última prioridad) de la resolución del salón en runtime (ver más abajo). |
| `VITE_SALON_ID` | **Obsoleto.** Ya **no lo lee ningún código** de la app: el `salon_id` se deriva del salón resuelto en runtime. Se conserva únicamente en `.env` como apunte documental del despliegue mono-salón; puede omitirse. |

La `ANON KEY` puede copiarse desde el panel de Supabase (**Project → API**) o
desde `salon-os/.env.local` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

> El cliente Supabase (`src/integrations/supabase/client.ts`) trae valores por
> defecto de Salón OS como red de seguridad, pero en cualquier despliegue real
> debes definir el `.env` de forma explícita.

---

## Resolución del salón en runtime

Salón OS es multi-tenant y esta app se sirve con **un único código** por subdominio.
El salón se resuelve al arrancar, con esta **prioridad** (función pura y testeable en
`src/lib/salon.ts` — `resolveSalonSlug`):

1. **Subdominio del host** — `denueveanueve.salonos.app` → `denueveanueve`. Se ignoran
   `localhost` / `*.localhost`, IPs (v4/v6), `www` y el apex (`dominio.tld`).
2. **Parámetro `?salon=<slug>`** — útil en local/preview (`localhost?salon=denueveanueve`).
3. **`VITE_SALON_SLUG`** — fallback cuando no hay ni subdominio ni parámetro.

Con el slug se llama a la RPC pública `get_salon_branding(p_slug)`
(`src/lib/salon-branding.ts`), que devuelve **solo campos de marca seguros**: `id`,
`name`, `slug`, `logo_url`, `primary_color`, `secondary_color` (nunca datos
fiscales/PII). De ahí se **deriva el `salon_id`** de toda la app (auth y páginas leen
`useSalon()` / `useSalonId()`), en vez de `VITE_SALON_ID`.

El `SalonProvider` (`src/lib/salon-context.tsx`) hace de **puerta**: hasta que el salón
no resuelve con éxito no monta el resto de la app. Muestra:

- **splash** mientras carga,
- **pantalla de error controlada** `SalonUnavailable` si el slug no existe / el salón
  está inactivo (la RPC devuelve conjunto vacío) o si hay un error de red (reintentable).

Tests: `src/lib/salon.test.ts` (resolución + mapeo, sin red) y
`src/lib/salon-branding.test.ts` (RPC con cliente mockeado).

---

## Puesta en marcha

Requisito: Node.js y npm ([instalar con nvm](https://github.com/nvm-sh/nvm#installing-and-updating)).

```sh
# 1. Instalar dependencias
npm install

# 2. Levantar el servidor de desarrollo (recarga en caliente)
npm run dev
```

Scripts disponibles:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite). |
| `npm run build` | Build de producción. |
| `npm run build:dev` | Build en modo desarrollo. |
| `npm run preview` | Sirve localmente el build de producción. |
| `npm run lint` | ESLint sobre todo el proyecto. |
| `npm run test` | Tests con Vitest (una pasada). |
| `npm run test:watch` | Vitest en modo watch. |

---

## Autenticación (login por ID + miembro del salón)

El acceso es en **dos comprobaciones**:

1. **ID de acceso + contraseña.** El usuario introduce un **ID de acceso** (no un
   email). Internamente se traduce a un email sintético `<id>@salonos.app` y se
   autentica contra Supabase Auth con `signInWithPassword`. Los mensajes de error
   son genéricos («ID o contraseña incorrectos») para evitar la enumeración de
   usuarios.
2. **Pertenencia al salón.** Tras autenticar, se consulta la tabla
   `salon_members` filtrando por el `salon_id` **del salón resuelto en runtime**
   (`useSalon()`, no `VITE_SALON_ID`) y `user_id`. Si el usuario **no** es miembro
   de este salón, se cierra la sesión y se muestra «Sin acceso a este salón» (una
   sesión válida en otro salón no da acceso aquí).

El rol proviene del enum `member_role` de Salón OS:

| Rol (`member_role`) | En la app |
|---|---|
| `owner` | Admin (acceso total) |
| `manager` | Manager |
| `staff` | Personal del salón |

La lógica vive en `src/lib/auth.tsx` (`AuthProvider` / `useAuth`).

---

## Flujo principal: escanear → confirmar visita

```
Login ─▶ Dashboard ─▶ Escanear QR ─▶ Verificar cliente ─▶ Seleccionar servicio ─▶ Confirmar visita ─▶ Resultado
```

1. **Escanear QR** (`/scan`) — cámara con `html5-qrcode`; también permite
   introducir el **token del QR manualmente** o buscar al cliente.
2. **Verificar cliente** (`/verify-customer`) — busca al cliente en `customers`
   por `qr_token` (o `id`) **dentro de este salón**, y carga su fidelización
   (`loyalty_accounts`), recompensas disponibles (`rewards`) y cupón de bienvenida
   (`welcome_coupons`).
3. **Seleccionar servicio** (`/select-service`) — se eligen los servicios/líneas
   de la visita.
4. **Confirmar visita** (`/confirm-visit`) — acredita la visita llamando a la
   RPC de Salón OS **`staff_award_visit`**. Permite aplicar el cupón de bienvenida
   si el cliente tiene uno activo.
5. **Resultado** (`/visit-result`) — muestra puntos añadidos, visitas totales,
   saldo y recompensas desbloqueadas.

### RPC `staff_award_visit`

La acreditación es una única llamada a la RPC (en `ConfirmVisit.tsx`):

```ts
const salonId = useSalonId(); // salon_id del salón resuelto en runtime (no VITE_SALON_ID)

await supabase.rpc('staff_award_visit', {
  p_salon_id: salonId,
  // identificación del cliente: por ID si se conoce, si no por el token del QR
  ...(customerId ? { p_customer_id: customerId } : { p_qr_token: qrToken }),
  p_line_items: lines,          // [{ price_cents, label }, ...] (JSON)
  p_redeem_coupon: redeemCoupon, // aplicar cupón de bienvenida
  p_ref_type: 'visit',
  p_ref_id: refId,              // UUID único de la visita → idempotencia
});
```

- **Idempotencia:** `p_ref_id` es un `crypto.randomUUID()` generado una sola vez
  por visita y reutilizado en cada reintento, de modo que la RPC no acredite la
  visita dos veces si un intento falla a medias.
- **Errores de negocio** (`FEATURE_NOT_ENABLED`, `FORBIDDEN`, `CUSTOMER_NOT_FOUND`,
  `NO_LINES`, `UNKNOWN`) se clasifican y traducen a mensajes en español para el
  personal en `src/lib/award-visit-errors.ts` (módulo puro, testeado en
  `award-visit-errors.test.ts`).
- **Gating de add-ons (`FEATURE_NOT_ENABLED`).** Si el salón **no tiene contratado**
  el add-on de fidelización, la RPC responde con `FEATURE_NOT_ENABLED`. El gating vive
  **en el servidor** (Salón OS); la app **no lo sortea**, solo lo traduce a un mensaje
  claro: **«Esta peluquería no tiene contratado este servicio.»**

---

## Estructura del proyecto

```
src/
├─ integrations/supabase/client.ts  # Cliente Supabase (sin salon_id cableado)
├─ types/database.ts                # Tipos generados del esquema de Salón OS
├─ lib/salon.ts                     # Resolución pura del slug + mapeo de marca
├─ lib/salon-branding.ts            # RPC get_salon_branding (I/O)
├─ lib/salon-context.tsx            # SalonProvider: resuelve, tematiza y marca la PWA
├─ lib/theme.ts                     # hex de marca → design tokens de Tailwind
├─ lib/pwa-manifest.ts              # manifest PWA por-tenant en runtime
├─ lib/award-visit-errors.ts       # errores de staff_award_visit → mensaje (gating)
├─ lib/auth.tsx                     # AuthProvider: login por ID + salon_members
├─ pages/                           # Rutas (Login, Dashboard, Scan, VerifyCustomer,
│                                   #   SelectService, ConfirmVisit, VisitResult, …)
├─ components/staff/                # Componentes de dominio (QRScannerCard, ComingSoon, …)
└─ components/ui/                   # shadcn/ui (Radix + Tailwind)
public/
├─ manifest.webmanifest            # manifest PWA NEUTRO (fallback pre-JS, instalable)
├─ icon.svg                        # icono maskable neutro por defecto
└─ sw.js                           # service worker mínimo (app-shell offline)
```

Rutas definidas en `src/App.tsx`.

---

## Fuera de alcance en esta fase

La **agenda y la gestión de empleados** (calendario del empleado, alta y horarios
del personal) **quedan pendientes para una sub-fase aparte**.

El modelo antiguo de turnos (`staff_members` / `employee_schedules`) **no encaja**
con Salón OS, que gestiona la disponibilidad mediante `professionals` /
`professional_schedules`. Hasta que ese flujo se reconstruya, las pantallas
correspondientes se muestran como placeholders elegantes (`ComingSoon`):

- `/employee/calendar` — «Mi calendario»
- `/admin/employees` — gestión de empleados
- `/admin/employees/:id` — calendario por empleado

Por eso, tras autenticarse, **todo el personal aterriza en `/dashboard`**
(`RoleRedirect`), que sí está dentro del alcance actual.

---

## PWA (manifest, iconos y marca por salón)

La app es instalable como PWA y su marca es **por-tenant**, resuelta en runtime:

- **Manifest estático neutro** — `public/manifest.webmanifest` («Salón OS · Staff»,
  colores neutros, `public/icon.svg` maskable). Es válido e instalable **por sí mismo**,
  incluso antes de que corra el JS, sin cablearse a ningún salón.
- **Marca en runtime** — al resolver el salón, `src/lib/pwa-manifest.ts`
  (`applySalonPwaBranding`) genera un manifest por-tenant (nombre, `theme_color` = color
  del salón, iconos = logo del salón con el neutro como respaldo), lo enchufa al
  `<link rel="manifest">` como `Blob`, y actualiza `theme-color` y `apple-touch-icon`.
  Los **colores** de la UI también se derivan del salón (`src/lib/theme.ts`).
- **Service worker** — `public/sw.js` (registrado solo en producción desde `main.tsx`):
  app-shell offline, network-first en navegaciones y **same-origin únicamente** (nunca
  intercepta Supabase). Si el navegador no lo soporta, la app funciona igual.

> **Limitación consciente.** Como el build es único y multi-tenant, el manifest del
> **primer render** (pre-JS) y ciertos flujos de **iOS** no reciben la marca por-tenant:
> iOS captura icono/nombre de «Añadir a pantalla de inicio» del DOM en ese momento y no
> los re-lee tras un `Blob` de manifest. Por eso el manifest estático es **neutro** (no
> el de un salón). Para una instalación 100 % por-salón en **todas** las plataformas
> haría falta **servir el manifest por subdominio** (endpoint por-tenant) o **builds
> por-tenant**. La rama actual (manifest neutro + marca runtime best-effort) no rompe la
> instalabilidad existente y cubre theme-color e iconos donde el navegador lo permite.

---

## Despliegue

Al ser una app Vite estática, `npm run build` genera `dist/`, que puede servirse
desde cualquier hosting estático (Vercel, Netlify, etc.). Recuerda configurar las
variables `VITE_*` en el entorno del proveedor antes de construir.

El despliegue por-tenant se hace **por subdominio** (`<slug>.salonos.app`), que es lo
que la app usa para resolver el salón en runtime.
