# Salon OS

Sistema de gestión integral para salones de belleza con soporte multi-sede.

**Stack:** Next.js 14 (App Router) · TypeScript strict · Tailwind CSS · shadcn/ui · Supabase · TanStack Query v5

---

## Índice

- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos](#base-de-datos)
- [Scripts disponibles](#scripts-disponibles)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Sistema de diseño](#sistema-de-diseño)
- [Funcionalidades](#funcionalidades)
- [Autenticación](#autenticación)
- [Verificación del teléfono del cliente (OTP)](#verificación-del-teléfono-del-cliente-otp)
- [API pública de reservas](#api-pública-de-reservas)
- [Productización: planes (add-ons) y white-label](#productización-planes-add-ons-y-white-label)
- [Capa de pagos y facturación](#capa-de-pagos-y-facturación)
- [Aviso de conformidad fiscal (Veri\*factu)](#aviso-de-conformidad-fiscal-veri-factu)
- [WhatsApp / Twilio](#whatsapp--twilio)
- [Testing](#testing)
- [Despliegue](#despliegue)
- [Mantenimiento](#mantenimiento)

---

## Requisitos

| Herramienta | Versión mínima |
|---|---|
| Node.js | 20 LTS |
| npm | 10 |
| Supabase CLI | 1.x (para migraciones locales) |

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone <repo-url>
cd salon-os

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales (ver sección Variables de entorno)

# 4. Aplicar migraciones de base de datos
#    Opción A — proyecto Supabase remoto:
npx supabase db push
#    Opción B — Supabase local (Docker):
npx supabase start
npx supabase db reset

# 5. Arrancar el servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Variables de entorno

Copia `.env.example` a `.env.local` y rellena cada valor. El archivo `.env.example` contiene descripciones detalladas y los pasos de obtención de cada credencial.

| Variable | Dónde obtenerla | Requerida |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API | Sí (reservas públicas) |
| `NEXT_PUBLIC_SITE_URL` | URL base de tu app | Sí |
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info | Solo si activas WhatsApp |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account Info | Solo si activas WhatsApp |
| `TWILIO_WHATSAPP_FROM` | Twilio Console → Messaging → WhatsApp Senders | Solo si activas WhatsApp |
| `TWILIO_CONTENT_SID_*` | Twilio Content Template Builder | Solo si activas WhatsApp |
| `WHATSAPP_REMINDERS_ENABLED` | `false` por defecto (dry-run seguro) | No |

> **Seguridad:** `SUPABASE_SERVICE_ROLE_KEY` y `TWILIO_AUTH_TOKEN` son secretos de servidor. Nunca usar el prefijo `NEXT_PUBLIC_` en estas variables ni exponerlas al navegador.

---

## Base de datos

El esquema se gestiona con migraciones SQL en `supabase/migrations/`. Se aplican en orden cronológico:

| Migración | Descripción |
|---|---|
| `20260711100000_initial_schema.sql` | Esquema base multi-tenant: `salons`, `salon_members`, `services`, `professionals`, `appointments`, `customers` |
| `20260711100100_rls_policies.sql` | Políticas Row Level Security — aislamiento por tenant |
| `20260711100200_history_triggers.sql` | Triggers para historial de visitas en `customer_visits` |
| `20260712120000_tenant_integrity.sql` | Constraints de integridad cruzada entre tablas del tenant |
| `20260712130000_availability.sql` | Tablas y funciones de disponibilidad horaria |
| `20260712140000_locations.sql` | Soporte multi-sede (`locations`); profesionales por sede |
| `20260713000000_services_phase_duration.sql` | Duración por fases del servicio (aplicación / exposición / post) |
| `20260713150000_reminder_queue.sql` | Cola persistente de recordatorios WhatsApp |
| `20260713150100_reminder_rpc.sql` | RPCs `SECURITY DEFINER` para la Edge Function de recordatorios |
| `20260713160000_appointment_blocks.sql` | Bloques de agenda para solapamiento por fases |
| `20260713170000_fiscal_base.sql` | **Base fiscal:** datos fiscales del emisor (`salons`) y receptor (`customers`) + catálogo `products` |
| `20260713180000_pos_base.sql` | **TPV:** `pos_sales`, `pos_sale_lines`, `pos_payments`, `pos_payment_methods`, `pos_sessions` (caja) |
| `20260714100000_verifactu_invoices.sql` | **Facturación Veri\*factu:** `pos_invoices` — registro inmutable y encadenado por huella SHA-256 |
| `20260714110000_rls_multitenant_guard.sql` | Guardián RLS multi-tenant sobre TPV, facturación y productos |
| `20260716120000_loyalty_base.sql` | **Fidelización nativa:** `loyalty_accounts`, `points_movements`, `welcome_coupons`, `rewards` + bootstrap de cuenta/cupón al crear cliente |
| `20260717100000_customers_user_id.sql` | **Identidad (A):** `customers.user_id` (nullable, FK a `auth.users`) + único parcial `(salon_id, user_id)` — enlace ficha ↔ cuenta |
| `20260717110000_customers_phone_e164.sql` | **Identidad (B):** `app.normalize_phone()` + columna **generada** `customers.phone_e164` + único parcial `(salon_id, phone_e164)` — dedup por teléfono |
| `20260717120000_rls_self_customer.sql` | **Identidad (C):** RLS **SELF** (autoservicio del cliente) sobre `customers` y fidelización + candado de columnas |
| `20260717130000_rls_self_guard.sql` | **Identidad (D):** guardián que aborta si una migración futura debilita el aislamiento del autoservicio |
| `20260717140000_rpc_register_customer.sql` | **Autoservicio cliente:** RPC `register_my_customer_account` — enlaza/crea la ficha del usuario autenticado por teléfono (E.164) |
| `20260717150000_rpc_staff_award_visit.sql` | **App de staff:** RPC `staff_award_visit` — acredita visita (puntos + hito + canje de cupón), idempotente por `(ref_type, ref_id)` |
| `20260718100000_salon_features.sql` | **Productización (entitlements):** enum `salon_feature` + tabla `salon_features` (opt-in) + gate `app.salon_has_feature()` |
| `20260718110000_salon_branding.sql` | **White-label:** tabla `salon_branding` (logo + colores, 1:1 con `salons`; escritura owner/manager) |
| `20260718120000_backfill_salon_features.sql` | **Backfill entitlements:** alta de los add-ons ya en uso (denueveanueve + salones con actividad real) |
| `20260718130000_storage_salon_logos.sql` | **Storage:** bucket `salon-logos` (lectura pública; escritura owner/manager por `salon_id`) |
| `20260718140000_rpc_get_salon_branding.sql` | **Branding público:** RPC `get_salon_branding(slug)` — marca por slug para anónimos, sin exponer la tabla `salons` |
| `20260718150000_rpc_feature_gate.sql` | **Feature-gating:** `register_my_customer_account`/`staff_award_visit` exigen sus add-ons (`FEATURE_NOT_ENABLED`) |
| `20260718160000_rls_productization_guard.sql` | **Guardián de productización:** aserción «última palabra» — RLS activa y sin políticas anon/public en `salons`/`salon_features`/`salon_branding` + integridad del gate `app.salon_has_feature` |
| `20260718170000_rpc_get_salon_branding_add_id.sql` | **Branding público (+id):** `get_salon_branding` expone también `salons.id` (uuid opaco) sin filtrar datos fiscales/PII |
| `20260719100000_rls_self_appointments.sql` | **Acceso del cliente:** RLS **SELF** de solo lectura para que la cuenta enlazada lea **sus** citas |
| `20260719110000_salon_security_settings.sql` | **Válvula de seguridad (OTP):** tabla `salon_security_settings` + interruptor `require_phone_verification` (secure by default, fail-closed) + gate `app.salon_requires_phone_verification()` — ver [Verificación del teléfono](#verificación-del-teléfono-del-cliente-otp) |
| `20260719120000_rpc_register_phone_verification_gate.sql` | **Enforcement OTP:** `register_my_customer_account` exige el teléfono **confirmado** de la cuenta (`auth.users.phone_confirmed_at`) cuando el salón lo requiere → `PHONE_NOT_VERIFIED` |

### Regenerar tipos TypeScript

Siempre que modifiques el esquema, regenera los tipos para mantener el tipado estricto:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
```

---

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo con hot reload |
| `npm run build` | Build de producción |
| `npm run start` | Servir el build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Comprobación de tipos (`tsc --noEmit`) |
| `npm run test` | Tests unitarios e integración (Vitest, una pasada) |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:coverage` | Informe de cobertura de tests |
| `npm run test:e2e` | Tests end-to-end (Playwright) |
| `npm run test:e2e:ui` | Playwright con interfaz visual interactiva |

---

## Estructura del proyecto

```
salon-os/
├── e2e/                              # Tests Playwright end-to-end
│   └── booking-flow.spec.ts
├── supabase/
│   └── migrations/                   # Migraciones SQL ordenadas cronológicamente
├── src/
│   ├── app/
│   │   ├── (auth)/login/             # Página de login (pública)
│   │   ├── (dashboard)/              # Panel de gestión (protegido por middleware)
│   │   │   ├── appointments/         # Agenda: ver, crear, cancelar, reschedule
│   │   │   ├── customers/            # Fichas de cliente + timeline de visitas
│   │   │   ├── tpv/                  # Terminal Punto de Venta: carrito, cobro, emisión de factura
│   │   │   ├── arqueo/               # Caja: apertura/cierre de sesión con descuadres
│   │   │   ├── ajustes/fiscal/       # Datos fiscales del salón (emisor de facturas)
│   │   │   └── dashboard/            # Panel resumen
│   │   ├── (public)/reservar/[slug]/ # Asistente de reserva online (público)
│   │   ├── api/public/booking/[slug] # API REST pública de reservas
│   │   ├── api/facturacion/          # Libro registro (export CSV/JSON) y documento imprimible
│   │   ├── auth/callback/            # Intercambio de código OAuth / magic link
│   │   └── auth/signout/             # Cierre de sesión (POST)
│   ├── components/ui/                # Componentes shadcn/ui
│   ├── hooks/                        # Custom hooks de dominio
│   ├── lib/
│   │   ├── booking/                  # Disponibilidad, esquemas Zod, formatos de fecha/precio
│   │   ├── payments/                  # Capa de pagos: totales/IVA + PaymentGateway abstracto (README propio)
│   │   ├── invoicing/                 # Motor Veri*factu: emisión, huella, QR, export (README propio)
│   │   ├── queries/                  # Queries de Supabase (customers, appointments)
│   │   ├── react-query/              # Provider y query keys de TanStack Query
│   │   ├── supabase/                 # Clientes Supabase: browser, server, admin, middleware
│   │   ├── validations/              # Validaciones Zod de dominio
│   │   └── whatsapp/                 # Integración Twilio: templates, client, reminders
│   ├── types/database.ts             # Tipos generados de Supabase
│   └── __tests__/
│       ├── unit/                     # Tests unitarios
│       └── integration/              # Tests de integración de Route Handlers
├── .env.example                      # Plantilla de variables de entorno
├── MANTENIMIENTO.md                  # Troubleshooting y guías de configuración
├── vitest.config.ts
└── playwright.config.ts
```

---

## Sistema de diseño

Lenguaje visual **premium estilo Apple**: base neutra cálida, acento violeta
(`#7c3aed`), tipografía de sistema con *tracking* calibrado, radios generosos,
sombras suaves y modo claro/oscuro con auditoría de accesibilidad AA.

La referencia completa —tokens de color, escalas de tipografía/espaciado/radios/
sombras, uso del acento violeta, guía de modo claro/oscuro y resumen de cambios
por pantalla— está en **[DESIGN.md](./DESIGN.md)**.

> Fuente de verdad técnica: variables CSS de `src/app/globals.css`, mapeadas a
> Tailwind y al tema shadcn en `tailwind.config.ts`. Los componentes consumen
> tokens; no *hardcodees* colores.

---

## Funcionalidades

### Gestión de citas
- Vista de agenda con filtros por fecha y estado
- Creación, edición y cancelación de citas
- Reschedule mediante diálogo dedicado
- Ciclo de estados: `pending` → `confirmed` → `completed` / `cancelled` / `no_show`

### Fichas de clientes
- CRUD completo de clientes con búsqueda en tiempo real
- Timeline de visitas con historial de servicios y profesionales
- **Identidad por teléfono (un cliente = una ficha):** el teléfono es la clave con la
  que se reconoce a la persona, entre por el **salón**, la **app de cliente** o la
  **recepcionista IA**. Se normaliza a **E.164** y un único por salón evita duplicados;
  la **cuenta de auth** (`user_id`) es un enlace **opcional** sobre la ficha. Detalle en
  [`src/lib/customers/README.md`](./src/lib/customers/README.md) y
  [MANTENIMIENTO.md](./MANTENIMIENTO.md#identidad-del-cliente--cuenta-teléfono-y-dedup).

### Reservas online (público)
- Asistente multi-paso en `/reservar/[slug]` sin necesidad de cuenta
- Validación de disponibilidad en tiempo real
- API REST en `/api/public/booking/[slug]`

### Multi-sede
- Un negocio puede operar en varias sedes físicas (`locations`)
- Profesionales asignados por sede; catálogo de servicios compartido a nivel de salón

### TPV (Terminal Punto de Venta)
- «Pasar por caja» desde una cita o venta libre de mostrador (`/tpv`)
- Carrito con líneas de **servicio**, **producto** (retail) o **cargo manual**; descuentos por línea
- **Pago mixto**: varios medios de pago sobre un mismo ticket (efectivo + tarjeta + Bizum…)
- Cobro mediante la **capa de pagos abstraída** (`@/lib/payments`) — hoy en modo **registro manual**, sin datáfono ni pasarela real conectada (ver [Capa de pagos](#capa-de-pagos-y-facturación))
- Emisión opcional de **factura** (ticket simplificado F2 o factura completa F1) al cobrar

### Caja y arqueo
- Apertura/cierre de **sesión de caja** por salón/sede (`/arqueo`) con fondo inicial
- El cierre recalcula **en servidor** los totales por método, el efectivo esperado y el **descuadre** frente al contado
- Snapshot de totales por método guardado en la sesión para el informe de arqueo

### Facturación Veri\*factu (modo NO VERI\*FACTU)
- Registro de facturación **inmutable** y **encadenado por huella SHA-256** (`pos_invoices`)
- **Numeración correlativa por serie y sin huecos**; desglose de IVA por tipo
- **Documento imprimible** (HTML → PDF) con **QR de cotejo AEAT**, sello de tiempo y aviso NO VERI\*FACTU
- **Exportación del libro registro** de facturas expedidas a CSV/JSON para la gestoría

> ⚠️ **Antes de facturar de cara al público, lee el [Aviso de conformidad fiscal](#aviso-de-conformidad-fiscal-veri-factu).**
> El detalle técnico del modelo de datos, la caja, la capa de pagos y el troubleshooting está en
> [MANTENIMIENTO.md](./MANTENIMIENTO.md#tpv-caja-y-facturación) y en los README de
> [`src/lib/payments`](./src/lib/payments/README.md) y [`src/lib/invoicing`](./src/lib/invoicing/README.md).

### WhatsApp / Recordatorios
- Recordatorio 24 h y 2 h antes de la cita
- Confirmación inmediata al reservar
- Notificación de cancelación con enlace de reagendado
- Seguimiento post-visita con enlace de reseña
- Modo dry-run seguro por defecto (sin mensajes reales hasta activación explícita)

---

## Autenticación

- **Rutas protegidas:** todo bajo `/dashboard` requiere sesión. El middleware redirige a `/login?next=<ruta>` si no hay sesión activa.
- **Login:** email + contraseña (`signInWithPassword`). Usuarios creados desde Supabase Dashboard (Authentication → Users) o por invitación.
- **Sesión SSR:** `src/middleware.ts` refresca la cookie de sesión en cada request usando `@supabase/ssr`.
- **OAuth:** habilitar el proveedor en Supabase y llamar `supabase.auth.signInWithOAuth`. El callback `/auth/callback` ya está implementado.

---

## Verificación del teléfono del cliente (OTP)

El **teléfono es la clave natural de identidad** del cliente (un teléfono = una ficha por
salón). Antes de que el autoservicio enlace/cree la ficha de una cuenta por su teléfono, hay
que **probar que ese número es suyo** con un **código de un solo uso (OTP) por SMS**. Sin esa
prueba, alguien podría **reclamar el teléfono de otra persona** y quedarse con su ficha y sus
puntos.

> 📖 **Guía completa (paso humano + flujo + interruptor):**
> **[`docs/verificacion-telefono-otp.md`](./docs/verificacion-telefono-otp.md)**.
> Operativa y troubleshooting en
> [MANTENIMIENTO.md → Verificación del teléfono](./MANTENIMIENTO.md#verificación-del-teléfono-del-cliente-otp-por-sms).

### Paso humano: el proveedor de SMS lo pone Supabase, no la app

El OTP lo **envía Supabase Auth (GoTrue)**, así que Supabase necesita un **proveedor de SMS**.
Es un **paso manual de puesta en marcha**, una sola vez por proyecto:

**Panel de Supabase → Authentication → Providers → Phone** → activar → elegir **Twilio** →
pegar `Account SID` + `Auth Token` (o API Key) + `Messaging Service SID`/remitente → guardar.

> ⚠️ **No confundir con el Twilio de WhatsApp.** Las credenciales del **OTP** se pegan **en el
> panel de Supabase**; **no** hay ninguna variable `TWILIO_*`/`NEXT_PUBLIC_*` en la app para el
> OTP. Las variables `TWILIO_*` del `.env` son **solo** para los recordatorios de
> [WhatsApp](#whatsapp--twilio), que envía la app — otro uso distinto.

### El flujo (PARTE 2 — verificar el teléfono)

```
pedir teléfono → Supabase envía el SMS (vía el proveedor) → el usuario introduce el código
→ Supabase lo confirma en auth.users (phone + phone_confirmed_at) → RECIÉN ENTONCES se llama
a register_my_customer_account
```

La **UI** de este flujo vive en la **app de cliente (PWA, FASE 3B/3C)**; **este repositorio
aporta el enforcement de servidor**: la RPC `register_my_customer_account` y su gemela TS
`linkOrCreateCustomerAccount` **leen `auth.users.phone_confirmed_at`** y **rechazan** con
`PHONE_NOT_VERIFIED` (RPC, `P0001`) / `phone_not_verified` (Server Action, **403**) cualquier
registro cuyo teléfono no esté **confirmado y coincida** con el declarado.

### El interruptor `require_phone_verification` (y su riesgo)

La tabla `public.salon_security_settings` gobierna, **por salón**, si se exige el OTP. Es
**secure by default** y **fail-closed**: la columna nace `NOT NULL DEFAULT TRUE` y **la
ausencia de fila también exige verificación** (el gate resuelve a "exigir" salvo un `false`
**explícito**). Un salón sin configurar nada queda **protegido**.

> 🛑 **Riesgo explícito.** Poner `require_phone_verification = false` **REABRE el agujero de
> suplantación por teléfono**: cualquiera podría reclamar el teléfono de otra persona y
> apropiarse de su ficha/puntos. **Solo tiene sentido en desarrollo/staging** (p. ej. probar
> el registro sin montar aún el proveedor de SMS). En producción, la respuesta correcta a "no
> llega el OTP" es **arreglar el proveedor**, no relajar la válvula. La escritura de esta tabla
> está reservada a **HAT3X (`service_role`)**: el salón **no** puede auto-abrirse el agujero.

---

## API pública de reservas

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/public/booking/[slug]` | Salón + catálogo (servicios y profesionales) |
| `GET` | `/api/public/booking/[slug]/availability` | Slots disponibles para fecha y servicio |
| `POST` | `/api/public/booking/[slug]` | Crea una reserva (estado `pending`) |

La API valida con Zod y usa el cliente admin de Supabase con validaciones de dominio explícitas (salón, servicio y profesional deben pertenecer al mismo tenant).

---

## Productización: planes (add-ons) y white-label

Salón OS es multi-tenant: un mismo backend sirve a muchos salones. La **productización**
añade dos capas por salón —**qué módulos ha contratado** (entitlements/add-ons) y **con
qué marca se pinta** (white-label)— como **tablas dedicadas** con RLS, no como flags
sueltos en `salons.settings`. El backend de esta capa (**FASE 4A**) y el **panel white-label
dinámico** (**FASE 4B-1**) ya están construidos; re-apuntar las **apps cliente/staff** a la
marca dinámica (**FASE 4B-2**) queda pendiente
(ver [Estado del white-label](#estado-panel-hecho-fase-4b-1-apps-pendientes-fase-4b-2)).

> Diseño y justificación completa: [`docs/roadmap-productizacion.md`](./docs/roadmap-productizacion.md),
> [`docs/salon-branding-design.md`](./docs/salon-branding-design.md),
> [`docs/salon-logos-storage-design.md`](./docs/salon-logos-storage-design.md) y
> [`docs/salon-branding-public-read-design.md`](./docs/salon-branding-public-read-design.md).

### Catálogo de add-ons (features)

Los add-ons contratables son un enum tipado, `public.salon_feature`:

| Feature | Módulo |
|---|---|
| `loyalty` | Fidelización nativa (puntos, cupones, recompensas) |
| `client_app` | PWA de cliente (reservas, QR, cartilla de puntos) |
| `staff_app` | PWA de personal (agenda, check-in, acreditar visita) |
| `ai_receptionist` | Recepcionista IA (Retell + Twilio + n8n) |
| `pos` | TPV / punto de venta (tickets, pagos, Veri\*factu) |

Cada salón tiene 0..N filas en `public.salon_features` (una por add-on). Modelo
**opt-in / deny-by-default de negocio**: un add-on está activo **solo** si existe su fila
**y** `enabled = true`. La **ausencia de fila = no contratado** → el módulo ni aparece.
Suspender sin perder histórico = `enabled = false` (p. ej. impago); dar de baja = borrar
la fila. Ambos dejan el gate en `false`.

- **Lectura (frontend):** RLS deja a los **miembros** del salón leer SUS entitlements —
  el front gatea la UI con `select feature from salon_features where enabled;`.
- **Gate de servidor/policy:** `app.salon_has_feature(salon_id, feature) → boolean`
  (SECURITY DEFINER), reutilizable dentro de otras políticas RLS y RPC. Vive en el
  esquema `app` (no expuesto por PostgREST) → no es un endpoint del cliente.
- **Escritura:** ninguna política para `authenticated` — el salón **no** puede
  auto-concederse add-ons. La provisión la hace HAT3X con `service_role` (ver abajo).

### Dar de alta un add-on a un salón (SQL / `service_role`)

Los entitlements los fija **HAT3X** al vender/activar un plan, con la `service_role`
(bypasa RLS) o desde el backoffice. Upsert idempotente (SQL Editor de Supabase o `psql`
con la service key):

```sql
insert into public.salon_features (salon_id, feature, enabled, notes)
values ('<SALON_UUID>', 'loyalty', true, 'plan Pro')
on conflict (salon_id, feature) do update
  set enabled = excluded.enabled,
      notes   = excluded.notes;
```

Activar la app de cliente **y** la de staff (ambas requieren `loyalty`, ver
[feature-gating](#feature-gating-de-las-rpc-de-fidelización)):

```sql
insert into public.salon_features (salon_id, feature, enabled)
values ('<SALON_UUID>', 'loyalty',    true),
       ('<SALON_UUID>', 'client_app', true),
       ('<SALON_UUID>', 'staff_app',  true)
on conflict (salon_id, feature) do update set enabled = excluded.enabled;
```

> ⚠️ Ejecutar con la **`service_role`**, **nunca** con la anon/authenticated key: RLS no
> concede escritura de entitlements a los usuarios. El backfill de arranque
> (`20260718120000`) ya dio de alta los add-ons **ya en uso** (denueveanueve + salones
> con actividad real), así que no desaparece ningún módulo vivo al activar el opt-in.

### Feature-gating de las RPC de fidelización

Dos RPC de escritura ya están cableadas al catálogo y **rechazan** con
`FEATURE_NOT_ENABLED` (SQLSTATE `P0001`) si falta el add-on:

| RPC | Add-ons exigidos |
|---|---|
| `public.register_my_customer_account` (autoservicio, app de cliente) | `client_app` **y** `loyalty` |
| `public.staff_award_visit` (acreditar visita, app de staff) | `staff_app` **y** `loyalty` |

La capa cliente distingue este error por el **mensaje** (`FEATURE_NOT_ENABLED`), no por el
código: es un error de negocio esperado (add-on no contratado), no un bug.

### Branding público por slug — `get_salon_branding`

El PWA de reservas y las apps (un solo código, servido por subdominio) necesitan pintar
la marca del salón para **visitantes anónimos** (antes del login). La lectura pública entra
por **una RPC `SECURITY DEFINER`**, no por la tabla: `salons` guarda datos fiscales
sensibles en la misma fila (`tax_id`, `legal_name`, `fiscal_address`, `email`, `phone`…)
que **nunca** se exponen a `anon`.

```ts
// Frontend (anónimo o logueado). Única RPC del esquema abierta a anon.
const { data } = await supabase.rpc('get_salon_branding', { p_slug: slug })
// data: [] si el slug no existe o el salón está inactivo (sin error, para no ser un
//       oráculo de enumeración); si existe → una fila. Tomar data?.[0].
// fila: { name, slug, logo_url, primary_color, secondary_color }
```

- Devuelve **solo 5 columnas de marca** (`name`, `slug`, `logo_url`, `primary_color`,
  `secondary_color`); nunca datos fiscales/PII. El tipo de retorno cierra la superficie.
- Un salón **activo sin branding** aún se pinta: `logo_url = null` y `primary_color` cae
  al default `#111827` (LEFT JOIN + coalesce).
- Es `STABLE` con un único argumento → PostgREST admite también `GET` (cacheable en CDN):
  `GET /rest/v1/rpc/get_salon_branding?p_slug=mi-salon`.

### Bucket de Storage `salon-logos` (convención de ruta)

El **fichero** del logo (los bytes) vive en el bucket público `salon-logos`;
`salon_branding.logo_url` guarda su URL. Convención de clave de objeto:

```
salon-logos/{salon_id}/logo.<ext>
            └───┬────┘
      primer segmento = uuid del salón (clave del aislamiento)
```

- **El primer segmento SIEMPRE es el `salon_id`.** La política de escritura autoriza con
  `app.has_salon_role(salon_id_de_la_ruta, {owner,manager})`: un manager solo escribe bajo
  la carpeta de SU salón; no puede subir a `{otro_salon}/…`.
- **Nombre canónico recomendado:** `logo.png` (un logo por salón; upsert al cambiarlo). La
  autorización depende solo del primer segmento → valen nombres versionados para
  cache-busting (`logo-1737200000.webp`) sin tocar políticas.
- **Lectura pública** (`public = true`): los bytes se sirven sin autenticar, como un
  favicon. **Escritura** solo owner/manager; `anon` jamás escribe.
- **Límites:** ≤ 2 MiB; MIME `image/png|jpeg|webp|svg+xml|avif`.
- **URL pública del logo:**
  `{SUPABASE_URL}/storage/v1/object/public/salon-logos/{salon_id}/logo.png`.

### Configurar la marca desde el panel

Owner/manager de cada salón personaliza su marca en **Ajustes → Marca** (`/ajustes/marca`).
La página está gateada a owner/manager por el layout y por la capa de datos
(`@/lib/salon-branding/server`), que valida **en servidor** y opera con el cliente RLS de la
sesión (las políticas de FASE 4A ya restringen la escritura de `salon_branding` y del bucket
a owner/manager; nunca se usa `service_role`).

- **Logotipo** — *subir / reemplazar / quitar* como acciones inmediatas. Se acepta **PNG,
  JPG, WEBP, SVG, AVIF**, hasta **2 MiB** (validado en cliente para feedback y **revalidado
  en servidor**). El fichero se sube al bucket `salon-logos` bajo la clave canónica
  `{salon_id}/logo.<ext>` (`upsert`; se limpian logos previos con otra extensión) y su **URL
  pública** se guarda en `salon_branding.logo_url`. Un logo por salón (relación 1:1).
- **Colores** — *principal* (**obligatorio**; default `#111827`) y *acento* (**opcional**;
  vaciarlo = sin acento). Cada uno con muestrario nativo (`input[type=color]`) sincronizado
  con un campo hex `#RRGGBB` validado. Un **aviso de contraste AA** (ver abajo) señala —sin
  bloquear el guardado— si un color quedaría por debajo del mínimo legible.
- **Vista previa en vivo** — una maqueta (cabecera + botón de reserva) refleja logo y colores,
  **incluidos los cambios aún sin guardar**, con el mismo criterio de contraste que el panel.

### Tematizado dinámico del panel

El panel de gestión se **re-tinta con la marca del salón activo en runtime** (FASE 4B-1). El
layout del panel carga `getActiveSalonBranding()` en servidor e inyecta `<SalonBrandStyle>`;
el nav sustituye la marca genérica por el logo del salón. La lógica es pura y testeable:
`@/lib/salon-branding/theme` (sin red ni React; tests en
`src/tests/unit/salon-branding-theme.test.ts`).

- **Variables CSS acotadas.** `resolveBrandTheme` traduce los colores hex de la marca a
  **tripletes HSL en formato shadcn** (`H S% L%`) y deriva los tokens de acento —`--primary`,
  `--ring`, `--info`, `--accent`…— para tema **claro y oscuro**, emulando las relaciones ya
  calibradas del default violeta. `buildBrandThemeCss` los emite en un `<style>` inline
  **acotado a `[data-salon-brand]`** (el wrapper del panel): la marca **no** toca `:root`, así
  el login y las páginas sin salón conservan intacto el tema premium por defecto. Al
  renderizarse en servidor, las variables están en el primer pintado → **sin FOUC**.
- **Fallback limpio.** Si el salón no tiene marca válida (sin fila, o color primario
  inválido), `resolveBrandTheme` devuelve `null`, `SalonBrandStyle` no inyecta nada y **manda
  el tema por defecto** (acento violeta `#7c3aed`; el primario cae a `#111827` cuando aún no
  hay fila, igual que el `coalesce` de `get_salon_branding`).
- **Contraste WCAG AA.** El texto sobre el color de marca se elige por **contraste real**
  (fórmula WCAG 2.1 §1.4.3), no asumiendo blanco: se toma el foreground del sistema (claro u
  oscuro) que **maximiza** el contraste, de modo que una elección de color nunca deja un botón
  con texto ilegible. El umbral AA para texto normal es **4.5:1** (`WCAG_AA_TEXT`); en
  *Ajustes → Marca*, `assessFillLegibility` **avisa sin bloquear** cuando el mejor texto no
  llega a AA, y la vista previa usa `readableForegroundHex` para no divergir del panel real.

### Estado: panel hecho (FASE 4B-1), apps pendientes (FASE 4B-2)

El **backend** de productización (**FASE 4A**) está construido: entitlements, marca, bucket
de logos, lectura pública, feature-gating y el guardián de aislamiento (migraciones
`20260718100000`–`20260718160000`).

El **panel de gestión** (**FASE 4B-1**) ya es white-label dinámico: carga la marca del salón
activo en runtime y se re-tinta con ella, el logo sustituye a la marca genérica en la
cabecera, y owner/manager la configura en
[Ajustes → Marca](#configurar-la-marca-desde-el-panel) (ver
[Tematizado dinámico del panel](#tematizado-dinámico-del-panel)).

Lo que **falta** (**FASE 4B-2**) es re-apuntar las **apps cliente/staff** —hoy cableadas a
denueveanueve (nombre/colores/logo fijos)—, un solo código servido por subdominio, para que
carguen la marca del salón **en runtime** por slug/subdominio (consumiendo
`get_salon_branding` y el bucket `salon-logos`). El backend (4A) ya expone todo lo necesario;
**4B-2 es trabajo de front**. Ver [`docs/roadmap-productizacion.md`](./docs/roadmap-productizacion.md).

---

## Capa de pagos y facturación

El TPV, la caja y la facturación se apoyan en dos capas de dominio puras (sin React ni Supabase), cada una con su propio README:

| Capa | Responsabilidad | Estado |
|---|---|---|
| [`@/lib/payments`](./src/lib/payments/README.md) | Cálculo de **totales e IVA** (fuente única de caja y facturación) y **abstracción de pasarela** (`PaymentGateway`) | Pasarela **manual** (registro sin cobro real). SumUp/Stripe/Redsys pendientes |
| [`@/lib/invoicing`](./src/lib/invoicing/README.md) | Motor **Veri\*factu**: emisión, numeración sin huecos, huella SHA-256, QR de cotejo, documento imprimible y export del libro registro | Operativo en modo **NO VERI\*FACTU** |

**Principios clave (resumen; detalle en MANTENIMIENTO.md):**

- **Dinero en enteros de céntimos** en todo el sistema (nunca `float`). Los precios unitarios son **PVP con IVA incluido** (bruto): base y cuota se *extraen* del bruto.
- La **pasarela de pago está abstraída** tras la interfaz `PaymentGateway`. Hoy `getPaymentGateway()` devuelve siempre la implementación **manual**, que solo registra el método elegido y **no procesa ningún cobro real** (no habla con datáfono ni API). Enchufar un proveedor real (SumUp, Stripe, Redsys) es un **TODO**: se añade una clase que implemente `PaymentGateway` y un `case` en el selector, **sin tocar el TPV**.
- La factura genera un **registro inmutable** (`pos_invoices`): un trigger de base de datos bloquea `UPDATE`/`DELETE` incluso para `service_role`. Correcciones = **factura rectificativa**, nunca edición.

---

## Aviso de conformidad fiscal (Veri\*factu)

> 🛑 **ANTES DE USO REAL — LEER OBLIGATORIAMENTE**
>
> **1. La conformidad Veri\*factu debe validarla una gestoría/asesoría fiscal antes de emitir facturas con validez legal.**
> Este sistema implementa los mecanismos técnicos del Reglamento Veri\*factu (RD 1007/2023 y Orden HAC/1177/2024): registro de facturación de alta **inmutable**, **numeración correlativa sin huecos por serie**, **encadenamiento por huella SHA-256**, **desglose de IVA**, **sello de tiempo** y **QR de cotejo de la AEAT**. Aun así, **la conformidad de un sistema informático de facturación (SIF) depende de la configuración fiscal concreta del negocio** (series, tipos de IVA aplicables, recargo de equivalencia, exenciones, factura rectificativa, datos del emisor, etc.). **HAT3X no presta asesoramiento fiscal.** El titular del salón debe **validar la puesta en marcha con su gestoría** y asumir la responsabilidad legal de lo emitido.
>
> **2. El sistema opera en modo NO VERI\*FACTU (conserva pero NO remite).**
> Todos los documentos se rotulan **«NO VERI\*FACTU»** (banner y leyenda del QR). El sistema **conserva** la cadena de registros inalterable, pero **no los remite a la AEAT en tiempo real**. Es una modalidad prevista por el reglamento, no un envío automático.
>
> **3. El modo VERI\*FACTU (transmisión a la AEAT con certificado electrónico) es FASE FUTURA.**
> La remisión automática de cada registro a la AEAT mediante **certificado electrónico** (y el rotulado «VERI\*FACTU») **no está implementada**. Requiere certificado del obligado tributario, firma y envío al servicio web de la AEAT, gestión de respuestas/errores y almacenamiento de acuses. **No prometer transmisión a la AEAT al cliente hasta que esta fase se desarrolle y se valide.**
>
> **4. La pasarela de cobro es de registro manual (no cobra de verdad).**
> El TPV **registra** el medio de pago, pero **no ejecuta cobros** contra ningún datáfono ni proveedor. Integrar SumUp/Stripe/Redsys es un TODO (ver [Capa de pagos y facturación](#capa-de-pagos-y-facturación)).

---

## WhatsApp / Twilio

El sistema de mensajería opera en **dry-run por defecto**: ningún mensaje sale mientras `WHATSAPP_REMINDERS_ENABLED !== 'true'` o alguna credencial sea un placeholder.

Para activar WhatsApp en producción, ver la **[Guía de configuración Twilio](./MANTENIMIENTO.md#guía-de-configuración-twilio-para-producción)** en `MANTENIMIENTO.md`.

---

## Añadir componentes shadcn/ui

```bash
npx shadcn@latest add <componente>
# Ejemplo: npx shadcn@latest add dropdown-menu tooltip
```

Configuración en `components.json` (alias `@/components`, `@/lib/utils`).

---

## Testing

```bash
# Una pasada completa (unitarios + integración)
npm run test

# Con informe de cobertura
npm run test:coverage

# E2E (requiere servidor corriendo en localhost:3000)
npm run dev &
npm run test:e2e
```

Los tests unitarios cubren: disponibilidad horaria, zonas horarias, formateo de fechas/precios, esquemas Zod y validaciones de cliente, además de la **capa de pagos** (totales/IVA, cuadre de tenders) y el **motor de facturación** (cadena canónica y huella SHA-256, desglose de IVA, ticket F2 vs completa F1, export CSV/JSON del libro registro, QR y documento imprimible).

Los tests de integración cubren los Route Handlers de booking y la **suite de emisión Veri\*factu** (numeración sin huecos por serie, aislamiento multi-tenant y cascada de hash) con mocks de Supabase.

---

## Despliegue

1. Configura todas las variables de entorno en la plataforma (Vercel, Fly.io, etc.).
2. Asegúrate de que `NEXT_PUBLIC_SITE_URL` apunta al dominio de producción.
3. Aplica las migraciones en el proyecto Supabase de producción: `npx supabase db push`.
4. Verifica el build antes de desplegar: `npm run build && npm run typecheck`.

Para activar WhatsApp en producción, seguir la guía completa en [MANTENIMIENTO.md](./MANTENIMIENTO.md).

---

## Mantenimiento

Ver [MANTENIMIENTO.md](./MANTENIMIENTO.md) para:
- Troubleshooting de errores comunes (incluye TPV, caja/arqueo y facturación)
- Identidad del cliente por teléfono: modelo de cuenta, normalización E.164 y resolución de duplicados
- Verificación del teléfono del cliente (OTP): proveedor de SMS en Supabase y el interruptor `require_phone_verification`
- Modelo de datos TPV/facturación, flujo de caja y capa de pagos abstraída
- Conformidad fiscal Veri\*factu: validación por gestoría y fase futura VERI\*FACTU
- Guía de configuración Twilio paso a paso
- Procedimientos de actualización de dependencias
- Rotación de credenciales Supabase y Twilio
- Gestión de usuarios y tenants
