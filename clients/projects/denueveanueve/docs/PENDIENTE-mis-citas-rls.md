# PENDIENTE — «Mis Citas»: la lectura *self* depende de RLS/RPC en el servidor de Salón OS

> **Estado:** PENDIENTE (dependencia de **servidor**, fuera del alcance del frontend)
> **Ámbito de esta app (denueveanueve):** cliente React/Vite sobre el proyecto Supabase de
> **Salón OS** (`jztoyekixcziaicrnlce`). La app **no** administra ese esquema ni sus políticas.
> **Regla dura:** si el cliente no puede leer sus citas, **NO se abren políticas amplias**
> desde aquí. Se avisa con honestidad en pantalla y se resuelve en el servidor.

---

## 1. Qué hace la pantalla hoy

`src/pages/Appointments.tsx` + `src/hooks/useAppointments.ts` listan las citas del
**cliente autenticado** leyendo `public.appointments` con el SDK de Supabase, con
**mínimo privilegio**:

- **Columnas explícitas** (nunca `SELECT *`): `id, starts_at, ends_at, status, service_id,
  professional_id, price_cents, currency`. Se **omiten** columnas que podrían llevar notas
  internas del staff (p. ej. `notes`, `cancelled_reason`) — RLS filtra **filas**, no columnas.
- **Doble filtro defensivo**: `.eq('customer_id', …).eq('salon_id', …)`. La FK compuesta
  `(customer_id, salon_id)` garantiza que van de la mano; nunca se leen citas de **otro
  cliente** ni de **otro salón**.
- **La seguridad real la impone RLS en el servidor**, no estos filtros: el cliente los
  añade como defensa en profundidad, pero quien decide qué filas ve el usuario es la
  política RLS de `appointments`.

La app **asume** que en Salón OS existe una política/`RPC` **self de solo lectura** que
deja a un cliente autenticado ver **solo sus propias** citas (los comentarios del código la
llaman `self_select_own_appointments`). **Esa política vive en el servidor de Salón OS y no
se puede verificar desde este repositorio.**

> ⚠️ El directorio local `supabase/migrations/` es el esquema **legacy de Lovable** (usa
> `start_at`, `location_id`, enum en MAYÚSCULAS) y **NO** es la base de datos en producción.
> La base real es la de Salón OS (`starts_at`, `salon_id`, `professional_id`, `price_cents`).
> No edites esas migraciones para «arreglar» esto: no gobiernan la BD que la app consulta.

---

## 2. El riesgo (por qué esto es un PENDIENTE)

Si la política *self* **no está activa** en Salón OS, hay dos comportamientos distintos:

| Situación en el servidor | Respuesta de PostgREST | Qué percibe el usuario |
|---|---|---|
| Falta el **GRANT** de `SELECT` al rol `authenticated` sobre la tabla | **Error** `42501 permission denied` | Se puede **detectar** → aviso honesto |
| RLS habilitada pero **sin política SELECT** para el cliente | **0 filas, sin error** | Indistinguible de «no tienes citas» |

- El **primer caso** (rechazo explícito) **sí** se detecta y se maneja: ver §3.
- El **segundo caso** (RLS activa pero sin política que permita al cliente) devuelve una
  lista **vacía sin error**. Desde el cliente **no hay forma fiable** de distinguirlo de un
  cliente que realmente no tiene citas. Es una **limitación conocida** y por eso la
  resolución correcta es **de servidor** (crear la política), no un parche de cliente.

**Lo que NO se hace nunca desde el frontend:** ampliar el acceso (leer sin filtro de
`customer_id`/`salon_id`, usar `service_role`, exponer una key con más permisos, o pedir al
servidor una política permisiva) para «hacer que salgan las citas». Eso rompería el
aislamiento entre clientes y salones. La barrera es intencional.

---

## 3. Qué añade esta subtarea (frontend, honesto y seguro)

1. **`isAccessDeniedError(error)`** (`src/lib/appointments.ts`, función pura y testeada):
   reconoce el rechazo de permiso por código Postgres `42501` (y, a la defensiva, por el
   texto «permission denied» / «row-level security»). Cualquier otro fallo (red, 5xx) se
   trata como **transitorio/reintentable**.
2. **`accessBlocked`** en `useAppointments()`: es `true` cuando la lectura de citas **o** de
   la ficha se rechaza por permiso. Es un subconjunto de `isError`.
3. **`BlockedNotice`** en `Appointments.tsx`: cuando `accessBlocked`, la pantalla muestra un
   **aviso honesto** (tono informativo, no un error de red que invite a reintentar en vano):
   «Tus citas aún no están disponibles aquí — es un permiso del sistema que todavía no está
   habilitado». Ofrece **reservar** y **reintentar** (útil en cuanto el servidor active el
   permiso), pero **no** intenta ningún acceso alternativo.

Con esto, el caso detectable degrada con honestidad y el caso silencioso queda documentado.

---

## 4. Resolución (SERVIDOR · Salón OS · fuera del alcance de esta app)

Quien administre el proyecto Supabase de Salón OS debe garantizar que un cliente
autenticado pueda leer **solo sus** citas. Patrón recomendado (idiomático Supabase):

```sql
-- En el proyecto de Salón OS (NO en supabase/migrations de esta app).
-- 1) El rol de la app necesita el GRANT de lectura (si aún no lo tuviera):
GRANT SELECT ON public.appointments TO authenticated;

-- 2) Política RLS *self* de SOLO LECTURA, acotada a la ficha del propio usuario
--    y al salón de esa ficha (la FK compuesta mantiene customer_id ↔ salon_id):
CREATE POLICY self_select_own_appointments
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT c.id
      FROM public.customers c
      WHERE c.user_id = (SELECT auth.uid())   -- envolver auth.uid() en SELECT: se evalúa
                                              -- 1 vez (initplan), no por fila → más rápido
    )
  );
```

Notas para quien lo implemente en el servidor:
- **Solo `FOR SELECT`.** La app «Mis Citas» es de **lectura**. Crear/cancelar/reprogramar,
  si algún día se abre, debe ir por una **RPC controlada** (`SECURITY DEFINER` con
  validaciones), no ampliando esta política a `INSERT/UPDATE/DELETE`.
- **No usar una política permisiva** (`USING (true)`) ni basada solo en `salon_id`: eso
  dejaría a un cliente ver las citas de **todos** los clientes del salón.
- Alternativa equivalente: exponer una **RPC** `get_my_appointments()` `SECURITY DEFINER`
  que devuelva exactamente esas columnas filtradas por `auth.uid()`; el frontend cambiaría
  la consulta a `supabase.rpc(...)`. Cualquiera de las dos vías es válida; la política
  directa es la más simple.

### Cómo verificar en el servidor

```sql
-- ¿Existe una política SELECT para el cliente en appointments?
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'appointments';

-- ¿El rol authenticated tiene GRANT de SELECT?
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'appointments' AND grantee = 'authenticated';
```

Prueba funcional (con un JWT de cliente real): la lectura debe devolver **solo** sus citas;
con el JWT de otro cliente, **cero** filas de las ajenas.

---

## 5. Definición de «hecho» (para cerrar este PENDIENTE)

- [ ] En Salón OS existe una política `SELECT` *self* (o RPC equivalente) sobre
      `public.appointments`, acotada por `customer_id ∈ (customers del auth.uid())`.
- [ ] El rol `authenticated` tiene `GRANT SELECT` sobre la tabla.
- [ ] Con un cliente autenticado, `GET /appointments` devuelve **solo** sus citas; con otro
      cliente no aparece ninguna ajena; con otro salón, tampoco.
- [ ] La pantalla «Mis Citas» deja de mostrar `BlockedNotice` y lista las citas reales.
- [ ] (Opcional) Actualizar los comentarios del código que citan la migración
      `20260719100000` para que apunten a la política/RPC realmente desplegada en el servidor.

---

### Archivos del frontend implicados
- `src/lib/appointments.ts` — `isAccessDeniedError` (clasificación pura del rechazo).
- `src/lib/appointments.test.ts` — cobertura de la clasificación.
- `src/hooks/useAppointments.ts` — expone `accessBlocked`.
- `src/pages/Appointments.tsx` — `BlockedNotice` (aviso honesto).
- `src/lib/i18n.tsx` — `appointments.blocked.title` / `appointments.blocked.body` (es/en).
