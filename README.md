# denueveanueve — App de Staff

App interna del personal del salón **denueveanueve**. Es el panel que usa el
equipo para **escanear el QR del cliente y acreditarle la visita** (fidelización:
visitas, puntos, recompensas y cupón de bienvenida).

Está conectada a la base de datos de **Salón OS**, la plataforma multi-tenant de
HAT3X. Todos los datos (clientes, fidelización, miembros del salón, RPCs) viven
en ese Supabase; esta app es un cliente más de ese backend, fijado al salón
`denueveanueve` mediante variables de entorno.

> **Salón OS es multi-tenant.** Este despliegue de la app de staff corresponde a
> **un único salón**, identificado por `VITE_SALON_ID` / `VITE_SALON_SLUG`. Todas
> las consultas y la RPC de acreditación se filtran por ese `salon_id`.

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
| `VITE_SALON_ID` | UUID del salón (multi-tenant). Este despliegue = `denueveanueve`. |
| `VITE_SALON_SLUG` | Slug del salón (`denueveanueve`). |

La `ANON KEY` puede copiarse desde el panel de Supabase (**Project → API**) o
desde `salon-os/.env.local` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

> El cliente Supabase (`src/integrations/supabase/client.ts`) trae valores por
> defecto de Salón OS como red de seguridad, pero en cualquier despliegue real
> debes definir el `.env` de forma explícita.

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
   `salon_members` filtrando por `salon_id = VITE_SALON_ID` y `user_id`. Si el
   usuario **no** es miembro de este salón, se cierra la sesión y se muestra «Sin
   acceso a este salón» (una sesión válida en otro salón no da acceso aquí).

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
await supabase.rpc('staff_award_visit', {
  p_salon_id: SALON_ID,
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
- **Errores de negocio** (`FORBIDDEN`, `CUSTOMER_NOT_FOUND`, `NO_LINES`,
  `UNKNOWN`) se clasifican y traducen a mensajes en español para el personal.

---

## Estructura del proyecto

```
src/
├─ integrations/supabase/client.ts  # Cliente Supabase + SALON_ID / SALON_SLUG
├─ types/database.ts                # Tipos generados del esquema de Salón OS
├─ lib/auth.tsx                     # AuthProvider: login por ID + salon_members
├─ pages/                           # Rutas (Login, Dashboard, Scan, VerifyCustomer,
│                                   #   SelectService, ConfirmVisit, VisitResult, …)
├─ components/staff/                # Componentes de dominio (QRScannerCard, ComingSoon, …)
└─ components/ui/                   # shadcn/ui (Radix + Tailwind)
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

## Despliegue

Al ser una app Vite estática, `npm run build` genera `dist/`, que puede servirse
desde cualquier hosting estático (Vercel, Netlify, etc.). Recuerda configurar las
variables `VITE_*` en el entorno del proveedor antes de construir.
