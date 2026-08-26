# Auditoría de seguridad sub-7 — Flujo de registro de cliente con verificación de teléfono

**Cliente:** denueveanueve · **Fecha:** 2026-07-19 · **Autor:** Security Engineer (HAT3X, webs-apps)
**Rama:** `hat3x/HAT3X-030` · **Alcance:** flujo de alta de cliente (`Register.tsx` + módulos puros y efectful de OTP/registro) y su relación con la RPC autoritativa `register_my_customer_account` de Salón OS.

---

## 1. Objeto de la revisión (sub-7)

> "Revisar la seguridad del flujo cliente: confirmar que el registro no puede completarse sin teléfono confirmado, que la app se adapta a la RPC (no la sortea) y que los errores como PHONE_NOT_VERIFIED se muestran sin exponer detalles técnicos ni permitir bypass del paso de verificación."

Se traduce en tres requisitos de seguridad, cada uno verificado abajo con evidencia `archivo:línea`:

1. **R1 — Gating de teléfono verificado:** el registro (enlace de ficha) no se completa sin teléfono confirmado.
2. **R2 — Autoridad del servidor:** la app se adapta a la RPC y no la sortea (no existe vía cliente alternativa que enlace la ficha).
3. **R3 — Errores seguros:** `PHONE_NOT_VERIFIED` (y afines) se muestran traducidos, sin filtrar detalle técnico, y sin abrir un bypass del paso de verificación.

**Metodología:** revisión de código estática (OWASP Top 10 2021 A01 *Broken Access Control*, A04 *Insecure Design*, A05 *Security Misconfiguration*, A09 *Logging/Errors*), análisis de superficie de bypass y ejecución de la batería de tests del flujo.

---

## 2. Veredicto ejecutivo

**El flujo de cliente está correctamente diseñado y es seguro EN LA CAPA QUE ESTE REPOSITORIO CONTROLA.** Los tres requisitos de sub-7 se cumplen en cliente: el enlace de ficha se dispara exclusivamente vía la RPC, tras el OTP; la app únicamente *traduce* el resultado de la RPC sin sortearlo; y todos los errores crudos se mapean a claves i18n estables antes de mostrarse. **77/77 tests del flujo pasan** (`Register.test.tsx`, `registration-flow.test.ts`, `otp.test.ts`).

**Existe un riesgo residual ALTO que NO es auditable desde este repo y que condiciona toda la garantía:** la definición de `register_my_customer_account` vive en el backend de **Salón OS** (no en `supabase/migrations/` de este proyecto). El cliente no puede sortear el gating porque la RPC es autoritativa en servidor —**siempre que el servidor compruebe que el teléfono verificado (`auth.users.phone_confirmed_at`) coincide con el teléfono que se enlaza (`p_phone`)**, y no solo que "hay algún teléfono confirmado". Ese refuerzo figura como **TODO sin cerrar** en la auditoría sub-1 (`docs/AUDITORIA-sub1-…md:220`). Ver Hallazgo **H1**.

| Sev. | ID | Título | Estado |
|---|---|---|---|
| 🔴 ALTO | H1 | La garantía de gating depende de un check servidor (`phone_confirmed_at = p_phone`) no auditable en este repo y marcado TODO | Abierto — dependencia Salón OS |
| 🟡 MEDIO | H2 | Rutas autenticadas accesibles con sesión pero teléfono sin verificar (cuenta en "limbo") | Aceptable con mitigación; opcional endurecer |
| 🔵 BAJO | H3 | `p_phone` se envía como número nacional; la coherencia de normalización recae en el servidor | Ligado a H1 |
| 🟢 OBS | H4 | `Profile.handleSave` permite editar `phone` (texto libre) sin re-verificación | Fuera de sub-7; verificar RLS de Salón OS |

---

## 3. Verificación de requisitos

### ✅ R1 — El registro no se completa sin teléfono confirmado

**Confirmado en cliente.** El enlace de la ficha es un único punto: la RPC `register_my_customer_account` en `finishRegistration` (`src/pages/Register.tsx:111`). Esa función **solo** se invoca:

- desde `onVerified` del paso OTP, que se dispara **después** de un `verifyOtp` correcto (`src/components/PhoneOtpStep.tsx:178-180` → `src/pages/Register.tsx:286`), o
- desde el atajo de teléfono no normalizable a E.164 (`Register.tsx:225`), donde la RPC valida el teléfono en servidor (`INVALID_PHONE`) — no se concede acceso.

Antes de verificar, la RPC **no** se llama. Probado explícitamente:

- `Register.test.tsx:115` — `expect(mocks.rpc).not.toHaveBeenCalled()` mientras el SMS está en curso.
- `Register.test.tsx:150-151` — con un código incompleto, ni `verifyOtp` ni la RPC se ejecutan.

**Autoridad en servidor (clave):** la firma de la RPC **no admite** ningún indicador de "verificado" que el cliente pueda falsear (`src/integrations/supabase/types.ts:1575-1583`: `p_salon_id, p_phone, p_full_name, p_email?`). El servidor deriva el estado de verificación de `auth.users.phone_confirmed_at` de su **propio** `auth.uid()`, sellado por `verifyOtp({ type: 'phone_change' })` (`src/lib/phone-verification.ts:10-18`). El cliente no tiene forma de simular el sello. ⇒ El gating es **no sorteable desde el cliente**.

> ⚠️ La *fortaleza* de este gating depende del servidor. Ver **H1**.

### ✅ R2 — La app se adapta a la RPC y no la sortea

**Confirmado.** Los módulos de decisión son puros y solo **traducen** el resultado de la RPC; nunca lo eluden. El propio código lo declara: *"aquí SÓLO traducimos el motivo del rechazo; no lo sorteamos. El gating es autoritativo en el servidor"* (`src/lib/registration-flow.ts:39-42`).

Inventario de escrituras a `customers` en la app (grep exhaustivo de `src/`):

- **Único enlace por teléfono:** `supabase.rpc('register_my_customer_account', …)` en `Register.tsx:111`. No hay ninguna otra vía.
- Todos los demás accesos a `.from('customers')` son **lecturas self** filtradas por `user_id = auth.uid()` vía RLS (`useCustomer.ts:34-39`, `Home.tsx`, `Loyalty.tsx`, `Club.tsx`, `PremiumBenefits.tsx`, `Profile.tsx:41-46`).
- `Profile.handleSave` (`Profile.tsx:63-73`) es la **única escritura** directa: un `UPDATE` sobre una ficha **ya propia** (`.eq('id', customer.id).eq('salon_id', …)`) que toca `full_name`, `phone` (texto libre), `email`, `marketing_consent`. **No** escribe `phone_e164` —el campo canónico con el que el servidor enlaza/reutiliza la ficha (`useCustomer.ts:13`)— ni crea vínculo alguno. ⇒ **No es una vía de sorteo del gating de registro.** (Observación de perfil: **H4**.)

**La salida "continuar sin verificar" NO es un bypass.** Cuando no hay proveedor SMS, el usuario puede continuar, pero eso llama a la **misma** RPC (`Register.tsx:290`). Si el servidor exige verificación, responde `PHONE_NOT_VERIFIED` y la salida **se retira** (`onContinueWithoutVerification` pasa a `undefined`, `PhoneOtpStep.tsx:254`, `Register.tsx:290`), evitando el bucle. **Decide el servidor**, no el cliente.

### ✅ R3 — Errores mostrados sin filtrar detalle técnico ni abrir bypass

**Confirmado — sin fuga de detalle técnico.** Ningún error crudo llega a la UI. Todo pasa por mapeadores que devuelven **siempre** una clave i18n existente (fallback `auth.error.generic`):

- `mapRegisterError` (`registration-flow.ts:45-59`) — RPC de enlace (P0001 / motivos textuales).
- `mapOtpError` (`otp.ts:272-343`) — gotrue (envío/verificación) + `PHONE_NOT_VERIFIED`.
- `mapAuthError` (`auth.tsx:110-135`) — signUp/login.

El usuario ve, p. ej., *"Debes verificar tu número de teléfono para completar el registro."* (`i18n.tsx:53`), **nunca** `P0001`, SQLSTATE, `error.message`, `stack` ni el texto crudo de Postgres/gotrue. No se detectó `console.log`/`console.error` de contraseñas, códigos OTP o teléfonos en el flujo (cumple security-review §8 *Sensitive Data Exposure*). Probado: `Register.test.tsx:175`, `191`.

**Confirmado — sin bypass del paso de verificación.** `PHONE_NOT_VERIFIED` se trata como **no terminal** y de forma segura (`Register.tsx:126-132`):
1. enciende el aviso de "verificación obligatoria" (`phoneGateRequired = true`),
2. **remonta** `PhoneOtpStep` (bump de `verifyAttempt`) para reenviar un código nuevo,
3. **retira** la salida "continuar sin verificar",
4. **no navega** (no hay acceso a la app).

Probado en `Register.test.tsx:154-176`: aparece "Verificación obligatoria", `navigate` **no** se llama, y se reenvía el código (`updateUser` se invoca 2×). Un rechazo distinto (`FEATURE_NOT_ENABLED`) sí es terminal y devuelve al formulario sin navegar (`Register.test.tsx:178-197`).

---

## 4. Hallazgos

### 🔴 H1 — La garantía completa depende de un check servidor no auditable aquí (ALTO, dependencia externa)

**Descripción.** `register_my_customer_account` **no está definida** en `supabase/migrations/` de este repositorio (grep sin resultados sobre las migraciones; solo aparece en tipos generados y llamadas de cliente). Vive en el backend compartido de **Salón OS**. Por diseño, el cliente verifica el teléfono en **E.164** (`+34600123456`, sella `phone_confirmed_at` vía `verifyOtp` — `phone-verification.ts:157`) pero **enlaza** enviando `p_phone` como número **nacional** (`'600123456'`, `Register.tsx:112` / `Register.test.tsx:131`).

**Riesgo.** Si la RPC solo comprueba `phone_confirmed_at IS NOT NULL` (existe *algún* teléfono verificado) pero enlaza por `p_phone` **sin exigir que ambos coincidan**, un atacante podría: (1) verificar su **propio** número, y (2) invocar la RPC con el número de una **víctima** como `p_phone`, reclamando su ficha/fidelización. Este es exactamente el riesgo de "reclamar la ficha de otra persona" que sub-1 §9 pretende cerrar, y el refuerzo servidor figura **sin marcar** en el checklist de sub-1:

> `docs/AUDITORIA-sub1-…md:220` — "**[ ]** Coordinar con Salón OS el refuerzo servidor de `register_my_customer_account` (comprobar `phone_confirmed_at` = `p_phone`). *(dependencia externa)*"

**Severidad:** ALTO si el check no está implementado en servidor; **el trabajo de cliente de sub-2…sub-6 no cierra este riesgo por sí solo** — solo garantiza que *hay* un teléfono verificado, no que sea *el que se enlaza*.

**Remediación (servidor Salón OS, fuera de este repo):**
1. En la RPC, normalizar `p_phone` a E.164 con la MISMA regla que el cliente y **exigir** `auth.users.phone_confirmed_at IS NOT NULL AND normalize(p_phone) = auth.users.phone` para el `auth.uid()` llamante; en caso contrario `RAISE EXCEPTION 'PHONE_NOT_VERIFIED'`.
2. Confirmar que la RPC es `SECURITY DEFINER` con `search_path` fijado y que RLS impide cualquier `INSERT/UPDATE` directo de clientes autenticados sobre `customers.phone_e164`/enlace (el único camino de enlace debe ser la RPC).
3. Añadir un test de servidor: "verifico el teléfono A, intento enlazar el teléfono B ⇒ `PHONE_NOT_VERIFIED`".

**Acción HAT3X:** coordinar con Salón OS y cerrar el ítem `:220` de sub-1 antes de dar el flujo por producción-ready. **Bloqueante para el cierre de seguridad.**

### 🟡 H2 — Cuenta en "limbo": rutas autenticadas accesibles sin teléfono verificado (MEDIO)

**Descripción.** `RequireAuth` solo comprueba que existe `user` (sesión), no `phone_confirmed_at` (`src/components/RequireAuth.tsx:16`). Como `signUp` puede devolver sesión activa cuando el proyecto no exige confirmación de correo (`auth.tsx:63-78`, `Register.tsx:200`), un usuario con la verificación de teléfono a medias **puede** navegar a `/home` u otras rutas.

**Por qué NO es una fuga de datos.** Sin ficha enlazada (la RPC no corrió o devolvió `PHONE_NOT_VERIFIED`), la lectura self `useCustomer` devuelve `null` bajo RLS `user_id = auth.uid()` (`useCustomer.ts:34-41`): la cuenta queda **no funcional**, sin puntos/citas, y **no** expone datos de terceros. La app ya lo mitiga con el *nudge* de reanudación en Home (`Home.tsx:47`, `showResume`) y el rescate de sub-6 (`detectPhoneVerificationResumption`).

**Remediación (opcional, endurecimiento):** si se quiere impedir el estado "limbo", envolver las rutas de app en un guard que, además de sesión, exija `phone_confirmed_at` (o ficha enlazada) y redirija al paso de verificación en caso contrario. Mantiene coherencia con el gating servidor y evita UI sin datos. No bloqueante (defensa en profundidad; la autoridad real sigue siendo la RPC/RLS).

### 🔵 H3 — `p_phone` nacional vs. OTP en E.164 (BAJO)

**Descripción.** El desajuste de formato entre lo verificado (E.164) y lo enlazado (nacional) es intencionado y consistente con el alta (`Register.tsx:112`), pero traslada al servidor la responsabilidad de normalizar de forma idéntica. Un desalineamiento de normalización servidor↔cliente podría producir falsos `PHONE_NOT_VERIFIED` o, peor con H1 no resuelto, enlaces incorrectos.

**Remediación:** cubierto por la remediación de **H1.1** (normalización server-side idéntica y comparación en E.164). Considerar enviar directamente el E.164 ya normalizado como `p_phone` para eliminar ambigüedad, si Salón OS lo admite.

### 🟢 H4 — Edición de `phone` en Perfil sin re-verificación (OBSERVACIÓN, fuera de sub-7)

**Descripción.** `Profile.handleSave` actualiza `phone` (texto libre) de la ficha propia sin re-verificar por SMS (`Profile.tsx:63-73`). No toca `phone_e164` (enlace canónico), por lo que **no** afecta al gating de registro ni re-apunta fidelización. Es una superficie de *perfil*, distinta de sub-7.

**Remediación:** verificar en Salón OS que la RLS/updates de `customers` no permitan alterar el campo de enlace ni provocar colisiones, y decidir si la edición de teléfono en perfil debe re-verificarse (coherencia con el modelo de "teléfono verificado"). Registrar como ítem de backlog, no de sub-7.

---

## 5. Aspectos positivos (defensa en profundidad ya presente)

- **Único camino de enlace** vía RPC autoritativa; el cliente no decide, solo traduce (A04/A01). ✅
- **Mínimo privilegio en lectura:** `useCustomer` selecciona columnas explícitas, no `*`, excluyendo `qr_token`, `tax_id`, `notes`, `address`, `birth_date` (`useCustomer.ts:8-21`). ✅
- **Errores sin filtración:** mapeo total a i18n con fallback; sin SQLSTATE/stack a UI (A09). ✅
- **Manejo de OTP endurecido:** `autoComplete="one-time-code"`, sin insignia de gestor de contraseñas sobre el código (`PhoneOtpStep.tsx:346`), saneo y validación local del código antes de gastar una verificación de servidor (`phone-verification.ts:152-155`), cooldown anti-spam de reenvío (`otp.ts:214-238`), y guardas StrictMode para no emitir doble SMS (`PhoneOtpStep.tsx:137-143`). ✅
- **Sin secretos hardcoded** en el flujo revisado; `type: 'phone_change'` inamovible para no re-apuntar `auth.uid()` (`phone-verification.ts:10-18`). ✅

---

## 6. Checklist security-review aplicado al flujo

| Área | Resultado |
|---|---|
| Secrets management | ✅ Sin secretos en el flujo |
| Input validation | ✅ Teléfono normalizado/validado (E.164) cliente + servidor; nombre/términos validados |
| SQL injection | ✅ Solo RPC parametrizada y query builder de Supabase; sin concatenación |
| AuthN/AuthZ | ⚠️ Autoridad en servidor OK; **verificar `phone_confirmed_at = p_phone` (H1)**; RequireAuth sin gate de verificación (H2) |
| XSS | ✅ Sin `dangerouslySetInnerHTML`; render React estándar |
| Sensitive data exposure | ✅ Errores genéricos a UI; sin logging de OTP/password/teléfono |
| Rate limiting | ✅ Cooldown de reenvío en cliente; límites de gotrue en servidor (mapeados) |
| RLS | ⚠️ Lecturas self correctas en cliente; **confirmar RLS de escritura/enlace en Salón OS (H1/H4)** |

---

## 7. Recomendaciones priorizadas

1. **[BLOQUEANTE · H1]** Cerrar con Salón OS el refuerzo servidor `phone_confirmed_at = p_phone` en `register_my_customer_account` (+ `SECURITY DEFINER`/`search_path`/RLS de enlace) y su test negativo. Marcar el ítem `sub-1:220`.
2. **[Recomendado · H2]** Evaluar un guard de rutas por `phone_confirmed_at` para eliminar el estado "limbo" (defensa en profundidad).
3. **[Ligado a H1 · H3]** Alinear la normalización de teléfono servidor↔cliente (o enviar E.164 como `p_phone`).
4. **[Backlog · H4]** Definir la política de re-verificación al editar el teléfono en Perfil y validar la RLS de `customers`.

**Conclusión:** la implementación de cliente de sub-7 es **correcta y segura**; cumple los tres requisitos y está bien probada. El cierre de seguridad del *flujo completo* queda **condicionado** a confirmar el check servidor **H1** en Salón OS, que es la pieza que convierte "hay un teléfono verificado" en "el teléfono que se enlaza está verificado".
