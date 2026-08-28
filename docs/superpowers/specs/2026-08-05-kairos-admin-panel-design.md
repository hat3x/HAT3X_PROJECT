# Kairos Admin — Panel de administración (super-admin) · Diseño

**Fecha:** 2026-08-05
**Autor:** Jose (HAT3X) + Claude
**Estado:** Diseño aprobado en brainstorming, pendiente de revisión y de plan de implementación.

## 1. Propósito

Kairos es un SaaS multi-tenant multi-sector (Next.js + Supabase). Hoy dar de alta un
cliente nuevo (salón/clínica) y gestionarlo se hace **a mano, por SQL y scripts sueltos**:
crear el salón, el login del dueño, los add-ons, el catálogo (profesionales/servicios/
horarios), emitir API keys de recepción, resetear contraseñas… Es lento y propenso a error.

**Kairos Admin** es una app de escritorio (solo para Jose) que automatiza todo eso desde
una interfaz, reutilizando la lógica que ya se ha probado a mano esta temporada.

Usuario único: Jose. No es un producto para clientes.

## 2. Decisiones tomadas (brainstorming)

| Tema | Decisión |
|---|---|
| Forma | App de **escritorio Windows** (`.exe`), ventana nativa con **pywebview** (UI web en ventana, sin navegador externo). |
| Acceso a datos | **Directo a Supabase** con la **service_role key** guardada en config LOCAL cifrada. Sin construir endpoints nuevos en la app de producción. |
| Alcance v1 | Alta de tenant + gestión de **add-ons** + emitir/revocar **API keys de recepción** + **reset de contraseña** + **sembrar catálogo**. |
| Seguridad | **Contraseña maestra** al abrir la app (descifra la config). |
| Catálogo | **Dos vías**: plantillas por sector (editables) **y** importación de ficheros (CSV / JSON). |
| Empaquetado | **PyInstaller** → un único `KairosAdmin.exe`. |

## 3. Arquitectura

Ventana **pywebview** que carga una UI web local (HTML/CSS/JS embebido, look Kairos) y
expone un **bridge** Python (la UI llama funciones Python vía `window.pywebview.api`). El
backend Python habla con Supabase (service_role) por HTTPS. Sin servidor propio, sin red
salvo las llamadas a Supabase.

```
KairosAdmin.exe (PyInstaller)
├─ ui/                      # frontend embebido
│  ├─ index.html
│  ├─ app.js                # llama a window.pywebview.api.*
│  └─ styles.css            # paleta Kairos (tinta/porcelana/latón, Inter)
└─ kairos_admin/            # backend Python
   ├─ config.py             # carga/guarda config CIFRADA; deriva clave de la master password
   ├─ crypto.py             # cifrado simétrico (Fernet/scrypt) de la config
   ├─ supa.py               # cliente Supabase: PostgREST (service_role) + Auth admin API
   ├─ ops/
   │  ├─ tenants.py         # list/create/update salón; activar/desactivar
   │  ├─ features.py        # leer/poner salon_features (add-ons) + nombre recepcionista
   │  ├─ access.py          # login del dueño, reset password (Auth admin), API keys
   │  ├─ catalog.py         # profesionales/servicios/horarios: leer, sembrar, importar
   │  └─ templates.py       # plantillas de catálogo por sector
   ├─ importers.py          # parseo CSV/JSON al esquema canónico de catálogo
   └─ bridge.py             # API expuesta a la UI (validación + llamada a ops.*)
```

**Reutilización**: `ops/*` reutiliza la lógica ya probada esta temporada (crear salón,
insertar miembros/horarios/servicios, emitir `service_api_key`, reset por Auth admin API).
La verdad del esquema está en la BD de Kairos; el panel no crea DDL, solo opera datos.

## 4. Secretos y seguridad

- **Config cifrada** en `%APPDATA%\KairosAdmin\config.enc`: contiene `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (y opcionalmente el project ref). **Nunca** incrustada en el
  `.exe` ni en texto plano.
- **Contraseña maestra**: al abrir, Jose la teclea. De ella se deriva la clave (scrypt/PBKDF2)
  que descifra `config.enc` (Fernet/AES-GCM). Config y `.exe` copiados sin la contraseña son
  inútiles. Primer arranque: asistente que pide URL + service_role + fija la contraseña maestra.
- **Show-once**: las contraseñas de acceso generadas y las API keys en claro se muestran
  **una sola vez** al crearlas y nunca se persisten en claro (las passwords las gestiona Auth;
  de las API keys solo se guarda hash SHA-256 + prefijo, como ya hace el esquema).
- **Sin logs de secretos**: nada de service_role/keys/passwords a fichero de log.

## 5. Pantallas (UX)

1. **Desbloqueo** — pide la contraseña maestra. (Primer arranque: alta de config.)
2. **Tenants** (home) — tabla de salones: nombre · sector · activo · add-ons (chips). Buscador.
   Botón **＋ Nuevo tenant**. Fila → detalle.
3. **Detalle de tenant** — pestañas:
   - *General*: nombre, slug, sector, zona horaria, activo/inactivo.
   - *Add-ons*: toggles de `salon_features` — recepcionista IA (+ campo nombre, p. ej. "Sara"),
     TPV, fidelización, app de cliente, app de staff.
   - *Acceso & API keys*: ID de login del dueño, botón **reset de contraseña** (muestra la nueva
     una vez); lista de API keys de recepción (prefijo + fecha) con **emitir** (muestra en claro
     una vez) y **revocar**.
   - *Catálogo*: profesionales, servicios (con fases application/exposure/post), horarios por
     profesional; ver + añadir/editar; botón **importar** (CSV/JSON) y **cargar plantilla**.
4. **Alta de tenant** (asistente por pasos):
   1. Salón: nombre, sector, zona horaria (slug autogenerado, editable).
   2. Login del dueño: ID (deriva email sintético `<id>@salonos.app`) + contraseña (generada o
      manual).
   3. Add-ons: qué features activar (+ nombre recepcionista si aplica).
   4. Catálogo (opcional): vacío · plantilla del sector · importar fichero.
   5. Extras (opcional): emitir API key de recepción.
   6. **Resumen**: credenciales del dueño + API key en claro (una vez) + qué se creó.

## 6. Operaciones → mapa a Supabase

| Operación | Tablas / API |
|---|---|
| Crear salón | insert `salons` (name, slug, sector, timezone, active, settings) |
| Login del dueño | Auth admin API: crear usuario (`<id>@salonos.app` + password); insert `salon_members` (role=owner) |
| Reset contraseña | Auth admin API: `PUT /auth/v1/admin/users/{uid}` con service_role |
| Add-ons | upsert `salon_features` (feature enum: loyalty/client_app/staff_app/ai_receptionist/pos; enabled; notes=nombre recepcionista) |
| API key recepción | generar `sk_recep_<43 base62>`; insert `service_api_keys` (salon_id, name, key_hash=SHA-256, key_prefix, scopes); mostrar en claro una vez |
| Revocar API key | delete/deshabilitar fila en `service_api_keys` |
| Catálogo | insert `professionals`, `services` (application_min/exposure_min/post_exposure_min → duration_minutes generado), `professional_schedules` (weekday 0-6, start/end TIME), `professional_services` |
| Editar salón | update `salons`; activar/desactivar = `active` |

Todo acotado por `salon_id` (el service_role omite RLS; el aislamiento se hace a mano, igual
que en la app).

## 7. Sembrar catálogo (dos vías)

**Esquema canónico** de catálogo que consumen ambas vías:

```json
{
  "professionals": [{ "full_name": "Nadia Ros", "color": "#8a5a2b" }],
  "services": [{ "name": "Revisión", "category": "General",
                 "application_min": 20, "exposure_min": 0, "post_exposure_min": 0,
                 "price_cents": 3000, "currency": "EUR" }],
  "schedules": [{ "professional": "Nadia Ros", "weekday": 1,
                  "start": "10:00", "end": "14:00" }],
  "links": [{ "professional": "Nadia Ros", "service": "Revisión" }]
}
```

- **Plantillas por sector** (`ops/templates.py`): dental, peluquería, clínica… con
  servicios/horarios típicos ya rellenos en el esquema canónico. Se cargan y se editan en el
  asistente antes de aplicar.
- **Importación de ficheros** (`importers.py`):
  - **JSON**: directamente el esquema canónico.
  - **CSV**: un CSV por entidad (profesionales, servicios, horarios) o uno combinado con
    columna `tipo`; el importador mapea columnas → esquema canónico.
  - Los exports "sucios" del mundo real (RTF/DB como el de Biodental) se convierten primero a
    CSV/JSON canónico (paso previo puntual, fuera del flujo estándar del panel v1); si aparece
    recurrentemente, se añade un mapeador dedicado en una versión posterior.
- Antes de aplicar: **vista previa** de lo que se va a crear + validación (nombres únicos,
  fases numéricas, weekday 0-6, horas válidas).

## 8. Fuera de alcance v1 (YAGNI)

Multiusuario / roles; auditoría o logs remotos; edición fina de citas (eso lo hace el cliente
en su propio panel de Kairos); analítica/informes; branding avanzado (más allá de lo mínimo);
gestión de facturación. Se pueden añadir después.

## 9. Riesgos y decisiones abiertas

- **service_role en la máquina de Jose**: mitigado con cifrado + contraseña maestra; es su
  equipo y un único usuario. Aceptado.
- **Auth admin API**: crear usuario y reset de contraseña dependen de endpoints de Supabase
  Auth con service_role; confirmar la ruta exacta y el manejo de errores (email duplicado, etc.).
- **Slug único**: autogenerar desde el nombre y validar unicidad antes de insertar.
- **PyInstaller + pywebview**: en Windows usa el runtime WebView2 (Edge). Verificar que el
  empaquetado one-file arranca en una máquina limpia (WebView2 suele venir con Windows 11).
- **Ubicación del código**: nuevo proyecto `clients/projects/kairos-admin/` (hermano de
  `salon-os`), repo propio o dentro del monorepo — a decidir en el plan.
