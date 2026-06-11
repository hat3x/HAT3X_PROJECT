# Fase 1.5 + Prompt para el nuevo proyecto

## 1) Fase 1.5 — Migración RLS para que el franquiciado vea/edite sus locales

```sql
-- Franquiciado puede VER sus locales (aunque estén inactivos)
CREATE POLICY "Franchisee views own locales"
ON public.locales
FOR SELECT
USING (franchisee_id = public.get_user_franchisee_id(auth.uid()));

-- Franquiciado puede EDITAR sus locales (horarios, teléfono, web, activo…)
-- No puede cambiar franchisee_id a otro
CREATE POLICY "Franchisee updates own locales"
ON public.locales
FOR UPDATE
USING (franchisee_id = public.get_user_franchisee_id(auth.uid()))
WITH CHECK (franchisee_id = public.get_user_franchisee_id(auth.uid()));
```

INSERT y DELETE de `locales` quedan **solo para admin** (ya cubierto por la policy existente "Admins can manage locales"). El alta de un nuevo local la hace hat3x, no el franquiciado.

---

## 2) Prompt para crear el nuevo proyecto "hat3x Console"

Copia y pega esto al crear el nuevo proyecto en Lovable. Recuerda conectarlo a la **misma Lovable Cloud** que este proyecto (mismo Supabase `tqgtbyhznzcadjoknvkf`).

> Crea **hat3x Console**, una app web única que sirve a dos tipos de usuarios según su rol en la base de datos compartida con el resto del ecosistema 100 Montaditos / Kitchen & Box:
>
> - **admin** (yo, hat3x): ve y gestiona todo (franquiciados, locales globales, pedidos globales, KPIs, mapa).
> - **franchisee**: ve solo sus propios locales, pedidos y ventas. Las RLS de Supabase ya filtran los datos por `franchisee_id` usando la función `get_user_franchisee_id(auth.uid())`. Confía en ellas, no dupliques filtros en frontend.
>
> Stack obligatorio:
> - React + TypeScript + Vite + Tailwind + shadcn/ui
> - Lovable Cloud (Supabase) — **conectar a la misma cloud que el proyecto Cliente QR**
> - react-router-dom, @tanstack/react-query, framer-motion
>
> Autenticación:
> - Email/password **y** Google (Lovable Cloud Managed). NO anonymous sign-ups. NO auto-confirm email.
> - Tras login, leer `user_roles` del usuario: si `admin` → layout admin completo; si `franchisee` → layout franquiciado; si `caja`/`cocina` → mensaje "esta app no es para tu rol, ve a Kitchen & Box" + logout.
>
> Identidad visual ("Luxury Dark"):
> - Fondo negro corporativo, acentos rojo corporativo, dorado premium.
> - Fuentes: Playfair Display (titulares) + DM Sans (UI).
> - Tokens HSL en `index.css` + `tailwind.config.ts`. NUNCA colores en componentes.
>
> Layout:
> - Sidebar vertical fija a la izquierda con navegación filtrada por rol.
> - Header superior con nombre del usuario, rol, switch de local activo (solo si admin tiene varios), botón logout.
>
> Rutas y secciones:
>
> Para **admin**:
> - `/franquiciados` — Tabla de franquiciados (nombre, email, estado Stripe, locales, activo). Botón "Crear franquiciado" que abre un dialog: nombre + email → llama a edge function `create-franchisee` (la implementaremos a continuación) → muestra el accountLink de Stripe Connect para enviar por email.
> - `/franquiciados/:id` — Detalle: datos, locales asignados, ventas, ingresos hat3x (suma de application_fee). Botón "Reenviar onboarding Stripe", "Desactivar".
> - `/locales` — Todos los locales con mapa (Leaflet, OpenStreetMap, gratis). Filtros por franquiciado, ciudad, activo. Click marca abre detalle.
> - `/locales/:id` — Editar local, ver pedidos, ventas.
> - `/pedidos` — Todos los pedidos globales con filtros: local, franquiciado, estado, fecha. Realtime.
> - `/ventas` — Dashboard con gráficas (recharts): ventas por día/semana/mes, top productos, top locales, comisión hat3x acumulada.
> - `/ajustes` — application_fee_percent global, gestión de roles de usuario.
>
> Para **franchisee** (mismas rutas pero filtradas por RLS, sin necesidad de filtros en código):
> - `/mis-locales` — Lista de sus locales. Click → editar horarios, teléfono, sitio web, activar/desactivar.
> - `/mis-pedidos` — Pedidos de sus locales. Realtime. Solo lectura.
> - `/mis-ventas` — Gráficas de sus ventas, ingresos brutos, comisión hat3x, ingresos netos.
> - `/mi-cuenta` — Datos del franquiciado, estado de Stripe Connect, botón "Abrir mi Express Dashboard" (llama a `create-stripe-dashboard-link`).
>
> Edge functions necesarias (las creará Lovable cuando se las pida):
> - `create-franchisee` — admin only. Crea user en auth, INSERT en `franchisees`, INSERT en `user_roles` (`role='franchisee'`, `local_id=franchisees.id`), crea cuenta Stripe Connect Express (ES), devuelve accountLink de onboarding.
> - `stripe-account-webhook` — escucha `account.updated` y `account.application.deauthorized` para mantener `stripe_onboarding_completed` y `activo`.
> - `create-stripe-dashboard-link` — franquiciado autenticado. Devuelve loginLink del Express Dashboard de su `stripe_account_id`.
>
> Secrets necesarios (los pediré con add_secret al implementar Stripe): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET_ACCOUNTS`.
>
> Base de datos: NO crear tablas nuevas. Usar las existentes: `franchisees`, `locales`, `pedidos`, `pedido_items`, `menu_productos`, `menu_categorias`, `user_roles`. El rol `franchisee` ya existe en el enum `app_role`. La función `get_user_franchisee_id(uuid)` ya existe.
>
> Primera entrega: solo autenticación + layout condicional por rol + listado/creación de franquiciados (sin Stripe todavía). Las edge functions de Stripe en una segunda iteración.

---

## 3) Configuración auth ahora en este proyecto

No hace falta tocar nada del cliente QR (es anónimo). La config de email/password + Google se hará en el **proyecto nuevo** cuando lo crees.

---

## Acciones al aprobar

1. Lanzo la migración SQL de Fase 1.5 (las 2 policies de `locales` para franquiciado).
2. Tú creas el proyecto nuevo con el prompt de arriba.
3. Cuando esté creado, me avisas y seguimos con las edge functions Stripe y la Fase 2 del cliente.
