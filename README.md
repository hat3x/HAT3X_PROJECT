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
- [Funcionalidades](#funcionalidades)
- [Autenticación](#autenticación)
- [API pública de reservas](#api-pública-de-reservas)
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
│   │   │   └── dashboard/            # Panel resumen
│   │   ├── (public)/reservar/[slug]/ # Asistente de reserva online (público)
│   │   ├── api/public/booking/[slug] # API REST pública de reservas
│   │   ├── auth/callback/            # Intercambio de código OAuth / magic link
│   │   └── auth/signout/             # Cierre de sesión (POST)
│   ├── components/ui/                # Componentes shadcn/ui
│   ├── hooks/                        # Custom hooks de dominio
│   ├── lib/
│   │   ├── booking/                  # Disponibilidad, esquemas Zod, formatos de fecha/precio
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

Los tests unitarios cubren: disponibilidad horaria, zonas horarias, formateo de fechas/precios, esquemas Zod y validaciones de cliente.

Los tests de integración cubren los Route Handlers de booking con mocks de Supabase.

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
- Troubleshooting de errores comunes
- Guía de configuración Twilio paso a paso
- Procedimientos de actualización de dependencias
- Rotación de credenciales Supabase y Twilio
- Gestión de usuarios y tenants
