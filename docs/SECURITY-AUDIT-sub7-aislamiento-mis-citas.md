# Auditoría de seguridad — Aislamiento de datos en «Mis Citas» y lectura *self* de la ficha (sub-7)

> **Cliente:** denueveanueve · **App:** cliente React/Vite sobre Supabase de **Salón OS** (`jztoyekixcziaicrnlce`)
> **Autor:** Security Engineer (HAT3X · webs-apps) · **Fecha:** 2026-07-19 · **Versión:** 1.0
> **Alcance (sub-7):** verificar que (1) ninguna consulta pueda filtrar citas/fichas de **otros clientes o salones**,
> (2) el **slug** no permita **fugas cruzadas**, y (3) no se expongan **claves de servicio** en el **bundle del cliente**.

---

## 1. Veredicto ejecutivo

| # | Requisito de la subtarea | Veredicto | Severidad residual |
|---|---|---|---|
| R1 | Ninguna consulta filtra citas/fichas de otros clientes o salones | ✅ **PASA** (frontend correcto; la garantía real es RLS de servidor, documentada) | — |
| R2 | El slug no permite fugas cruzadas entre salones | ✅ **PASA** | — |
| R3 | No se exponen claves de servicio en el bundle del cliente | ✅ **PASA** (verificado empíricamente sobre `dist/`) | — |

**Conclusión.** La superficie concreta de sub-7 —«Mis Citas» (`useAppointments` + `Appointments.tsx`) y la lectura
*self* de la ficha (`useCustomer`)— está **diseñada correctamente** con mínimo privilegio y sin ningún camino de
código que filtre datos entre clientes o salones. El **único** JWT que viaja en el bundle es la **anon key**
(`role: anon`, pública por diseño y acotada por RLS); **no** hay `service_role` ni tokens de servidor.

Se detecta **1 hallazgo MEDIO** en una superficie **adyacente** (`Home.tsx`) que sobre-expone al cliente columnas
internas del staff (`notes`/`cancelled_reason`) por usar `select('*')`, rompiendo la disciplina de mínimo privilegio
del resto de la app. No es una fuga entre inquilinos, pero debe corregirse. El resto son observaciones de
defensa en profundidad, la mayoría dependientes de RLS/Realtime en el **servidor** de Salón OS (fuera de este repo).

---

## 2. Modelo de datos y frontera de confianza

```
                    Navegador (código NO confiable — el usuario controla devtools)
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  supabase-js (anon key + JWT de sesión del usuario en localStorage)         │
  │     · useCustomer  → customers  WHERE user_id = auth.uid() AND salon_id     │
  │     · useAppointments → appointments WHERE customer_id = (mi ficha) AND     │
  │                          salon_id = (salón resuelto)                        │
  │  fetch anónimo → API pública Salón OS /api/public/booking/{slug} (catálogo) │
  └───────────────────────────────────────────────────────────────────────────┘
                    │  (todo pasa por la FRONTERA de confianza ↓)
  ══════════════════╪══════════════════════════════════════════════════════════
                    ▼   Servidor Salón OS (confiable): PostgREST + RLS + RPC
     La ÚNICA barrera de aislamiento real. RLS evalúa auth.uid() por fila.
```

**Principio rector (correctamente asumido por el código y la doc):** los filtros `.eq('customer_id', …)` /
`.eq('salon_id', …)` del cliente son **defensa en profundidad**, no la barrera de seguridad. Un usuario autenticado
malicioso puede, desde devtools, lanzar `supabase.from('appointments').select('*')` sin filtros o con otro
`customer_id`. **Lo único que le impide leer datos ajenos es la política RLS del servidor.** Ver
`docs/PENDIENTE-mis-citas-rls.md`: la política *self* `self_select_own_appointments` vive en Salón OS y **no**
se administra desde esta app; su ausencia se maneja con honestidad (aviso, sin escalar privilegios).

---

## 3. Requisito R1 — Aislamiento entre clientes y salones ✅ PASA

### 3.1 «Mis Citas» (`useAppointments.ts`)
- **Origen de `customer_id`:** deriva de `useCustomer()`, que lee `customers WHERE user_id = auth.uid() AND
  salon_id = <salón resuelto>` (`useCustomer.ts:34-39`). Es **siempre la ficha del propio usuario**; nunca un id
  ajeno introducido por el cliente.
- **Consulta de citas** (`useAppointments.ts:76-82`): `select(COLUMNAS_EXPLÍCITAS)` +
  `.eq('customer_id', customerId).eq('salon_id', salonId)` + `.limit(200)`. Doble filtro coherente.
- **FK compuesta `(customer_id, salon_id) → customers(id, salon_id)`** confirmada en los tipos generados
  (`types.ts:178-182`): un `customer_id` pertenece a **exactamente un** salón, así que `customer_id` y `salon_id`
  no pueden desincronizarse. No existe combinación «mi customer_id + salón ajeno».
- **Mínimo privilegio de columnas** (`useAppointments.ts:35-36`, `appointments.ts:39-49`): se seleccionan solo
  `id, starts_at, ends_at, status, service_id, professional_id, price_cents, currency`. Se **omiten a propósito**
  `notes` y `cancelled_reason` —columnas reales (`types.ts:126,133`) que pueden llevar notas internas del staff—.
  Correcto: RLS filtra **filas**, no columnas; la app hace el recorte de columnas.
- **Enriquecido con catálogo público:** los nombres de servicio/profesional se resuelven contra el bootstrap
  **anónimo y público** del salón; si no resuelve, se muestra `null` (rótulo genérico). No hay lectura de tablas
  `services`/`professionals` (RLS de staff). Sin fuga.
- **Degradación honesta:** si el servidor rechaza la lectura (`42501 permission denied`), `isAccessDeniedError`
  lo detecta (`appointments.ts:94-105`) y la UI muestra un aviso; **nunca** intenta un acceso alternativo,
  `service_role`, ni abre filtros (`Appointments.tsx:320-322`, doc §54-57). Comportamiento seguro y explícito.

### 3.2 Lectura *self* de la ficha (`useCustomer.ts`)
- `select('id, full_name, phone, phone_e164, email')` acotado a `user_id = auth.uid()` **y** `salon_id`
  (`useCustomer.ts:34-39`). Mínimo privilegio: se **omiten** `qr_token`, `tax_id`, `notes`, `address`,
  `birth_date` (comentario `useCustomer.ts:8-14`). `maybeSingle()` → `null` sin lanzar si aún no hay ficha.
- No hay forma de que la consulta devuelva la ficha de otro usuario: `auth.uid()` lo impone el JWT (servidor),
  y el filtro `user_id` es defensa en profundidad adicional.

### 3.3 Escenario multi-salón (no es fuga)
Si un usuario fuerza `?salon=otro-salon`, se resuelve `salon_id = otro`; `useCustomer` busca **su** ficha en ese
salón y `useAppointments` **sus** citas en ese salón. Si no es cliente de ese salón → `customerId = null` →
consultas **deshabilitadas** (`enabled: !!customerId`). Si lo es, ve **lo suyo** en ese salón (función legítima
multi-inquilino). En ningún caso ve datos de **otros clientes**. RLS acota `customer_id ∈ (mis fichas)` con
independencia del filtro de salón.

**Dependencia de servidor (documentada, no defecto del frontend):** toda la garantía anterior descansa en que
Salón OS tenga la política RLS *self* de solo lectura sobre `public.appointments` (y equivalente en `customers`).
Está correctamente rastreado en `docs/PENDIENTE-mis-citas-rls.md` §4-5. **Acción de servidor**, fuera de alcance
de esta app.

---

## 4. Requisito R2 — El slug no permite fugas cruzadas ✅ PASA

- **Validación estricta** (`salon.ts:31-42`): `^[a-z0-9]+(?:-[a-z0-9]+)*$`, longitud 1–63, `trim().toLowerCase()`.
  Query y env pasan por `normalizeSlug`; el subdominio por `extractSubdomain` (ignora IPs, `localhost`, `www`, apex).
- **Sin inyección:** el slug se pasa como **parámetro** de la RPC `get_salon_branding(p_slug)` (parametrizado,
  `salon-branding.ts:20`) y como segmento `encodeURIComponent(slug)` en las URLs de la API pública
  (`salon-os-api.ts:184-191`). No hay concatenación en SQL ni en rutas.
- **El slug NUNCA parametriza las consultas de citas/ficha.** Esas usan el `salon_id` (uuid opaco derivado del
  branding) y el `customer_id` propio. El slug sólo elige **qué branding y catálogo PÚBLICOS** se piden —datos ya
  públicos por diseño (RPC anon + endpoint anon)—.
- **Peor caso de manipulación de slug:** el atacante obtiene branding/catálogo público de otro salón (ya público)
  y, como mucho, **sus propios** datos en ese salón (§3.3). No hay fuga entre clientes ni exfiltración cruzada.

---

## 5. Requisito R3 — Sin claves de servicio en el bundle ✅ PASA (verificado)

- **Exposición de Vite:** solo se inyectan variables con prefijo `VITE_` (prefijo por defecto; `vite.config.ts`
  no define `envPrefix` ni `define` que lo amplíe). Usos en código (`import.meta.env.VITE_*`): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), `VITE_SALON_SLUG`, `VITE_STRIPE_PUBLISHABLE_KEY` (publishable),
  `VITE_SALON_OS_API_URL`. **Todas públicas por diseño.**
- **Claves de servidor** (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_API_TOKEN`, `API_KEY_APP_DENUEVEANUEVE`,
  `STRIPE_SECRET_KEY`) están **sin** prefijo `VITE_` (ver `.env.example:36-40`, etiquetado «NUNCA en el bundle»),
  por lo que Vite **no** las incluye. Sólo las consumen las Edge Functions (Deno, servidor) — legítimo.
- **Verificación empírica sobre el bundle compilado (`dist/`):**
  - Búsqueda de marcadores `service_role|SERVICE_ROLE|SUPABASE_API_TOKEN|API_KEY_APP_DENUEVEANUEVE|STRIPE_SECRET`
    en `dist/**` → **0 coincidencias**.
  - JWTs presentes en el bundle → **1**, y su payload decodificado es `{"iss":"supabase","ref":"jztoyeki…",
    "role":"anon"}`. Es la **anon key** (pública, RLS-gated). **No** aparece ningún token con `role: service_role`.
- **Control de repositorio:** `git ls-files` sólo rastrea `.env.example` (placeholders). Los `.env` reales y los
  `.bak` están correctamente en `.gitignore` (`.env`, `.env.*` salvo `.env.example`). El `.env` local **no** define
  ninguna clave sensible bajo prefijo `VITE_` (solo `VITE_SALON_*`, `VITE_SUPABASE_URL/PUBLISHABLE_KEY/PROJECT_ID`).

---

## 6. Hallazgos y recomendaciones

Cada hallazgo lleva severidad, evidencia, explotabilidad y remediación.

### 🟠 F1 · MEDIO — `Home.tsx` sobre-expone columnas internas del staff (`select('*')`) y omite el filtro `salon_id`
- **Evidencia:** `src/pages/Home.tsx:69-77`
  ```ts
  supabase.from('appointments')
    .select('*, locations(name)')          // ← trae TODAS las columnas
    .eq('customer_id', customer.id)        // ← sin .eq('salon_id', …)
    .in('status', ['pending', 'confirmed'])
  ```
- **Explotabilidad:** el card «próxima cita» de Home trae al cliente **su propia** cita con **todas** las columnas,
  incluidas `notes` y `cancelled_reason` (`types.ts:126,133`) —justamente las que `useAppointments` excluye por
  poder contener **observaciones internas del staff sobre el cliente**—. No es fuga entre inquilinos (es la cita del
  propio usuario), pero **sí** expone al cliente información que no debería ver. Además, la referencia
  `locations(name)` es del **esquema legacy de Lovable** (`location_id`/`locations`), no del de Salón OS
  (`salon_id`); es deriva de esquema previa a la migración de sub-6 que quedó sin actualizar.
- **Impacto:** exposición de datos internos (confidencialidad, alcance limitado a la propia ficha) + inconsistencia
  con la disciplina de mínimo privilegio del resto de la app + posible fallo/ruido por relación inexistente.
- **Remediación (mismo patrón que `useAppointments`):**
  ```ts
  supabase.from('appointments')
    .select('id, starts_at, ends_at, status, service_id, professional_id, price_cents, currency')
    .eq('customer_id', customer.id)
    .eq('salon_id', salonId)              // añadir el filtro defensivo de salón
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', now)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  ```
  Sustituir el nombre mostrado por resolución vía catálogo público (como en «Mis Citas»), eliminando el join
  `locations(name)`. *(Requiere confirmar con el PM qué campos usa realmente el card antes de aplicar.)*

### 🟡 F2 · BAJO (dependiente de servidor) — Suscripciones Realtime confían en RLS de Realtime del servidor
- **Evidencia:** `src/pages/Loyalty.tsx:74-85` — `postgres_changes` sobre `loyalty_accounts`, **`appointments`** y
  `welcome_coupons` con `filter: customer_id=eq.${customerId}`.
- **Explotabilidad:** Supabase Realtime sólo aplica RLS a `postgres_changes` si la **autorización de Realtime**
  está habilitada en el servidor. Si Salón OS no la tiene activa, un cliente podría suscribirse con **otro**
  `customer_id` y recibir eventos de cambio ajenos (incluye citas). El filtro del cliente **no** es barrera.
- **Remediación (servidor, Salón OS):** confirmar que Realtime Authorization/RLS está activo para esas tablas
  (misma clase de dependencia que la RLS *self* del PENDIENTE). Verificar con dos JWT de clientes distintos que un
  cliente no recibe eventos del otro.

### 🟡 F3 · BAJO — JWT de sesión en `localStorage` (riesgo de robo vía XSS)
- **Evidencia:** `src/integrations/supabase/client.ts:23-28` (`storage: localStorage`).
- **Explotabilidad:** es el patrón por defecto de Supabase en SPA (sin SSR no hay cookies `httpOnly` fáciles). Un
  XSS permitiría exfiltrar el JWT y la anon key. **No** hay sumideros peligrosos de entrada de usuario: sin
  `console.log` de datos sensibles, sin `eval`; el único `dangerouslySetInnerHTML` es CSS estático del componente
  chart de shadcn (`src/components/ui/chart.tsx:70`, no entrada de usuario). React auto-escapa el render.
- **Remediación (defensa en profundidad):** cabecera **CSP** estricta en el hosting, higiene de dependencias
  (`npm audit`), y mantener el render sin `dangerouslySetInnerHTML` de datos de usuario.

### ⚪ F4 · INFO — Uso de `select('*')` en tablas de fidelización
- **Evidencia:** `Loyalty.tsx:120,127,135` (`points_movements`, `rewards`, `welcome_coupons`), `Club.tsx`,
  `PremiumBenefits.tsx`.
- **Nota:** no es fuga entre inquilinos (siguen acotadas por `customer_id`+`salon_id`+RLS), pero rompe la
  consistencia de mínimo privilegio; si esas tablas ganan columnas sensibles, viajarán al cliente. Recomendado:
  listas de columnas explícitas.

### ⚪ F5 · INFO — Código muerto con la disciplina antigua
- **Evidencia:** `src/pages/_deferred/reservations-3B-2/Appointments.tsx:75,119` — `select('*')`, **sin**
  `salon_id`, y `UPDATE status='CANCELLED'` desde el cliente. **Confirmado que NO se importa** en ningún sitio
  (`grep _deferred` en `src/` → 0), por lo que el tree-shaking lo excluye del bundle: **no es vulnerabilidad
  activa**. Recomendado eliminarlo o mantenerlo claramente en cuarentena; si se reactiva, regresa el aislamiento.

---

## 7. Controles positivos confirmados (lo que ya se hace bien)

- ✅ Selección **explícita de columnas** con exclusión intencional de `notes`/`cancelled_reason` (citas) y de
  campos sensibles de la ficha (`qr_token`, `tax_id`, `address`, `birth_date`) — `useAppointments.ts`, `useCustomer.ts`.
- ✅ **FK compuesta** `(customer_id, salon_id)` que impide desincronizar cliente y salón.
- ✅ **Rechazo de permiso manejado con honestidad**, sin escalar privilegios ni usar `service_role`
  (`isAccessDeniedError`, `BlockedNotice`).
- ✅ **Slug validado y parametrizado**; sólo selecciona datos públicos.
- ✅ **Sin `service_role` en el bundle** (verificado sobre `dist/`); sólo la anon key pública.
- ✅ **Secretos de servidor** fuera del prefijo `VITE_` y fuera de git (`.env.example` con placeholders).
- ✅ Query deshabilitada hasta tener ficha (`enabled: !!customerId && !!salonId`) — evita lecturas sin sujeto.

---

## 8. Plan de verificación (para cerrar)

**Frontend (este repo):**
- [ ] Aplicar F1 en `Home.tsx` (columnas explícitas + `.eq('salon_id', …)`; quitar `locations(name)`).
- [ ] (Opcional) F4: columnas explícitas en las lecturas de fidelización.
- [ ] (Opcional) F5: eliminar/cuarentenar `src/pages/_deferred/`.

**Servidor Salón OS (fuera de alcance de esta app — coordinar con quien administre `jztoyekixcziaicrnlce`):**
- [ ] Existe política RLS *self* `SELECT` en `public.appointments` acotada a `customer_id ∈ (customers de auth.uid())`
      + `GRANT SELECT` a `authenticated` (ver `PENDIENTE-mis-citas-rls.md` §4).
- [ ] RLS *self* equivalente en `public.customers`.
- [ ] **Realtime Authorization** activo para `appointments`, `loyalty_accounts`, `welcome_coupons` (F2).
- [ ] Prueba funcional con **dos** JWT de clientes distintos: cada uno ve **solo lo suyo**; cero filas/eventos
      ajenos; con otro salón, tampoco.

---

### Anexo — Metodología
Revisión estática de `src/**` (consultas Supabase, resolución de slug, config, auth), lectura de tipos generados
(`types.ts`) para confirmar columnas/FKs, verificación de configuración de entorno (`.env*`, `.gitignore`,
`vite.config.ts`) y **análisis empírico del bundle compilado** (`dist/`) buscando marcadores de secreto y
decodificando los JWT embebidos. Skills aplicadas: `everything-claude-code:security-review` (checklist OWASP).
