# Mantenimiento — Kairos Admin

Guía rápida de troubleshooting para Jose. Si algo no está aquí, revisa primero
`kairos_admin/bridge.py` (todos los errores de negocio llegan a la UI como
`{"error": "..."}`, nunca como excepción sin capturar) y `tests/` (30 tests, `pytest -q`).

## La ventana no abre / pantalla en blanco

- **Causa más probable**: falta el runtime **WebView2** (motor de la ventana en Windows).
  Windows 11 lo trae de serie; en Windows 10 puede no estar. Instálalo desde
  [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
  (elige "Evergreen Bootstrapper").
- Si acabas de hacer `pyinstaller kairos_admin.spec`, prueba primero en dev
  (`python run.py`) para descartar que sea un problema del build, no de WebView2.
- Antivirus/SmartScreen puede bloquear un `.exe` sin firmar la primera vez — "Más
  información" → "Ejecutar de todas formas" (solo en tu propia máquina, con un build que tú
  mismo has generado).

## Olvidé la contraseña maestra

No hay recuperación: la contraseña maestra deriva la clave de cifrado (scrypt) y no se
guarda en ningún sitio, ni siquiera cifrada. Si la pierdes:

1. Borra `%APPDATA%\KairosAdmin\config.enc`.
2. Vuelve a abrir el panel → te pedirá el primer arranque otra vez (URL + service_role +
   nueva contraseña maestra).

**Los datos en Supabase no se pierden** — esto solo resetea la config local del panel
(URL + service_role + contraseña), no toca la base de datos.

## "Contraseña maestra incorrecta" aunque estoy seguro de que es correcta

- Revisa mayúsculas/bloq mayús — es sensible a mayúsculas/minúsculas.
- Si el fichero `config.enc` se copió de otra máquina o se corrompió (p. ej. copia a medias),
  el descifrado fallará igual que con una contraseña incorrecta. Compara el tamaño del
  fichero con uno sano o rehaz el primer arranque (ver arriba).

## Error de Supabase al listar/crear tenants

Casi siempre es la config de conexión, no un bug del panel:

- **URL mal escrita**: debe ser `https://xxxx.supabase.co`, sin `/rest/v1` ni barra final.
- **Service role key incorrecta o rotada**: si rotaste la key en Supabase → Project Settings
  → API, hay que rehacer el primer arranque con la nueva key (borra `config.enc` y vuelve a
  arrancar).
- **Proyecto de Supabase equivocado** (p. ej. apuntando al de pruebas en vez de al real, o al
  revés): confírmalo en Supabase → Project Settings → General → Reference ID.
- El mensaje de error que devuelve `bridge.py` incluye el código HTTP y el cuerpo de la
  respuesta de Supabase (primeros 300 caracteres) — normalmente basta para saber qué falló
  (401/403 → key; 404 → tabla/URL; 409 → conflicto de unicidad, etc.).

## Reset completo de la configuración del panel

```powershell
del "%APPDATA%\KairosAdmin\config.enc"
```

Vuelve a arrancar el panel: pedirá el primer arranque de nuevo. No afecta a los datos en
Supabase, solo a la config local (URL + service_role + contraseña maestra).

## "Importar fichero" en el asistente de alta no encuentra la ruta

El panel todavía **no tiene selector de ficheros nativo** (limitación conocida, ver
"Limitaciones conocidas" más abajo): hay que pegar la ruta completa a mano. En el Explorador
de Windows: **Mayús + clic derecho sobre el fichero → "Copiar como ruta de acceso"**, y pega
tal cual (incluidas las comillas, si las trae — Python las admite).

Si el CSV/JSON tiene columnas o campos que no encajan con el esquema canónico (ver
`docs/superpowers/specs/2026-08-05-kairos-admin-panel-design.md`, §7), la vista previa del
asistente mostrará los errores de validación antes de dejarte continuar.

## Resetear la contraseña de un dueño / emitir una API key: no tengo el ID de usuario

La pestaña "Acceso & API keys" del detalle de un tenant pide el **ID de usuario de Supabase
Auth** para resetear contraseñas — el panel todavía no lo resuelve automáticamente (ver
limitación conocida abajo). Búscalo en:

**Supabase → Authentication → Users** → filtra por el email sintético del dueño
(`<id_de_acceso>@salonos.app`) → copia el `UID` de esa fila.

## Limitaciones conocidas / mejoras futuras

Documentadas aquí para que no sorprendan en producción — son recortes de alcance
deliberados de esta v1, dentro de la API que expone `bridge.py` tal cual está hoy:

- **Sin selector de ficheros nativo** para importar catálogo: se pega la ruta a mano. Mejora
  futura: añadir un método al bridge que llame a
  `webview.windows[0].create_file_dialog(...)` y lo devuelva a la UI.
- **La pestaña Acceso no resuelve el ID de usuario del dueño automáticamente**: `get_tenant`
  no expone hoy el `user_id`/email del owner (solo `salon`, `features`, `api_keys`,
  `catalog`). Toca buscarlo en el dashboard de Supabase. Mejora futura: que `get_tenant`
  incluya los miembros del salón (`salon_members` + email del owner).
- **`create_tenant` no es transaccional**: si falla a mitad de camino (p. ej. tras crear el
  salón pero antes de aplicar el catálogo), puede quedar un tenant a medias. La UI mostrará
  el error; revisa en Supabase qué se llegó a crear y decide si reintentar (creará un slug
  distinto, p. ej. `-2`) o limpiar a mano.
- **Catálogo de un tenant ya existente es de solo lectura** en el panel: el bridge no expone
  hoy un método para aplicar catálogo fuera del asistente de alta. Para añadir catálogo a un
  tenant ya creado, sigue el proceso manual habitual (SQL/scripts) hasta que se añada esa
  operación al bridge.

## Tests

```powershell
pytest -q
```

Deben pasar 30 tests, todos contra `FakeSupabase` (sin red). Si tocas algo en `kairos_admin/`
o `tests/`, vuelve a correrlos antes de dar nada por bueno. La UI (`ui/`) no tiene tests
automatizados; verifica sintaxis con:

```powershell
node --check ui/app.js
```

y funcionalmente con `python run.py` contra un **proyecto de Supabase de pruebas** (nunca
producción) antes de dar un cambio por bueno.
