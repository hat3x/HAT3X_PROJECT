# Auditoría sub-1 — Flujo de registro/autenticación y punto de inserción de la verificación de teléfono (OTP)

> **Cliente:** denueveanueve · **Rama:** `hat3x/HAT3X-030` · **Tipo:** auditoría (solo lectura, sin cambios de código) · **Autor:** Code Reviewer (HAT3X, vertical webs-apps)
>
> **Objetivo del encargo:** mapear el `signUp` con email+contraseña, la llamada existente a `register_my_customer_account` y el manejo de la sesión de Supabase, para saber **dónde insertar el paso de verificación de teléfono** sin romper **login**, **fidelización**, **branding dinámico** ni **reservas**.

---

## 1. Resumen ejecutivo (TL;DR)

- **El punto de inserción es único, claro y ya está marcado en el código:** dentro de `src/pages/Register.tsx`, en el hueco **entre el paso 2 (sesión obtenida)** y el **paso 3 (RPC `register_my_customer_account`)** — exactamente donde hoy vive el comentario `TODO(OTP · fase posterior)` (`Register.tsx:88-90`). La verificación por SMS debe ejecutarse **antes** de llamar a la RPC de enlace por teléfono, y la RPC solo debe llamarse si el OTP fue correcto.
- **Radio de impacto = mínimo.** Ese punto es una costura natural del flujo:
  - **Login:** intacto. `signIn` (`auth.tsx:80-83`) no llama a la RPC ni comprueba verificación. Los usuarios existentes no se ven afectados.
  - **Branding dinámico:** intacto. `SalonProvider` es **ancestro estricto** de `AuthProvider` en el árbol (`App.tsx:51-52`); resuelve el salón con la RPC pública `get_salon_branding` **antes** de que exista sesión. Cero acoplamiento con el registro.
  - **Fidelización:** intacto. En el esquema **vivo** de Salón OS, la ficha `customers` (y con ella la pertenencia a fidelización) la crea/enlaza la **propia RPC del paso 3**; gatearla tras el OTP significa que la fidelización simplemente **arranca tras la verificación**, sin estado a medias.
  - **Reservas:** intacto — y de hecho **mejora**. Reservar usa la **API pública anónima** (`salon-os-api.ts`), sin sesión. El prellenado de contacto usa `phone_e164`, que solo se rellena cuando la RPC enlaza la ficha (ya post-OTP): el teléfono prellenado pasa a ser un teléfono **verificado**.
- **Hallazgo crítico de esquema:** el esquema **vivo** de `customers` (el que refleja `src/integrations/supabase/types.ts`, contra el que compila la app) **no tiene** `status`, ni `phone_verified_at`, ni `email_verified_at`, ni el enum `customer_status`. La maquinaria `PENDING_VERIFICATION` / `handle_new_user` que aparece en `supabase/migrations/` es **histórica y está superada** por el esquema de Salón OS. → No hay un "estado de verificación" en BD del que fiarse hoy; si se quiere persistir ese hecho, o bien se apoya en el nativo `auth.users.phone_confirmed_at` de Supabase, o bien lo añade **Salón OS** en servidor.
- **Dependencia (línea roja de alcance):** el OTP en cliente **por sí solo no cierra** el agujero de secuestro de ficha. `register_my_customer_account` es una **RPC de servidor** invocable directamente con la anon key (saltándose la UI). El control autoritativo de propiedad del teléfono debe reforzarse **en servidor (Salón OS)** — fuera de este repo. Se documenta como dependencia entre equipos para la fase de implementación.

**Veredicto:** la inserción es segura y de bajo riesgo dentro de `denueveanueve`; el trabajo de este repo (UI del OTP + reordenar el paso 3) es autónomo. La garantía **completa** anti-secuestro requiere un cambio coordinado en la RPC de Salón OS.

---

## 2. Alcance y método

Auditoría **de solo lectura** sobre `clients/projects/denueveanueve`. Se leyó de primera mano el flujo de auth completo (cliente + migraciones), los cuatro subsistemas que no deben romperse y los tipos generados del esquema vivo. Las afirmaciones se citan con `archivo:línea`. Para endurecer las conclusiones se lanzó además un **workflow multi-agente** que (a) mapeó en paralelo el acoplamiento de cada subsistema y (b) verificó de forma **adversarial** el punto de inserción propuesto y la brecha de servidor (ver §12).

**Stack:** Vite + React + TypeScript + Supabase (`@supabase/supabase-js`), TanStack Query, react-router-dom, shadcn/ui. La app comparte el **mismo proyecto Supabase que Salón OS** (`jztoyekixcziaicrnlce`, ver `client.ts:2-4`).

---

## 3. Arquitectura de proveedores (por qué el branding no se toca)

Orden de montaje en `src/App.tsx:48-94`:

```
QueryClientProvider
└─ I18nProvider
   └─ SalonProvider        ← branding: resuelve salón vía get_salon_branding (RPC pública). NO necesita sesión.
      └─ AuthProvider      ← aquí nace y vive la sesión de Supabase
         └─ BrowserRouter
            ├─ PinOverlay   ← overlay de PIN de visita (depende de customerId, no de OTP)
            └─ Routes
               ├─ /register, /login, /forgot-password        (públicas)
               └─ /home, /loyalty, /profile, /book, …        (envueltas en <RequireAuth>)
```

**Consecuencia clave:** `SalonProvider` es **ancestro** de `AuthProvider`. El tema white-label (color, nombre, `theme-color`, `document.title`) se resuelve **antes** del login y con **datos públicos** (`salon-context.tsx:85-151`). Ningún cambio en el flujo de registro puede afectar al branding: son capas independientes.

---

## 4. El flujo actual, paso a paso

Todo el orquestado vive en `src/pages/Register.tsx` (`handleSubmit`, líneas 35-115):

| Paso | Qué hace | Dónde |
|---|---|---|
| Validación cliente | términos aceptados; nombre/apellidos ≥ 2 chars | `Register.tsx:37-46` |
| **1. `signUp`** | `supabase.auth.signUp({ email, password, options:{ data: metadata, emailRedirectTo } })`. Metadata: `first_name, last_name, phone, date_of_birth, consent_marketing, consent_whatsapp` | `Register.tsx:57-64` → `auth.tsx:63-78` |
| Rama "confirmar correo" | si el proyecto exige confirmación de email, **no hay sesión** todavía → toast "revisa tu correo" y `navigate('/login')`. El enlace por teléfono se aplaza | `Register.tsx:75-81` |
| **2. Sesión** | `signUpData.session ?? (await supabase.auth.getSession()).data.session` | `Register.tsx:75` |
| **3. RPC enlace por teléfono** | `supabase.rpc('register_my_customer_account', { p_salon_id, p_phone, p_full_name, p_email })` → outcome `created` \| `linked` \| `already_linked` → `navigate('/home')` | `Register.tsx:91-114` |
| **Hueco del OTP** | `TODO(OTP · fase posterior)`: verificar el teléfono por SMS **antes** de confiar en el enlace | `Register.tsx:88-90` |

`salonId` **no está cableado**: se deriva del salón resuelto en runtime — `const { id: salonId } = useSalon()` (`Register.tsx:19-20`).

Traducción de errores (ya existente, reutilizable sin cambios):
- `mapAuthError` para errores de Supabase Auth (`auth.tsx:110-135`).
- `mapRegisterError` para la RPC: `INVALID_PHONE`, `FEATURE_NOT_ENABLED` (gating de add-on, autoritativo en servidor), `PHONE_CONFLICT`/`P0001` (`auth.tsx:154-167`).

---

## 5. Manejo de la sesión de Supabase

En `src/lib/auth.tsx` (`AuthProvider`, líneas 31-101):

- **Cliente** (`integrations/supabase/client.ts:23-29`): `persistSession: true`, `autoRefreshToken: true`, `storage: localStorage`.
- **Escucha síncrona antes de pedir la sesión** (regla de oro de Supabase para evitar el deadlock): `onAuthStateChange` registrado de forma síncrona, callback **sin** llamadas async al cliente de auth; solo actualiza estado (`auth.tsx:42-47`).
- **Rehidratación** al montar con `getSession()` (`auth.tsx:50-55`).
- **API expuesta por contexto** (`useAuth`): `user, session, loading, signUp, signIn, signOut, resetPassword` (`auth.tsx:11-19, 96-103`).
- **Guard de rutas** `RequireAuth` (`components/RequireAuth.tsx`): mientras `loading` → spinner; si **no** `user` → `Navigate to /login`; **solo comprueba presencia de `user`**, nunca un estado de verificación (`RequireAuth.tsx:5-21`).

> **Implicación para el OTP:** la sesión ya está activa entre el paso 2 y el 3 (cuando el proyecto no exige confirmación de email), por lo que `auth.uid()` está disponible — condición necesaria tanto para la RPC como para el flujo nativo de OTP de teléfono de Supabase (`updateUser({ phone })` / `verifyOtp`).

---

## 6. La RPC `register_my_customer_account`

- **Firma** (tipos generados, `types.ts:1575-1583`): `Args { p_salon_id: string; p_phone: string; p_full_name: string; p_email?: string } → Returns: Json`.
- **Desenlaces** (documentados en `Register.tsx:83-96`, `README.md:490-517`): `created` (creó la cuenta de cliente para ese teléfono), `linked` (enlazó una ficha existente creada por el salón), `already_linked` (ya estaba enlazada a esta cuenta). Los tres son éxito para el usuario.
- **Errores** (EXCEPTION `P0001`): `INVALID_PHONE`, `FEATURE_NOT_ENABLED` (add-on no contratado; gating en servidor), `PHONE_CONFLICT`.
- **Dónde vive:** **NO está en las migraciones de este repo.** `register_my_customer_account` solo aparece en `README.md`, `VERIFICACION.md`, `Register.tsx`, `auth.tsx` y `types.ts` (uso/documentación), nunca como `CREATE FUNCTION`. Es una **RPC del servidor Salón OS**; este repo únicamente la **invoca**.
- **Estado de seguridad actual** (reconocido en `README.md:511-517`): *"Hoy el enlace por teléfono se confía sin verificar que el teléfono pertenece realmente a quien se registra."* Ese es precisamente el riesgo que el OTP debe cerrar.

---

## 7. Hallazgo clave — divergencia entre migraciones del repo y esquema vivo

Las migraciones de `supabase/migrations/` son el esquema **original de Lovable**; el esquema **vivo** de Salón OS (contra el que compila la app, reflejado en `types.ts`) ha **divergido**. Comparativa de la tabla `customers`:

| Aspecto | Migraciones del repo (histórico) | Esquema vivo (`types.ts:240-291`) |
|---|---|---|
| Identidad | `first_name`, `last_name` | `full_name` |
| Teléfono | `phone` (UNIQUE) | `phone`, **`phone_e164`** |
| **Estado** | **`status` (enum `customer_status`)** = `PENDING_VERIFICATION`/`ACTIVE`/`DISABLED` | **ausente** |
| **Verificación** | **`phone_verified_at`, `email_verified_at`** | **ausentes** |
| Multi-tenant | (sin `salon_id`) | **`salon_id`** (FK a `salons`) |
| Alta de la ficha | trigger `handle_new_user` en `auth.users` INSERT (`…233235`, `…130511`) | la crea/enlaza la **RPC `register_my_customer_account`** (paso 3) |

**Verificaciones cruzadas:**
- El enum `customer_status` **no** está en los Enums vivos (`types.ts:1586-1768` lista `appointment_status`, `coupon_status`, `pos_sale_status`, `pos_session_status`, `reminder_status`, `reward_status` — **no** `customer_status`).
- **Ningún código cliente lee `customers.status` ni `phone_verified_at`.** Todos los `.status` del `src` son de `appointments.status` (otra tabla) o del overlay de PIN de visita (`PinOverlay.tsx:29`, tabla `visit_pins`).

**Consecuencias para el diseño del OTP:**
1. **No existe hoy un gate de verificación que romper** (ni en RLS, ni en `RequireAuth`, ni en cliente). Insertar el OTP no colisiona con ninguna lógica de estado preexistente.
2. **Tampoco existe una columna de estado viva que aprovechar.** Si el hecho "teléfono verificado" debe persistirse en BD, hay dos vías:
   - **Nativa de Supabase Auth:** usar `auth.users.phone` + `auth.users.phone_confirmed_at` (los rellena `verifyOtp`). No requiere cambios de esquema de negocio, pero **sí** un proveedor SMS configurado en Supabase Auth (coste + config).
   - **Servidor Salón OS:** añadir una columna/param de verificación y que la RPC la exija. Fuera de este repo.

---

## 8. Mapa de acoplamiento por subsistema

Qué depende de la sesión / de la ficha, y qué pasa si el OTP se inserta en el paso 3 de `Register.tsx`:

| Subsistema | Acoplamiento con auth | ¿Lee estado de verificación? | Cuándo nace su estado | ¿Rompe con el OTP en el paso 3? |
|---|---|---|---|---|
| **Login / sesión** | `signIn` (`auth.tsx:80-83`); guard `RequireAuth` sobre `user` | No | Sesión al hacer login/signup | **No.** `signIn` no toca la RPC ni el OTP. |
| **Fidelización** | `Loyalty.tsx` lee `customers`(self)→`loyalty_accounts`/`points_movements`/`rewards`/`welcome_coupons` por RLS `auth.uid()` (`Loyalty.tsx:55-152`); `useCustomer.ts` | No (solo `id, full_name, phone, phone_e164, email`) | En el vivo, la ficha la crea la **RPC** del paso 3 | **No.** La fidelización arranca tras la verificación; sin estado a medias. |
| **Branding dinámico** | **Ninguno** — ancestro de `AuthProvider`; RPC pública `get_salon_branding` (`salon-context.tsx:85-151`, `App.tsx:51-52`) | No | Antes del login | **No.** Capas independientes. |
| **Reservas** | API pública anónima (`salon-os-api.ts`), **sin sesión**; prellenado con `phone_e164`/`phone` de la ficha self (`booking.ts:257-264`, `useCustomer.ts`) | No | Reserva = servidor; prellenado = ficha (post-RPC) | **No; mejora.** El teléfono prellenado pasa a estar verificado. |

---

## 9. ¿Dónde insertar la verificación de teléfono?

### Punto exacto
`src/pages/Register.tsx`, **entre la línea 81 (sesión confirmada) y la 91 (llamada a la RPC)** — el hueco del `TODO(OTP)` (`Register.tsx:82-90`). Flujo objetivo:

```
1. signUp(email, password, metadata)         →  crea auth.users + obtiene sesión   (sin cambios)
2. obtener sesión                              →  auth.uid() disponible               (sin cambios)
   └─ (si no hay sesión: "revisa tu correo" → /login)                                 (sin cambios)
2b. ▶ NUEVO — Verificación de teléfono (OTP)
      updateUser({ phone })  → SMS  → verifyOtp({ phone, token, type:'phone_change' })
      └─ éxito ⇒ auth.users.phone_confirmed_at queda sellado
      └─ fallo/cancelar ⇒ NO se llama a la RPC; cuenta queda sin ficha enlazada
3. register_my_customer_account(...)           →  SOLO tras OTP correcto
4. navigate('/home')
```

### Estrategias comparadas

| | **A — OTP antes de la RPC (recomendada)** | B — OTP como gate de `status` en BD | C — Verificación diferida (al primer login) |
|---|---|---|---|
| Dónde | `Register.tsx` paso 2b | requiere columna/estado servidor + gates | tras `signIn`, antes de acceder |
| Radio de impacto | **Mínimo** (una costura del flujo) | Alto (no hay `status` vivo; añadir gates en RLS/rutas) | Medio (toca login y navegación) |
| Encaja con el esquema vivo | **Sí** (no depende de `status`) | No (columna inexistente hoy) | Parcial |
| Cierra el secuestro de ficha | Sí, en cliente (falta refuerzo servidor, §11) | Sí si el servidor lo exige | Tarde (la ficha ya pudo enlazarse) |
| Coincide con el `TODO` existente | **Sí** | No | No |

### Mecánica recomendada (OTP nativo de Supabase)
Al ser cuentas email+contraseña, el camino de menor fricción es el **OTP de teléfono nativo** de Supabase Auth: `supabase.auth.updateUser({ phone })` dispara el SMS y `supabase.auth.verifyOtp({ phone, token, type: 'phone_change' })` lo confirma, sellando `auth.users.phone_confirmed_at`. Ventaja: produce un hecho **verificable en servidor** que la RPC puede exigir (§11). **Requisito:** proveedor SMS configurado en Supabase Auth (Twilio/MessageBird/Vonage) → coste + configuración (dependencia de infraestructura, no de código).

### ⚠️ Restricción de mecanismo (crítica — surgida de la verificación adversarial, §12)
El cliente de Supabase es **único y compartido** (`client.ts:23-29`, `persistSession`), y el `AuthProvider` aplica **ciegamente** cualquier evento de `onAuthStateChange` (`auth.tsx:42-47`). Por tanto **el mecanismo del OTP importa**:
- ✅ **Correcto:** `updateUser({ phone })` + `verifyOtp({ type: 'phone_change' })` → **muta el teléfono de la MISMA identidad**; `auth.uid()` no cambia, la sesión email+contraseña se conserva y no se rompe el enlace con la ficha. También válido: un endpoint **fuera de banda** en Salón OS que envíe/valide el SMS **sin** tocar Supabase Auth en el cliente compartido.
- ❌ **Prohibido:** `signInWithOtp({ phone })` (o cualquier `verifyOtp` de tipo `sms`/inicio de sesión) → **crea una identidad de teléfono nueva**, intercambia la sesión del cliente compartido y **re-apunta `auth.uid()`**. Como `RequireAuth` (`RequireAuth.tsx:16`), `Index` (`Index.tsx:11`) y `useCustomer` (`useCustomer.ts:37`) dependen de `auth.uid()`, el usuario acabaría en una ficha distinta/vacía. **Esto sí rompe login/sesión.**

---

## 10. Análisis de "sin romper X" (radio de impacto)

- **Login:** el OTP vive en el registro; `signIn` y `RequireAuth` no cambian. Usuarios existentes sin impacto. ✅
- **Fidelización:** las lecturas (`Loyalty.tsx`, `useCustomer.ts`) van por RLS `auth.uid()` y **no** dependen de estado de verificación; la ficha nace en la RPC (paso 3), que ahora se gatea tras OTP → arranque limpio, sin filas a medias. ✅
- **Branding:** resuelto por encima de auth con datos públicos; imposible de afectar desde el registro. ✅
- **Reservas:** API pública sin sesión; el prellenado usa `phone_e164` que solo existe tras el enlace (post-OTP) → sigue funcionando y con un teléfono verificado. ✅
- **Overlay de PIN de visita** (`PinOverlay.tsx`): depende de `customerId` (post-ficha); si el OTP falla no hay ficha y el overlay simplemente permanece inactivo — el mismo comportamiento que hoy antes de existir la ficha. ✅
- **Caso borde a cubrir en implementación:** si el proyecto **exige confirmación de email**, en el paso 2 aún no hay sesión y el flujo actual desvía a `/login` (`Register.tsx:75-81`). El OTP de teléfono necesita sesión (`auth.uid()`), así que en ese modo el OTP debería ejecutarse **tras el primer login**, no en el registro. Debe decidirse el modo de confirmación de email antes de implementar.

---

## 11. Riesgos y dependencias

1. **[Alta] Refuerzo en servidor imprescindible.** `register_my_customer_account` es una RPC de servidor invocable con la anon key **saltándose la UI**; el OTP en cliente no impide llamarla directamente con un teléfono ajeno. La garantía real exige que la **RPC (Salón OS)** compruebe la propiedad del teléfono — p. ej. leer `auth.users.phone_confirmed_at`/`phone` para `auth.uid()` y **rechazar** el enlace si el teléfono confirmado ≠ `p_phone`. **Fuera de este repo → dependencia con el equipo de Salón OS.**
2. **[Media] Proveedor SMS.** El OTP nativo requiere configurar un proveedor en Supabase Auth (coste por SMS, rate-limits, plantillas). Decisión de infraestructura previa a la implementación.
3. **[Media] Modo de confirmación de email.** Determina si el OTP va en el registro (hay sesión) o tras el primer login (ver §10, caso borde).
4. **[Baja] Cuentas huérfanas.** Si el OTP falla, queda un `auth.users` sin ficha enlazada. Conviene una ruta de reintento (reenviar OTP / retomar enlace en el siguiente login). No rompe nada, pero es UX a diseñar.
5. **[Baja] Deuda de esquema.** Las migraciones históricas (`status`, `phone_verified_at`, `handle_new_user`) inducen a error respecto al esquema vivo. Recomendable anotarlo (no es bloqueante para el OTP).

---

## 12. Verificación adversarial (workflow multi-agente)

Se mapearon los 4 subsistemas en paralelo (4 agentes) y se **intentó refutar** de forma adversarial las dos afirmaciones clave (2 agentes). **Ambos veredictos se sostienen con confianza alta.**

### Veredicto 1 — "La Estrategia A es el punto de mínimo impacto y no rompe login/fidelización/branding/reservas"
**Sostenido (alta confianza).** No se pudo refutar a nivel de arquitectura: los 4 subsistemas están desacoplados de la RPC y **ninguno lee estado de verificación** (`grep` confirma **cero** lecturas de `phone_verified_at`/`email_verified_at` y que todo `.status` es de otras tablas). Matices que el revisor obliga a documentar:
1. **El mecanismo del OTP es una precondición vinculante** (recogido en §9): un OTP que intercambie la sesión del cliente compartido **sí** rompería login. Con `phone_change` (misma identidad) o endpoint fuera de banda, no.
2. **Gatear la RPC endurece el enlace, pero NO restringe el acceso a la app.** Como la RLS filtra por `auth.uid() = user_id` (no por `status`), un usuario con sesión pero sin OTP sigue entrando a `/home` y rutas protegidas; lo único que se difiere es la fusión teléfono→ficha. Para **bloquear** a no verificados haría falta un gate nuevo sobre `status`/`phone_verified_at` que **hoy no existe** (y añadirlo sí tendría radio de impacto en `RequireAuth`/`Index`/`useCustomer`). Es una decisión de producto separada.
3. **Degradación menor (no rotura):** si el OTP se exige antes de la RPC, `useCustomer` puede devolver `null`/`phone` crudo un instante → el prellenado de reserva cae a vacío/crudo y "Mis Citas" aparece vacío hasta que la ficha enlaza — **idéntico** al comportamiento actual de la rama con confirmación de email.

### Veredicto 2 — "El OTP en cliente por sí solo es insuficiente; el control debe reforzarse en la RPC de Salón OS"
**Sostenido (alta confianza).** `register_my_customer_account` es un **endpoint PostgREST público**: cualquiera con la anon key (viaja en el bundle del navegador) más un JWT de sesión válido puede hacer `POST /rest/v1/rpc/register_my_customer_account` con un `p_phone` arbitrario, **saltándose el OTP de la UI**. El cuerpo de la RPC **no está en este repo** (solo el call-site, el tipo generado y la doc), luego el arreglo autoritativo vive en **Salón OS**. El propio código ya sigue ese modelo ("gating autoritativo en servidor", `auth.tsx:150-152`; `FEATURE_NOT_ENABLED`/`PHONE_CONFLICT` ya se imponen con `P0001`). → **El OTP en cliente es defensa en profundidad/UX válida (no eliminarlo), pero el control que impide el secuestro debe añadirlo Salón OS.** Dependencia entre equipos (ver §11.1 y §13).

### Nota de reconciliación (esquema vivo vs. migraciones)
Los agentes de *login* y *fidelización* asumen que el trigger `handle_new_user` del repo (que crea ficha + `loyalty_account` + cupón al hacer `signUp`, con `status='PENDING_VERIFICATION'`) es el que corre en producción. **Con el esquema vivo (§7) eso no es seguro:** la tabla viva no tiene `status` y el alta autoritativa la gobierna Salón OS. La conclusión **no cambia** en ningún caso: si la ficha nace en `signUp` (trigger vivo) el login funciona; si nace solo en la RPC del paso 3 (post-OTP), `useCustomer` devuelve `null` —que la app ya tolera con `maybeSingle`— y el login **tampoco** se rompe. Solo varía *cuándo* aparece la ficha, no si el usuario puede autenticarse.

---

## 13. Recomendación final y checklist para la implementación

**Recomendación:** adoptar la **Estrategia A** — insertar el OTP en `Register.tsx` entre el paso 2 y el paso 3, con OTP nativo de Supabase (`updateUser` + `verifyOtp`), llamando a `register_my_customer_account` **solo** tras el OTP correcto. Es la inserción de menor radio de impacto, encaja con el esquema vivo y materializa el `TODO(OTP)` ya presente.

**Checklist para las siguientes sub-tareas:**
- [ ] Decidir modo de confirmación de email (define registro vs. post-login para el OTP).
- [ ] Aprovisionar proveedor SMS en Supabase Auth (coste/rate-limits/plantilla).
- [ ] UI del OTP en `Register.tsx` (input OTP — ya existe `components/ui/input-otp.tsx`), reenvío, errores y cancelación.
- [ ] Reordenar el paso 3 para depender del éxito del OTP; reutilizar `mapAuthError`/`mapRegisterError`.
- [ ] **Coordinar con Salón OS** el refuerzo servidor de `register_my_customer_account` (comprobar `phone_confirmed_at` = `p_phone`). *(dependencia externa)*
- [ ] Diseñar reintento para cuentas cuyo OTP falló.
- [ ] Tests: registro con OTP correcto/incorrecto/caducado sin romper login/fidelización/branding/reservas (patrón Vitest ya usado en `src/lib/*.test.ts`).
- [ ] No tocar `signIn`, `RequireAuth`, `SalonProvider` ni la capa `salon-os-api`.

> **Nota de alcance:** este repo puede entregar de forma autónoma la UI del OTP y el reordenado del paso 3. La garantía **completa** anti-secuestro depende de un cambio en la RPC de **Salón OS** (otro despliegue/equipo) — se señala como dependencia, no como bloqueo de esta auditoría.

---

## 14. Apéndice — inventario de archivos citados

| Archivo | Rol en el flujo |
|---|---|
| `src/lib/auth.tsx` | `AuthProvider`, `signUp`/`signIn`/`signOut`/`resetPassword`, `mapAuthError`, `mapRegisterError` |
| `src/pages/Register.tsx` | Orquesta signUp → sesión → RPC; **hueco del `TODO(OTP)`** (l. 88-90) |
| `src/pages/Login.tsx` | `signIn`; nombre del salón vía `useSalon()` |
| `src/pages/ForgotPassword.tsx` | `resetPassword` |
| `src/components/RequireAuth.tsx` | Guard de rutas (solo `user`) |
| `src/integrations/supabase/client.ts` | Cliente Supabase (persistencia de sesión) |
| `src/integrations/supabase/types.ts` | Esquema **vivo** (firma RPC + tabla `customers` sin `status`/`phone_verified_at`) |
| `src/App.tsx` | Árbol de proveedores (`SalonProvider` > `AuthProvider`) y rutas |
| `src/lib/salon-context.tsx` | Branding runtime, RPC `get_salon_branding` (ancestro de auth) |
| `src/hooks/useCustomer.ts` | Ficha self (`user_id`+`salon_id`), base de fidelización/prellenado |
| `src/pages/Loyalty.tsx` | Fidelización (RLS `auth.uid()`, sin estado de verificación) |
| `src/lib/salon-os-api.ts` | Transporte de la API pública de reservas (anónima, sin sesión) |
| `src/lib/booking.ts` | Lógica pura de reserva; prellenado con `phone_e164` |
| `src/pages/BookAppointment.tsx`, `ServiceCatalog.tsx`, `Appointments.tsx` | Asistente de reserva y "Mis Citas" **activos** (los de `src/pages/_deferred/reservations-3B-2/` son **código muerto**, no enrutados) |
| `src/hooks/useAppointments.ts` | "Mis Citas" (RLS self por `customer_id`+`salon_id`; `enabled: !!customerId`) |
| `src/components/PinOverlay.tsx` | Overlay de PIN de visita (depende de `customerId`) |
| `supabase/migrations/…130511`, `…233235` | Esquema **histórico** (`customer_status`, `handle_new_user`) — superado |
| `README.md` (§ registro / "OTP pendiente"), `VERIFICACION.md` | Documentación del flujo y del `TODO(OTP)` |
