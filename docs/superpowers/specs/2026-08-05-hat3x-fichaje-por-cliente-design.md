# Fichaje por cliente (HAT3X) — Diseño

**Fecha:** 2026-08-05
**Estado:** Diseño aprobado (pendiente de plan de implementación)
**Autor:** Jota + Claude

---

## 1. Propósito y contexto

HAT3X = todo el trabajo que Jota hace con Claude Code (100 Montaditos, Salón OS,
denueveanueve, Kairos/Biodental, EKIS, producto interno…). Todos los proyectos de
cliente viven como subcarpetas del monorepo en `clients/projects/<cliente>/`, así que
Claude Code los registra bajo el **mismo directorio de sesión**.

Objetivo: un **fichaje** que registre las horas trabajadas y las **reparta por cliente**,
para poder facturar y saber cuánto tiempo se dedica a cada uno. El disparador fue
comprobar que las estimaciones "a ojo" no cuadran: un maratón real (cambio de carta de
100M, 31-jul→3-ago, casi sin dormir) fueron ~70h que un método ingenuo de "tiempo activo"
infravaloraba, porque gran parte del trabajo (editar imágenes, probar la app) ocurre
**fuera del chat**.

## 2. Decisiones tomadas (brainstorming)

1. **Modelo de solape: por cliente, con solape permitido.** Cuando se trabaja en 2-3
   clientes a la vez (o una sesión autónoma corre mientras se revisa otra cosa), cada
   cliente acumula su tiempo dedicado aunque se solape. La **jornada real** se deriva como
   la **unión** de todos los intervalos (sin doble conteo). Un solo modelo de datos, dos vistas.
2. **Fuente: automático desde los logs + entradas manuales.** El reparto por cliente se
   deduce de los logs de Claude Code; además se pueden añadir bloques a mano para trabajo
   fuera de Claude (reuniones, diseño en Figma, llamadas).
3. **La jornada la define el usuario con entrada/salida.** Todo lo que quede dentro de una
   ventana entrada→salida **cuenta** (esperar a que Claude termine, revisar, etc.: está al
   PC). El usuario marca `salida` cuando deja de trabajar de verdad (p. ej. lanza algo largo
   y se va). Lo automático de los logs **no decide cuánto** se trabaja — eso lo marca el
   usuario — sino **con qué cliente** en cada momento.
4. **Histórico: estimado desde los logs.** Para lo ya trabajado sin fichar, las ventanas de
   presencia se deducen de los logs con un umbral de inactividad configurable. Se marca como
   `estimado` frente a lo `fichado`.
5. **Entregable: app de escritorio `.exe` con el dashboard embebido.** La herramienta se
   empaqueta como un `.exe` de Windows (PyInstaller) que abre una **ventana con el dashboard
   dentro** (webview, sin abrir navegador aparte) y los controles de entrada/salida. No
   requiere Python instalado. El fichero HTML suelto queda solo como artefacto de
   desarrollo/demo. (Servidor en vivo y publicación al móvil quedan fuera del v1.)

## 3. Arquitectura

Ubicación: `tools/fichaje/`. **Python**. El **motor** (parseo, atribución, ventanas, informe)
es **solo stdlib** — cero dependencias, testeable aislado. La **capa de app** usa **pywebview**
para la ventana con el dashboard embebido. Empaquetado a `.exe` con **PyInstaller** (dependencia
solo de build). El código se commitea; los datos personales (`tools/fichaje/data/`) van a `.gitignore`.

### Módulos (una responsabilidad cada uno, testeable aislado)

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `logs.py` | Recorre `~/.claude/projects/**/*.jsonl` en streaming → emite `Evento`. Tolera líneas gigantes/corruptas. | — |
| `clients.py` | Registro de clientes: autodescubre desde `clients/projects/*`. Mapea ruta→slug→nombre. | config |
| `attribution.py` | Asigna cada evento a cliente(s) por ruta; herencia dentro de sesión; cubo interno. | logs, clients |
| `windows.py` | Construye ventanas de presencia (`fichado`, `estimado`, `manual`); precedencia. | store, logs |
| `store.py` | Lee/escribe `fichaje.json`: fichajes, ventana abierta, manuales. Máquina de estados entrada/salida. | — |
| `report.py` | Cruza ventanas × atribución → totales por cliente/día, unión (jornada real), CSV. | windows, attribution, clients |
| `dashboard.py` | Renderiza el HTML autocontenido (JSON embebido + vanilla JS) que se carga en la ventana. | report |
| `app.py` | Ventana de escritorio (pywebview): carga el dashboard embebido + puente JS↔Python para entrada/salida/refresco en vivo. | dashboard, store, report |
| `cli.py` | Interfaz secundaria: subcomandos sobre el mismo motor (entrada/salida/estado/add/informe/dashboard/clientes). | todos |
| `cache.py` | Caché de parseo por fichero de sesión (clave `mtime+tamaño`). | — |

### Empaquetado (.exe)

- **PyInstaller** en modo *onefile* → un solo `fichaje.exe` (con un `fichaje.spec` versionado para regenerarlo).
- `pywebview` en Windows usa el runtime **Edge WebView2**, presente por defecto en Windows 11.
- El motor stdlib mantiene el `.exe` pequeño; `pywebview` es la única dependencia de runtime.
- Punto de entrada del `.exe` = `app.py` (abre la ventana). El CLI queda disponible por separado.

### Tipo `Evento`

```
Evento {
  ts: datetime (tz +02:00),
  session_id: str,
  es_subagente: bool,          # isSidechain
  hay_prompt_usuario: bool,    # type == 'user' con prompt real cerca
  rutas: list[str],            # file_path/path de los tool_use del evento
}
```

## 4. Atribución (cómo un momento → cliente)

1. **Por ruta:** un evento que toca `clients/projects/<slug>/…` (o
   `clients/onboarding/clients/<slug>/…`) → cliente `<slug>`. Señal fuerte, sin ambigüedad.
2. **Herencia dentro de sesión:** un evento sin ruta hereda el cliente del último evento
   con ruta de *esa* sesión (dentro de la misma ventana).
3. **Solape real:** varias sesiones simultáneas en varios clientes → ese minuto cuenta a
   cada cliente activo (facturable). La jornada real solo suma 1 (unión).
4. **Sin cliente** (raíz, `apps/command`, infra) → cubo **"HAT3X interno"**. Cuenta a la
   jornada, atribuido a interno.
5. **Revisión dentro de la jornada sin actividad en Claude** → arrastre: se pega al último
   cliente activo hasta que aparece el siguiente. Si no hubo ninguno → interno.

## 5. Ventanas de presencia

Tres orígenes, con etiqueta:

| Origen | Creación | Precisión |
|---|---|---|
| `fichado` | `entrada` … `salida` manual | Exacto — manda |
| `estimado` | Autogenerado desde logs para fechas sin fichar | Aproximado |
| `manual` | Bloque añadido a mano (trabajo fuera de Claude) | Exacto |

- **`estimado`:** se agrupan los eventos (unión de todos los clientes) y se corta ventana
  cuando el hueco de inactividad supera `umbral_inactividad_min` (por defecto **25 min**).
- **Precedencia:** donde hay `fichado`, manda; `estimado` solo rellena huecos/fechas sin
  fichar. `fichado` recorta a `estimado`; nunca se solapan sobre el mismo instante.

### `fichaje.json` (almacén)

```json
{
  "fichajes": [
    {"entrada":"2026-08-05T16:00:00+02:00","salida":"2026-08-05T19:30:00+02:00","cliente_principal":"100-montaditos"}
  ],
  "abierto": {"entrada":"2026-08-05T21:00:00+02:00","cliente_principal":null},
  "manuales": [
    {"cliente":"100-montaditos","de":"2026-08-04T11:00:00+02:00","a":"2026-08-04T12:30:00+02:00","nota":"reunión carta"}
  ]
}
```

- `entrada` abre `abierto`; `salida` lo cierra y mueve a `fichajes`.
- Guardas: `salida` sin `entrada` → aviso; `entrada` con una abierta → aviso + opción de
  cerrar la anterior a esa hora.
- `cliente_principal` opcional: pista para tramos sin actividad en Claude. Si hay actividad,
  mandan las rutas.

## 6. Interfaces (app + CLI)

La interfaz **principal** es la **app de escritorio** (`.exe`, Sección 7): ventana con el
dashboard embebido y controles de entrada/salida. La **CLI** es una interfaz **secundaria**
sobre el mismo motor, para fichar rápido desde terminal o scriptar informes/export.

Atajo CLI `fichaje` (`.cmd`/`.ps1` mínimo que llama a `python tools/fichaje/cli.py`, o el propio `fichaje.exe`).

| Comando | Qué hace |
|---|---|
| `fichaje entrada [--cliente 100m]` | Abre jornada ahora. |
| `fichaje salida` | Cierra la jornada abierta. |
| `fichaje estado` | Jornada abierta + totales de hoy en vivo. |
| `fichaje add --cliente 100m --de 16:00 --a 17:30 [--fecha ayer] [--nota "…"]` | Bloque manual. |
| `fichaje informe [--desde 2026-06-30] [--hasta hoy] [--cliente 100m] [--csv ruta.csv]` | Tabla + export CSV. |
| `fichaje dashboard [--desde --hasta]` | Genera el HTML a fichero (demo/preview en navegador; la vista real va embebida en la app). |
| `fichaje clientes` | Lista clientes detectados + nombre/tarifa. |

### Informe (terminal)

```
FICHAJE  30 jun → 5 ago
Cliente          Facturable   %     Origen             Importe*
100-montaditos      70h 10m   28%   estim.68h fich.2h   3.508€
salon-os            41h 05m   16%   estimado           2.052€
...
JORNADA REAL (unión, sin doble conteo): 165h 30m
(facturable sumado con solape: 251h)
* Importe solo si hay tarifa €/h por cliente.
```

### CSV

Una fila por bloque atribuido: `fecha, cliente, inicio, fin, minutos, origen, nota, importe`.
Fichero resumen por cliente aparte. Fechas ISO; `origen ∈ {fichado, estimado, manual}`.

### Config `fichaje.config.json`

```json
{
  "umbral_inactividad_min": 25,
  "tz": "+02:00",
  "clientes": {
    "100-montaditos": {"nombre": "100 Montaditos", "tarifa_eur_h": 50},
    "salon-os":       {"nombre": "Salón OS",       "tarifa_eur_h": 50}
  }
}
```

`tarifa_eur_h` opcional → activa la columna importe.

## 7. App de escritorio + dashboard embebido

Al abrir `fichaje.exe`, `app.py` crea una ventana **pywebview** que carga el HTML del
dashboard **dentro** (sin navegador aparte). El mismo renderer (`dashboard.py`) puede además
escribir el HTML a fichero para previsualizar en el navegador durante el desarrollo.

- **Barra de controles** (arriba): selector de cliente + **Entrada / Salida / Estado** +
  **Añadir manual**. Los botones llaman a Python por el puente `window.pywebview.api.*`
  (→ `store.py`/`report.py`) y **refrescan el dashboard en vivo**.
- **Dashboard** (cuerpo), HTML autocontenido, vanilla JS, tema claro/oscuro, estilo HAT3X:
  1. **Cabecera:** rango + cifras grandes (jornada real / facturable con solape / nº días / importe).
  2. **Por cliente:** barras o donut con horas, %, importe, color por cliente; badge `estimado`/`fichado`.
  3. **Timeline por día:** carriles apilados; los solapes se ven en paralelo. Hover → tooltip
     (cliente, hora, origen, nota).
  4. **Filtros** por cliente y origen; botón **export CSV**.
- Todo local y privado. El renderer se construye para *poder* publicarse como Artifact más adelante.

## 8. Rendimiento

Hay un log de sesión de ~484 MB. **Caché** por fichero (`tools/fichaje/data/cache/`) con clave
`mtime+tamaño`: la primera pasada parsea todo (~1-2 min), las siguientes solo releen ficheros
nuevos/cambiados → informes casi instantáneos. Lectura siempre en streaming.

## 9. Testing (`unittest` stdlib, eventos sintéticos — sin logs reales ni PII)

- `clients`: ruta→cliente (incl. onboarding, sin cliente→interno).
- `attribution`: solape, herencia dentro de sesión, cubo interno, arrastre de revisión.
- `windows`: `estimado` desde timestamps sintéticos + umbral; precedencia `fichado` recorta `estimado`.
- `report`: unión (jornada real) ≠ suma con solape; totales; importe con tarifa.
- `store`: máquina de estados entrada/salida (salida sin entrada, entrada con abierta), round-trip JSON.
- `report`: forma del CSV.
- `dashboard`: smoke test — genera HTML válido con JSON embebido parseable.
- `app`: smoke test del puente — los métodos de la API (entrada/salida/estado/informe) son
  invocables y devuelven datos correctos; la ventana pywebview en sí no se testea unitariamente.

El motor (todo salvo `app.py`) se testea sin `pywebview` instalado, para que la suite corra en CI.

## 10. Errores

- Líneas corruptas/gigantes → se saltan sin romper.
- Carpeta de clientes ausente → registro vacío, todo a interno.
- TZ siempre `+02:00` (configurable).

## 11. Fuera de alcance (v1) — YAGNI

- Hooks de Claude Code para fichar semi-automático (más ruido que valor: la jornada ≠ Claude abierto).
- Servidor local en vivo (`localhost`).
- Publicación / acceso desde el móvil (Artifact privado, Vercel).
- Integración con facturación externa.

Todos son extensiones posibles sobre el mismo motor sin rehacer nada.
