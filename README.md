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
- [API pública de reservas](#api-pública-de-reservas)
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

## API pública de reservas

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/public/booking/[slug]` | Salón + catálogo (servicios y profesionales) |
| `GET` | `/api/public/booking/[slug]/availability` | Slots disponibles para fecha y servicio |
| `POST` | `/api/public/booking/[slug]` | Crea una reserva (estado `pending`) |

La API valida con Zod y usa el cliente admin de Supabase con validaciones de dominio explícitas (salón, servicio y profesional deben pertenecer al mismo tenant).

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
- Modelo de datos TPV/facturación, flujo de caja y capa de pagos abstraída
- Conformidad fiscal Veri\*factu: validación por gestoría y fase futura VERI\*FACTU
- Guía de configuración Twilio paso a paso
- Procedimientos de actualización de dependencias
- Rotación de credenciales Supabase y Twilio
- Gestión de usuarios y tenants
