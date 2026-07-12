# Salon OS

Sistema de gestión integral para salones de belleza. Next.js 14 (App Router) + TypeScript strict + Tailwind CSS + shadcn/ui + Supabase (auth con SSR).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14 (App Router, `src/`) |
| Lenguaje | TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`) |
| Estilos | Tailwind CSS 3.4 + shadcn/ui (CSS variables, base slate) |
| Backend | Supabase (auth vía `@supabase/ssr`) |

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar entorno
cp .env.example .env.local
# Rellenar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY
# (Supabase Dashboard → Project Settings → API)

# 3. Arrancar en desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servir build de producción |
| `npm run lint` | ESLint (en la primera ejecución `next lint` ofrece crear la config) |
| `npm run typecheck` | `tsc --noEmit` con strict completo |

## Estructura

```
src/
├── app/
│   ├── (auth)/login/          # Página de login (pública)
│   ├── (dashboard)/dashboard/ # Panel (protegido por middleware)
│   ├── auth/callback/         # Intercambio de código OAuth/magic link
│   ├── auth/signout/          # Cierre de sesión (POST)
│   ├── layout.tsx             # Root layout (fuente Inter, lang=es)
│   ├── page.tsx               # Landing
│   └── globals.css            # Tailwind + variables shadcn/ui
├── components/ui/             # shadcn/ui (button, input, label, card)
├── lib/
│   ├── supabase/              # Clientes browser / server / middleware
│   └── utils.ts               # cn()
├── types/database.ts          # Tipos Supabase (regenerar con supabase gen types)
└── middleware.ts              # Refresco de sesión + protección de rutas
```

## Autenticación

- **Rutas protegidas:** todo lo que empieza por `/dashboard` exige sesión (redirige a `/login?next=...`).
- **Login:** email + contraseña (`signInWithPassword`). Los usuarios se crean desde el Dashboard de Supabase (Authentication → Users) o vía invitación.
- **Sesión SSR:** el middleware (`src/middleware.ts`) refresca la cookie de sesión en cada request usando `@supabase/ssr`.
- **Añadir OAuth:** habilitar el proveedor en Supabase y usar `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${NEXT_PUBLIC_SITE_URL}/auth/callback` } })`. El callback ya está implementado.

## Añadir componentes shadcn/ui

```bash
npx shadcn@latest add dialog dropdown-menu table
```

La configuración vive en `components.json` (alias `@/components`, `@/lib/utils`).

## Tipos de base de datos

Cuando exista el esquema, regenerar:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
```

Todos los clientes de `src/lib/supabase/` ya están tipados con `Database`.

## Mantenimiento

Ver [MANTENIMIENTO.md](./MANTENIMIENTO.md).
