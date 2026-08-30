> **JUBILADA (agosto 2026).** Las horas se fichan desde Atlas (`/dinero/horas` y el botón del marco). Su histórico está volcado en `fichajes` con `origen='anadido'` por `apps/atlas/scripts/migrar/fichajes.ts`. Este código no se mantiene; borrar la carpeta es decisión del propietario.

# HAT3X Fichaje

Herramienta de fichaje (time tracking) para HAT3X. Lee los logs de Claude Code, reparte las horas
trabajadas por cliente (con solape cuando hay sesiones paralelas) y las muestra en un dashboard
HTML embebido dentro de una app de escritorio (pywebview), con fichaje manual de entrada/salida.

## Que es

- **Motor** (`fichaje/`): solo librería estándar de Python. Parsea los `.jsonl` de sesiones de
  Claude Code, atribuye cada tramo de actividad a un cliente según las rutas de fichero tocadas
  (`clients/projects/<slug>/...` o `clients/onboarding/clients/<slug>/...`), construye ventanas de
  presencia (fichado manual, estimado por actividad) y genera un informe con reparto por minuto.
- **App** (`fichaje/app.py`): ventana pywebview que embebe el dashboard y expone un puente
  (`Api`) para fichar entrada/salida y refrescar datos desde JavaScript.
- **CLI** (`fichaje/cli.py`): `entrada`, `salida`, `informe [--desde] [--hasta] [--csv]`,
  `dashboard`.

## Correr en dev

Sin instalar nada (el motor es solo stdlib):

```powershell
cd apps/fichaje
python -m fichaje.cli informe
python -m fichaje.cli dashboard
```

Para lanzar la app de escritorio (requiere `pywebview`, ver `requirements-dev.txt`):

```powershell
python -m pip install -r requirements-dev.txt
python -m fichaje.app
```

## Tests

Con `unittest` (no requiere `pytest` ni `pywebview` instalados):

```powershell
cd apps/fichaje
python -m unittest discover -s tests -t . -v
```

## Build del .exe

```powershell
cd apps/fichaje
./build.ps1 -Clean
```

Genera `dist/fichaje.exe` (standalone, no requiere Python instalado en la máquina destino).
Usa PyInstaller con el spec `fichaje.spec` (entrypoint `fichaje/app.py`).

## Configuración: `fichaje.config.json`

Copia `fichaje.config.example.json` a `fichaje.config.json` (en `apps/fichaje/`) y ajusta:

```json
{
  "umbral_inactividad_min": 25,
  "tz": "+02:00",
  "clientes": {
    "100-montaditos": { "nombre": "100 Montaditos", "tarifa_eur_h": 50 },
    "salon-os": { "nombre": "Salon OS", "tarifa_eur_h": 50 }
  }
}
```

- `umbral_inactividad_min`: minutos de inactividad tras los que se corta un tramo de actividad.
- `tz`: zona horaria en formato `+HH:MM` / `-HH:MM`.
- `clientes`: mapa `slug -> { nombre, tarifa_eur_h }`. `tarifa_eur_h` es opcional (sin ella no se
  calcula importe).

Si el fichero no existe, se usan los valores por defecto (umbral 25 min, `+02:00`, sin clientes
con nombre/tarifa personalizados — los slugs se siguen descubriendo desde el filesystem).

## Datos privados (`data/`, `out/`)

`apps/fichaje/data/` (el `fichaje.json` con el histórico de fichajes) y `apps/fichaje/out/` (el
dashboard exportado) son privados y están en `.gitignore`, junto con `build/` y `dist/`. No se
suben al repositorio. El código del motor y de la app sí se commitea.

## Troubleshooting

- **`ModuleNotFoundError: No module named 'fichaje'` al correr tests**: asegúrate de ejecutar
  `python -m unittest ...` desde `apps/fichaje` (el cwd entra en `sys.path`), o usa el
  `conftest.py` incluido.
- **La app no abre / falla `import webview`**: instala las dependencias de desarrollo con
  `pip install -r requirements-dev.txt`. El motor y sus tests NO requieren `pywebview` (el import
  es perezoso, solo ocurre dentro de `fichaje.app.lanzar()`).
- **El dashboard no muestra horas de un cliente nuevo**: comprueba que existe la carpeta
  `clients/projects/<slug>/` o `clients/onboarding/clients/<slug>/` en el repo — los slugs se
  descubren del filesystem, no hace falta declararlos en `fichaje.config.json` salvo que quieras
  darles nombre bonito o tarifa.
