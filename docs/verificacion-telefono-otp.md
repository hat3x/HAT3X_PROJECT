# Verificación del teléfono del cliente (OTP por SMS)

> **En una frase.** El teléfono es la **clave natural de identidad** del cliente. Antes
> de fiarse de un número como identidad (enlazar/crear su ficha), hay que **probar que
> ese número es suyo** con un **código de un solo uso (OTP) por SMS**. Ese SMS lo envía
> **Supabase Auth**, no la app — por eso hace falta un **paso humano**: dar de alta un
> **proveedor de SMS (Twilio)** en el panel de Supabase.

Este documento cubre las tres piezas de la verificación:

1. **[El paso humano](#1-paso-humano-proveedor-de-sms-twilio-en-supabase)** — configurar
   el proveedor de SMS (Twilio) en el panel de Supabase.
2. **[El flujo completo (PARTE 2)](#2-el-flujo-completo-parte-2--verificar-el-teléfono)** —
   pedir teléfono → Supabase envía SMS → el usuario introduce el código → se confirma en
   `auth.users` → **recién entonces** se llama a `register_my_customer_account`.
3. **[El interruptor `require_phone_verification`](#3-el-interruptor-require_phone_verification-y-su-riesgo)** —
   la válvula por salón que exige (o, solo en desarrollo, relaja) la verificación, con su
   **riesgo explícito**.

---

## El agujero que esto cierra

`customers.phone_e164` es la **clave natural** con la que Salón OS reconoce a una persona
(un teléfono = una ficha por salón; ver [`src/lib/customers/README.md`](../src/lib/customers/README.md)).
La RPC de autoservicio `public.register_my_customer_account` y su gemela TS
`linkOrCreateCustomerAccount` (`@/lib/customers/account.ts`) enlazan/crean la ficha del
usuario autenticado **identificándolo por su teléfono**.

Sin probar que ese teléfono es **realmente suyo**, un registrante malicioso podría
**declarar el número de otra persona** y quedarse con su ficha ya existente (resultado
`linked`) — **robo de identidad + de los puntos de fidelización** asociados. La única
prueba fiable de "este número es tuyo" es un **OTP por SMS**: recibes el código en ESE
teléfono, luego es tuyo.

---

## Dos usos de Twilio en este proyecto: no confundirlos

> ⚠️ Twilio aparece en Salón OS para **dos cosas distintas**, con **configuración
> separada**. Confundirlas es el error más fácil de cometer aquí.

| | **OTP del teléfono (este documento)** | **Recordatorios de WhatsApp** |
|---|---|---|
| **Qué envía** | El **código de verificación (SMS)** al registrarse | Recordatorios/confirmaciones de cita por WhatsApp |
| **Quién lo envía** | **Supabase Auth (GoTrue)** | La **app** (`@/lib/whatsapp`) |
| **Dónde se configura** | **Panel de Supabase** → Authentication → Providers → Phone | **`.env`** de la app (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`…) |
| **Credenciales de Twilio** | Se pegan **en Supabase**, no en el repo | Viven en variables de entorno del servidor |
| **Referencia** | Este documento | [README → WhatsApp / Twilio](../README.md#whatsapp--twilio) |

> 🔑 **Regla de oro:** las credenciales de Twilio para el **OTP** se pegan **en el panel
> de Supabase**. **No** hay ninguna variable `NEXT_PUBLIC_...` ni `SUPABASE_...` ni
> `TWILIO_...` en la app para el OTP. Buscar una variable de entorno del OTP en el repo
> **no** dará resultados, y es lo correcto: ese secreto es de Supabase.

---

## 1. Paso humano: proveedor de SMS (Twilio) en Supabase

Como el OTP lo **manda Supabase Auth**, Supabase necesita un **proveedor de SMS** con el
que enviarlo. **Sin proveedor configurado, `signInWithOtp` / `verifyOtp` fallan** y ningún
teléfono llega a confirmarse → con la válvula en su valor seguro (por defecto), **nadie
podría registrarse** en la app de cliente. Este es un **paso manual de puesta en marcha**,
una sola vez por proyecto de Supabase.

### Pasos (panel de Supabase)

1. **Ten a mano las credenciales de Twilio** (cuenta en <https://www.twilio.com>):
   - `Account SID` y `Auth Token` (Twilio Console → *Account Info*), **o** un
     **API Key SID/Secret**.
   - Un **Messaging Service SID** (recomendado) o un número/remitente capaz de enviar SMS
     al país de tus clientes (España, `+34`).
2. En el panel de Supabase del proyecto: **Authentication → Providers → Phone**.
3. **Activa** el proveedor de teléfono (*Enable Phone provider* / *Enable phone
   confirmations*).
4. Elige **Twilio** como *SMS provider* y **pega ahí** el `Account SID`, el `Auth Token` (o
   la API Key) y el `Messaging Service SID` / número remitente.
   - *(Supabase admite también Vonage, MessageBird, Textlocal y **Twilio Verify**. La
     tarea de Salón OS estandariza en **Twilio**; si se usara otro, cambia solo este paso —
     el resto del flujo y del enforcement es idéntico.)*
5. **Guarda.** Opcional pero recomendado: revisa la **plantilla del mensaje** del OTP y los
   **límites de reenvío** (rate limits) en la misma sección para no disparar el gasto de
   SMS.
6. **Verifica** enviándote un OTP a un móvil real (desde la app de cliente o con
   `supabase.auth.signInWithOtp({ phone })` en un entorno de pruebas) y comprobando que
   llega el SMS.

> 💡 **Coste.** Cada OTP es un **SMS de pago** de Twilio. Configura los **rate limits** de
> Supabase (Auth → Rate Limits) y, si procede, geo-restricciones en Twilio para evitar
> abuso (envíos masivos a números premium). El OTP **no** es gratis como un email.

### Y si aún no hay proveedor de SMS (desarrollo/staging)

Montar Twilio solo para probar el flujo de registro en local puede sobrar. Para eso existe
la **válvula `require_phone_verification`**: un salón de desarrollo puede **relajarla**
(saltarse el OTP) de forma **explícita y auditable**. Es la sección
[3](#3-el-interruptor-require_phone_verification-y-su-riesgo) — y conlleva un **riesgo** que
allí se explica. **En producción, la solución correcta es configurar el proveedor**, no
relajar la válvula.

---

## 2. El flujo completo (PARTE 2 — verificar el teléfono)

El alta del cliente en la app se piensa en **dos partes**:

- **PARTE 1 — Cuenta (autenticación).** El usuario obtiene una **sesión** (`auth.users` +
  JWT). Puede ser por email/contraseña, OAuth, o **por el propio teléfono**.
- **PARTE 2 — Verificación del teléfono (este flujo).** Se **prueba la posesión** del
  número con un OTP y se **sella** en `auth.users`. **Solo entonces** el servidor se fía
  del teléfono y se llama a `register_my_customer_account`.

> ℹ️ **Dónde vive cada parte.** La **UI** de la PARTE 2 (pedir el número, pintar el campo
> del código, reenviar) es de la **app de cliente** (PWA, FASE 3B/3C — apps Vite que hablan
> con Supabase directo). **Este repositorio (Next.js) NO pinta esa UI**: aporta el
> **enforcement de servidor** (la RPC `register_my_customer_account` y la Server Action
> `linkOrCreateCustomerAccount`), que **rechaza** cualquier registro con teléfono sin
> verificar. Es decir: la app pide y verifica; el backend **comprueba y no se fía a ciegas**.

### Secuencia

```
 CLIENTE (app PWA)          SUPABASE AUTH (GoTrue)         PROVEEDOR SMS        BACKEND (RPC / Server Action)
 ─────────────────          ──────────────────────         (Twilio)            ────────────────────────────
   │                              │                            │                          │
   │ 1. pedir teléfono            │                            │                          │
   │    (formulario)              │                            │                          │
   │                              │                            │                          │
   │ 2. signInWithOtp({phone})    │                            │                          │
   │    · o, ya con sesión:       │                            │                          │
   │      updateUser({phone})     │                            │                          │
   ├─────────────────────────────▶│                            │                          │
   │                              │ 3. envía OTP por SMS  ─────▶│  ✉ SMS "tu código: 1234" │
   │                              │                            ├────────────▶ 📱 usuario   │
   │                              │                            │                          │
   │ 4. el usuario teclea         │                            │                          │
   │    el código recibido        │                            │                          │
   │                              │                            │                          │
   │ 5. verifyOtp({phone, token}) │                            │                          │
   ├─────────────────────────────▶│                            │                          │
   │                              │ 6. valida el código        │                          │
   │                              │    ✅ sella en auth.users:  │                          │
   │                              │      · phone = E.164        │                          │
   │                              │      · phone_confirmed_at   │                          │
   │◀─────────────────────────────┤    (+ sesión con teléfono   │                          │
   │   sesión / phone confirmado  │      confirmado)           │                          │
   │                              │                            │                          │
   │ 7. RECIÉN AHORA:             │                            │                          │
   │    rpc('register_my_customer_account', {p_salon_id, p_phone, p_full_name, …})        │
   ├──────────────────────────────────────────────────────────────────────────────────▶│
   │                              │                            │      8. el backend LEE    │
   │                              │◀───────────────────────────────────  auth.users:      │
   │                              │        phone_confirmed_at + phone (id = auth.uid())    │
   │                              │                            │      compara con p_phone  │
   │                              │                            │      (ya normalizado)     │
   │                              │                            │      · coincide → enlaza/crea ✅
   │◀──────────────────────────────────────────────────────────────────  · no → PHONE_NOT_VERIFIED ❌
   │   { customer_id, qr_token, outcome }  |  o error 403      │                          │
```

**Los dos caminos de la PARTE 2** (según cómo se autenticó en la PARTE 1):

- **El teléfono ES el método de login** — `signInWithOtp({ phone })` y luego
  `verifyOtp({ phone, token, type: 'sms' })`. En un solo paso **crea la sesión** y **sella**
  `phone_confirmed_at`.
- **Ya hay sesión (email/OAuth) y se añade el teléfono** — `updateUser({ phone })` y luego
  `verifyOtp({ phone, token, type: 'phone_change' })`.

En **ambos** casos el resultado es el mismo: `auth.users.phone` (E.164) y
`auth.users.phone_confirmed_at` quedan sellados por Supabase, que es lo único que el backend
mira. **No** hay que pasarle al backend ningún "flag de verificado": la verdad está en
`auth.users`.

### Qué comprueba el backend (enforcement)

Migración [`20260719120000_rpc_register_phone_verification_gate.sql`](../supabase/migrations/20260719120000_rpc_register_phone_verification_gate.sql)
(RPC) y su espejo TS `requireVerifiedPhoneOwnership` en `@/lib/customers/account.ts`
(Server Action). Cuando el salón exige verificación (ver
[sección 3](#3-el-interruptor-require_phone_verification-y-su-riesgo)):

1. Lee `phone` y `phone_confirmed_at` de `auth.users` **para `id = auth.uid()`** (nunca por
   un parámetro: solo puedes probar la posesión de **tu propio** número). La RPC es
   `SECURITY DEFINER`, así lee `auth.users` de forma controlada sin exigirle al llamante
   acceso a ese esquema; la Server Action lo lee con `auth.getUser()` (registro
   autoritativo, no un claim del JWT — el JWT **no** transporta `phone_confirmed_at`).
2. **"Verificado" =** hay `phone_confirmed_at` **Y** el teléfono confirmado, ya normalizado
   a E.164, **coincide** con el `p_phone` declarado (también normalizado). Así el **formato**
   con que se teclee el número es irrelevante.
3. Si **no** hay confirmado, o **no coincide** → se rechaza con **`PHONE_NOT_VERIFIED`**
   (SQLSTATE `P0001` en la RPC; `CustomerAccountError('phone_not_verified', 403)` en la
   Server Action). Es un **error de negocio esperado**, no un bug: la app debe llevar al
   usuario a verificar su teléfono y reintentar **con el mismo número**.

**Orden de comprobaciones** (deliberado, para no romper el contrato de errores previo):

```
UNAUTHORIZED → INVALID_NAME → INVALID_PHONE → SALON_NOT_FOUND →
FEATURE_NOT_ENABLED → PHONE_NOT_VERIFIED → (identidad por teléfono: linked/created/already_linked)
```

Es decir, el OTP-gate va **tras** el feature-gate (un salón sin el add-on sigue viendo
`FEATURE_NOT_ENABLED` primero) y **antes** de tocar/crear fichas: sin teléfono verificado
**no se enlaza** una ficha ajena ni **se crea** una nueva.

> 🐛 **Detalle de formato (GoTrue).** Supabase guarda `auth.users.phone` en E.164 pero
> **sin el `+`** de cabecera (p. ej. `34612345678`). El enforcement le antepone un `+`
> antes de normalizar (`app.normalize_phone('+' || phone)`); sin ese `+`, un `34…` se
> tomaría por número **nacional** y se le añadiría **otro** `34` (`+3434…`, basura) y
> **ningún** verificado coincidiría. Documentado en la cabecera de la migración y del
> módulo por si algún día se comparte esa normalización.

---

## 3. El interruptor `require_phone_verification` (y su riesgo)

Migración [`20260719110000_salon_security_settings.sql`](../supabase/migrations/20260719110000_salon_security_settings.sql).
La **primera válvula de seguridad auditable por salón**: decide si el autoservicio del
cliente **exige** teléfono verificado antes de fiarse de él como identidad.

```sql
create table public.salon_security_settings (
  salon_id                   uuid primary key references public.salons (id) on delete cascade,
  require_phone_verification boolean not null default true,   -- ← LA VÁLVULA (secure by default)
  notes                      text,                            -- por qué/hasta cuándo se relajó
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
```

### Secure by default **y** fail-closed

Dos capas de "seguro por defecto", a propósito:

1. **La columna** nace `NOT NULL DEFAULT TRUE`: una fila creada sin especificar el valor
   **exige** verificación.
2. **La ausencia de fila = exigir verificación.** El gate
   `app.salon_requires_phone_verification(salon_id)` devuelve `TRUE` (exigir) **salvo** que
   exista una fila que diga **explícitamente** `require_phone_verification = false`:

   | Estado del salón | Gate | Efecto |
   |---|---|---|
   | **Sin fila** (estado por defecto de todos los salones) | `TRUE` | Exige OTP ✅ |
   | Fila con `require_phone_verification = true` | `TRUE` | Exige OTP ✅ |
   | Fila con `require_phone_verification = false` | `FALSE` | **Salta el OTP** ⚠️ (solo dev) |

   Un salón **sin configurar nada** queda **protegido**. **Olvidarse nunca abre el
   agujero**; lo peligroso (saltar la verificación) exige un **acto explícito**.

El espejo TS (`salonRequiresPhoneVerification` en `@/lib/customers/account.ts`) replica el
mismo `not exists(... = false)`: **sin fila ⇒ `true`**.

### ⚠️ El riesgo, explícito

> **Poner `require_phone_verification = false` REABRE el agujero de suplantación por
> teléfono.** En un salón con clientes reales, `false` significa que **cualquiera puede
> reclamar el teléfono de otra persona** al registrarse y **quedarse con su ficha y sus
> puntos** (resultado `linked` sin prueba de posesión). Es exactamente el robo de identidad
> que el OTP evita.

Por eso `false` **solo tiene sentido en desarrollo/staging** — por ejemplo, para probar el
flujo de registro **sin montar un proveedor de SMS** todavía (ver
[sección 1](#y-si-aún-no-hay-proveedor-de-sms-desarrollostaging)). **Nunca** en producción:
en producción, la respuesta correcta a "no llega el OTP" es **arreglar el proveedor de
SMS**, no relajar la válvula.

### Quién puede tocar la válvula (y quién NO)

La escritura de esta tabla **no** la puede hacer el salón desde el navegador. RLS es
**deny-by-default en escritura**: solo hay una política de **SELECT** acotada por
`app.user_salon_ids()` (el salón puede **leer** su estado — p. ej. mostrar "verificación por
SMS: activa" en su panel — pero **no cambiarlo**). Relajar la válvula es exclusivo de
**HAT3X** vía `service_role` / backoffice (que bypasa RLS). **El owner de un salón no puede
auto-abrirse el agujero.**

Un **guardián de aserción** en la propia migración aborta —de forma ruidosa y re-ejecutable
en CI— si una migración futura debilitara esto: que el gate siga `SECURITY DEFINER` y
revocado a `anon`, que RLS siga activa, que el SELECT siga acotado por salón, que **no**
aparezca ninguna política de escritura, y —lo más sutil— que el **DEFAULT siga siendo
`true`** (un default `false` haría nacer filas con el agujero abierto).

### Cómo relajar / re-asegurar la válvula (solo `service_role`, solo dev/staging)

Por defecto **no hay que tocar nada** (sin fila, el gate ya exige verificación). Solo para
**desarrollo/staging**, y **a sabiendas de que reabre el agujero**, se relaja con un upsert
desde el **SQL Editor de Supabase** o `psql` con la **service key**:

```sql
-- ⚠️ DEV/STAGING ONLY — reabre la suplantación por teléfono. Nunca en un salón real.
insert into public.salon_security_settings (salon_id, require_phone_verification, notes)
values ('<SALON_UUID>', false, 'DEV: sin proveedor SMS en staging — reactivar antes de clientes reales')
on conflict (salon_id) do update
  set require_phone_verification = excluded.require_phone_verification,
      notes                      = excluded.notes;
```

Volver al **estado seguro** (exigir verificación de nuevo): poner el valor a `true`
**o borrar la fila** (por fail-closed, sin fila también se exige):

```sql
update public.salon_security_settings set require_phone_verification = true where salon_id = '<SALON_UUID>';
-- o, equivalente por fail-closed:
delete from public.salon_security_settings where salon_id = '<SALON_UUID>';
```

Rellena siempre `notes`: deja **rastro** de quién relajó la válvula, por qué y hasta cuándo.
No afecta a la lógica del gate; existe para la auditoría.

---

## Contrato de errores (para quien integra la app)

| Error | Dónde | Significado | Qué debe hacer la app |
|---|---|---|---|
| `PHONE_NOT_VERIFIED` (RPC, `P0001`) / `phone_not_verified` (Server Action, **403**) | Registro/enlace | El teléfono no está confirmado, o el confirmado no es el declarado | Llevar al usuario a **verificar su teléfono** (PARTE 2) y **reintentar con el mismo número** |
| `FEATURE_NOT_ENABLED` (`P0001`) | Registro/enlace | El salón no tiene los add-ons `client_app` + `loyalty` | Es de negocio (add-on no contratado); no reintentar sin activarlo |
| `PHONE_CONFLICT` (RPC) / `conflict` (**409**) | Registro/enlace | El teléfono ya está en una ficha de **otra** cuenta del salón | Es la **última barrera** anti-robo; fusión = staff/soporte, no autoservicio |

> Todos los errores de negocio de la RPC comparten SQLSTATE `P0001`: **la capa cliente los
> distingue por el MENSAJE, no por el código.**

---

## Estado y pendientes

- **Hecho (backend):** la válvula (`salon_security_settings` + gate fail-closed) y el
  **enforcement** en **ambas rutas** — la RPC `register_my_customer_account`
  (`20260719120000`) y la Server Action `linkOrCreateCustomerAccount`
  (`@/lib/customers/account.ts`). Con teléfono sin verificar, **las dos rechazan**.
- **Paso humano (puesta en marcha):** configurar el **proveedor de SMS (Twilio)** en el
  panel de Supabase (sección 1). Sin él, el OTP no se puede enviar.
- **Pendiente (front):** la **UI de la PARTE 2** (pedir número, campo de código, reenvío)
  en la **app de cliente PWA** (FASE 3B/3C). Este repositorio ya la **exige** desde el
  servidor; la app debe **implementar el flujo** de la [sección 2](#2-el-flujo-completo-parte-2--verificar-el-teléfono).

## Tests

- `src/tests/integration/customers-account.test.ts` — el gate OTP de
  `linkOrCreateCustomerAccount`: exige teléfono confirmado, salta si la válvula está
  relajada, `phone_not_verified` cuando no coincide.
- `src/tests/integration/salon-features-gate.test.ts` — interacción con el feature-gate
  (orden `FEATURE_NOT_ENABLED` antes que `PHONE_NOT_VERIFIED`).
- `src/tests/integration/customers-phone-uniqueness.test.ts` — dedup por teléfono y la
  válvula de seguridad.
- La **RLS real** (deny-by-default de escritura, SELECT acotado) y el **DEFAULT true** se
  validan en la capa de BD: la migración `20260719110000` y su guardián inline.

## Referencias

- Migraciones: [`20260719110000_salon_security_settings.sql`](../supabase/migrations/20260719110000_salon_security_settings.sql)
  (válvula) · [`20260719120000_rpc_register_phone_verification_gate.sql`](../supabase/migrations/20260719120000_rpc_register_phone_verification_gate.sql)
  (enforcement en la RPC).
- Código TS: [`@/lib/customers/account.ts`](../src/lib/customers/account.ts) —
  `salonRequiresPhoneVerification`, `requireVerifiedPhoneOwnership`,
  `linkOrCreateCustomerAccount`.
- Modelo de identidad por teléfono: [`src/lib/customers/README.md`](../src/lib/customers/README.md)
  y [MANTENIMIENTO.md → Identidad del cliente](../MANTENIMIENTO.md#identidad-del-cliente--cuenta-teléfono-y-dedup).
- Operación (paso humano + relajar en dev): [MANTENIMIENTO.md → Verificación del teléfono](../MANTENIMIENTO.md#verificación-del-teléfono-del-cliente-otp-por-sms).
- Contrato de las RPC: [`docs/convenciones-rls-rpc-audit.md §4.1`](./convenciones-rls-rpc-audit.md).
- Verificación de seguridad y no-regresión del gate: [`docs/verificacion-seguridad-otp-no-regresion.md`](./verificacion-seguridad-otp-no-regresion.md).
</content>
