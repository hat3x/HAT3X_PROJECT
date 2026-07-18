# denueveanueve — App de cliente

> Aplicación web (PWA) de fidelización y perfil de cliente para el salón
> **denueveanueve**, conectada al backend **Salón OS** sobre Supabase.

Stack: **Vite · React · TypeScript · @supabase/supabase-js · Tailwind + shadcn/ui**

---

## Qué es

App móvil-first para clientes del salón: alta de cuenta, perfil, y programa de
fidelización (puntos, cupón de bienvenida, recompensas). Originalmente generada
en Lovable, **desde la migración apunta al proyecto Salón OS** (multi-tenant) y
ya **no depende de Lovable** para funcionar.

La app es **mono-salón**: todas las lecturas "self" del cliente (`customers`,
`loyalty_accounts`, `welcome_coupons`, `rewards`, `points_movements`) se filtran
además por `salon_id = VITE_SALON_ID`, coherente con las FKs compuestas
`(id, salon_id)` del esquema y como defensa en profundidad sobre las RLS.

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

## Requisitos

- **Node.js 18+** y **npm** (o [bun](https://bun.sh), hay `bun.lock` en el repo).
- Acceso al proyecto Supabase de **Salón OS** (URL + anon/publishable key) y al
  `VITE_SALON_ID` del salón denueveanueve.

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
| `VITE_SALON_ID` | ✅ | UUID del salón denueveanueve en Salón OS. Filtra todas las lecturas self. |
| `VITE_SALON_SLUG` | — | Slug público del salón (informativo; por defecto `denueveanueve`). |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | Sólo si se re-activan las suscripciones (Club/Premium). |

> **Arranque estricto.** Si falta `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
> o `VITE_SALON_ID`, la app lanza un error claro al iniciar en lugar de fallar en
> silencio con queries vacías. Ver
> [`src/integrations/supabase/client.ts`](src/integrations/supabase/client.ts) y
> [`src/lib/salon.ts`](src/lib/salon.ts).

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
     p_salon_id: SALON_ID,   // VITE_SALON_ID
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

   | Mensaje | Causa |
   |---|---|
   | `INVALID_PHONE` | El teléfono no tiene un formato válido. |
   | `PHONE_CONFLICT` | El teléfono ya pertenece a otra cuenta/ficha. |

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
│   ├── salon.ts                    # SALON_ID / SALON_SLUG (lee VITE_SALON_*)
│   └── i18n.tsx                    # traducciones
├── pages/
│   ├── Register.tsx                # alta + enlace por teléfono vía RPC
│   ├── Home.tsx / Profile.tsx / Loyalty.tsx  # pantallas operativas
│   ├── BookAppointment.tsx / Appointments.tsx # "Próximamente" (3B-2)
│   └── _deferred/reservations-3B-2/           # flujos de reservas conservados
└── components/                     # UI (shadcn/ui), navegación, guards
```

---

## Despliegue

Build estático (`npm run build` → `dist/`) desplegable en cualquier hosting de
estáticos (Vercel, Netlify, etc.). Recuerda definir las variables `VITE_*` en el
entorno del proveedor antes de construir; se inyectan **en tiempo de build**, no
en runtime.
