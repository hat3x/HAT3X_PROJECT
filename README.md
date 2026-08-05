# Kairos Admin

Panel de escritorio (Windows) para que Jose administre el SaaS **Kairos** sin tocar SQL a
mano: alta de tenants (salones/clínicas), add-ons, API keys de recepción, reset de
contraseñas y siembra de catálogo (profesionales/servicios/horarios).

Uso interno, un único usuario. Habla directo con Supabase (PostgREST + Auth admin API)
usando la `service_role key` del proyecto — no hay backend propio ni endpoints nuevos en
producción.

## Arquitectura, en una frase

Ventana [pywebview](https://pywebview.flowrl.com/) que carga una UI local (`ui/`, HTML/CSS/JS
vanilla, sin CDNs) y expone un bridge Python (`kairos_admin/bridge.py`, clase `Api`) que la
UI llama vía `window.pywebview.api.*`. La lógica de negocio vive en `kairos_admin/ops/*`
(Python puro, testeado con pytest) y usa `kairos_admin/supa.py` para hablar con Supabase.

```
run.py                    → entry point (dev: python run.py)
kairos_admin.spec         → build PyInstaller (.exe one-file)
kairos_admin/              → backend (config cifrada, ops.*, bridge)
ui/                        → frontend embebido (index.html, styles.css, app.js)
tests/                     → pytest (backend, sin red)
```

## Instalación (desarrollo)

Requiere Python 3.11+ en Windows.

```powershell
cd clients/projects/kairos-admin
pip install -r requirements.txt
```

## Arrancar en desarrollo

```powershell
python run.py
```

Abre una ventana nativa "Kairos Admin" con **WebView2** (viene incluido en Windows 11; en
Windows 10 puede requerir instalar el runtime — ver `MANTENIMIENTO.md`).

## Primer arranque

La primera vez que se abre el panel, pide:

1. **URL de Supabase** del proyecto Kairos (`https://xxxx.supabase.co`).
2. **Service role key** de ese proyecto (Supabase → Project Settings → API).
3. Una **contraseña maestra** que tú eliges.

Con esos datos guarda una configuración **cifrada** (Fernet + scrypt) en:

```
%APPDATA%\KairosAdmin\config.enc
```

La `service_role key` **nunca** se guarda en texto plano, nunca viaja al `.exe`, y nunca se
escribe en logs. En cada arranque posterior, el panel solo pide la contraseña maestra para
descifrar esa configuración.

> Si trabajas en varias máquinas o quieres aislar la config de pruebas de la real, la
> variable de entorno `KAIROS_ADMIN_HOME` sobreescribe la carpeta de `%APPDATA%\KairosAdmin`
> (así es como lo hacen los tests).

## Qué puedes hacer desde el panel

- **Tenants**: lista con buscador, add-ons por tenant (chips), alta/baja.
- **Detalle de un tenant**: General (nombre/slug/sector/zona horaria/activo), Add-ons
  (loyalty, app de cliente, app de staff, recepcionista IA + nombre, TPV), Acceso & API keys
  (reset de contraseña, emitir/revocar claves de recepción), Catálogo (profesionales,
  servicios, horarios, asignaciones — solo lectura).
- **Asistente de alta**: salón → dueño → add-ons → catálogo (vacío, plantilla del sector o
  importado desde CSV/JSON) → extras (API key) → resumen con credenciales **en claro, una
  sola vez**.

Todo lo que se muestra "una vez" (contraseñas generadas, claves de API) no se vuelve a
mostrar: cópialo antes de continuar.

## Build (`.exe`)

```powershell
pip install pyinstaller
pyinstaller kairos_admin.spec
```

Genera `dist/KairosAdmin.exe` (un único fichero, sin consola, con `ui/` empaquetado dentro).
Pruébalo primero contra un **proyecto de Supabase de pruebas**, nunca contra producción sin
haberlo verificado.

## Tests

```powershell
pytest -q
```

El backend (`kairos_admin/`) tiene 30 tests que no tocan red — usan un `FakeSupabase` en
memoria y un transporte HTTP falso. La UI (`ui/`) no tiene tests automatizados (es HTML/JS
servido a una ventana nativa); se verifica manualmente con `python run.py` y con
`node --check ui/app.js` para detectar errores de sintaxis.

## Seguridad, resumido

- `service_role key` solo cifrada en disco, protegida por la contraseña maestra.
- Contraseñas de dueños y API keys de recepción: **show-once**, nunca persistidas en claro
  por el panel (las passwords las gestiona Supabase Auth; de las API keys solo se guarda
  `key_hash` + `key_prefix`, igual que en el resto del esquema Kairos).
- Aislamiento por `salon_id` en cada operación (el `service_role` omite RLS, así que el
  aislamiento lo hace el propio código de `ops/*`).

Más detalle de troubleshooting y mantenimiento en [`MANTENIMIENTO.md`](./MANTENIMIENTO.md).
