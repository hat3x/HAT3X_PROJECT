# Fichaje por cliente (HAT3X) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un `fichaje.exe` de Windows que lee los logs de Claude Code, reparte las horas trabajadas por cliente (con solape) y las muestra en un dashboard embebido, con fichaje manual entrada/salida.

**Architecture:** Motor Python **solo stdlib** (parseo de logs → atribución por ruta → ventanas de presencia → informe con reparto por minuto). Encima, una app pywebview que embebe el dashboard HTML y un puente JS↔Python para los controles. Empaquetado a `.exe` con PyInstaller.

**Tech Stack:** Python 3.11+ (stdlib: `json`, `dataclasses`, `datetime`, `pathlib`, `argparse`, `csv`, `unittest`), `pywebview` (solo capa app), `pyinstaller` (solo build).

## Global Constraints

- **Motor sin dependencias:** todo salvo `app.py` usa solo stdlib. La suite de tests corre sin `pywebview` instalado.
- **Python 3.11+** (para `datetime.fromisoformat` con offset y `tuple[str, ...]`).
- **Timezone:** todo se normaliza a `+02:00` (configurable vía `fichaje.config.json`).
- **Umbral de inactividad por defecto:** `25` min (configurable).
- **Sin PII en tests:** los tests usan eventos sintéticos, nunca logs reales.
- **Ubicación:** `apps/fichaje/`. Paquete Python en `apps/fichaje/fichaje/`, tests en `apps/fichaje/tests/`.
- **Datos personales** (`apps/fichaje/data/`, `apps/fichaje/out/`, `build/`, `dist/`) van a `.gitignore`; el código se commitea.
- **Slugs de cliente** salen de las carpetas `clients/projects/*` y `clients/onboarding/clients/*`. Sin cliente → slug interno `"interno"`.
- **Orígenes de ventana:** exactamente `"fichado" | "estimado" | "manual"`.

---

### Task 1: Scaffold del proyecto + modelos + config

**Files:**
- Create: `apps/fichaje/fichaje/__init__.py`
- Create: `apps/fichaje/fichaje/models.py`
- Create: `apps/fichaje/fichaje/config.py`
- Create: `apps/fichaje/fichaje/timeutil.py`
- Create: `apps/fichaje/fichaje.config.example.json`
- Create: `apps/fichaje/.gitignore`
- Create: `apps/fichaje/conftest.py`
- Create: `apps/fichaje/tests/__init__.py`
- Test: `apps/fichaje/tests/test_config.py`

**Interfaces:**
- Produces:
  - `models.Evento(ts: datetime, session_id: str, rutas: tuple[str,...]=(), es_subagente: bool=False, hay_prompt_usuario: bool=False)` (frozen dataclass)
  - `models.Ventana(inicio: datetime, fin: datetime, origen: str, cliente_principal: str|None=None)` (frozen)
  - `models.ActividadCliente(cliente: str, inicio: datetime, fin: datetime, session_id: str)` (frozen)
  - `models.Bloque(cliente: str, inicio: datetime, fin: datetime, origen: str, nota: str|None=None)` (frozen)
  - `models.TotalCliente(cliente: str, minutos: int, minutos_por_origen: dict[str,int], importe: float|None=None)`
  - `config.Config(umbral_inactividad_min: int, tz: timezone, clientes: dict[str, dict])` + `config.cargar(path: Path|None) -> Config`
  - `timeutil.TZ_DEFECTO: timezone`, `timeutil.parse_offset(s) -> timezone`, `timeutil.a_local(dt, tz)`, `timeutil.epoch_min(dt) -> int`, `timeutil.desde_epoch_min(m, tz) -> datetime`

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_config.py
import json, tempfile, unittest
from pathlib import Path
from fichaje import config

class TestConfig(unittest.TestCase):
    def test_defaults_cuando_no_hay_fichero(self):
        c = config.cargar(None)
        self.assertEqual(c.umbral_inactividad_min, 25)
        self.assertEqual(c.tz.utcoffset(None).total_seconds(), 2 * 3600)
        self.assertEqual(c.clientes, {})

    def test_lee_umbral_y_clientes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cfg.json"
            p.write_text(json.dumps({
                "umbral_inactividad_min": 30,
                "tz": "+02:00",
                "clientes": {"100-montaditos": {"nombre": "100 Montaditos", "tarifa_eur_h": 50}},
            }), encoding="utf-8")
            c = config.cargar(p)
            self.assertEqual(c.umbral_inactividad_min, 30)
            self.assertEqual(c.clientes["100-montaditos"]["tarifa_eur_h"], 50)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_config.py -v` (o `python -m unittest tests.test_config -v`)
Expected: FAIL con `ModuleNotFoundError: No module named 'fichaje'`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/__init__.py
# (vacío: marca el paquete)
```

```python
# apps/fichaje/fichaje/timeutil.py
from datetime import datetime, timezone, timedelta

TZ_DEFECTO = timezone(timedelta(hours=2))

def parse_offset(s: str) -> timezone:
    signo = 1 if s[0] == "+" else -1
    hh, mm = int(s[1:3]), int(s[4:6])
    return timezone(signo * timedelta(hours=hh, minutes=mm))

def a_local(dt: datetime, tz: timezone) -> datetime:
    return dt.astimezone(tz)

def epoch_min(dt: datetime) -> int:
    return int(dt.timestamp() // 60)

def desde_epoch_min(m: int, tz: timezone) -> datetime:
    return datetime.fromtimestamp(m * 60, tz)
```

```python
# apps/fichaje/fichaje/config.py
import json
from dataclasses import dataclass
from datetime import timezone
from pathlib import Path
from . import timeutil

@dataclass
class Config:
    umbral_inactividad_min: int
    tz: timezone
    clientes: dict

def cargar(path):
    if path is None or not Path(path).exists():
        return Config(25, timeutil.TZ_DEFECTO, {})
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    tz = timeutil.parse_offset(d.get("tz", "+02:00"))
    return Config(int(d.get("umbral_inactividad_min", 25)), tz, d.get("clientes", {}))
```

```python
# apps/fichaje/fichaje/models.py
from dataclasses import dataclass, field
from datetime import datetime

@dataclass(frozen=True)
class Evento:
    ts: datetime
    session_id: str
    rutas: tuple = ()
    es_subagente: bool = False
    hay_prompt_usuario: bool = False

@dataclass(frozen=True)
class Ventana:
    inicio: datetime
    fin: datetime
    origen: str            # "fichado" | "estimado" | "manual"
    cliente_principal: str = None

@dataclass(frozen=True)
class ActividadCliente:
    cliente: str
    inicio: datetime
    fin: datetime
    session_id: str

@dataclass(frozen=True)
class Bloque:
    cliente: str
    inicio: datetime
    fin: datetime
    origen: str
    nota: str = None

@dataclass
class TotalCliente:
    cliente: str
    minutos: int
    minutos_por_origen: dict = field(default_factory=dict)
    importe: float = None
```

Crear también:
- `apps/fichaje/tests/__init__.py` (vacío)
- `apps/fichaje/fichaje.config.example.json` (el ejemplo del spec: umbral 25, tz +02:00, clientes con nombre/tarifa)
- `apps/fichaje/.gitignore`:

```gitignore
data/
out/
build/
dist/
__pycache__/
```

- `apps/fichaje/conftest.py` (para que `import fichaje` resuelva desde la raíz del proyecto):

```python
# apps/fichaje/conftest.py
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_config.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje apps/fichaje/tests apps/fichaje/conftest.py apps/fichaje/.gitignore apps/fichaje/fichaje.config.example.json
git commit -m "feat(fichaje): scaffold + modelos + config"
```

---

### Task 2: Registro de clientes (ruta → slug)

**Files:**
- Create: `apps/fichaje/fichaje/clients.py`
- Test: `apps/fichaje/tests/test_clients.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `clients.ClientRegistry(slugs: list[str], nombres: dict[str,str]={})` con `.cliente_de_ruta(ruta: str) -> str|None`, `.nombre(slug: str) -> str`
  - `clients.descubrir(repo_root: Path, nombres: dict|None=None) -> ClientRegistry`
  - Constante `clients.INTERNO = "interno"`

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_clients.py
import unittest
from fichaje import clients

class TestClients(unittest.TestCase):
    def setUp(self):
        self.reg = clients.ClientRegistry(
            slugs=["100-montaditos", "salon-os"],
            nombres={"100-montaditos": "100 Montaditos"},
        )

    def test_ruta_projects(self):
        r = r"c:\x\HAT3X\clients\projects\100-montaditos\app\src\a.ts"
        self.assertEqual(self.reg.cliente_de_ruta(r), "100-montaditos")

    def test_ruta_onboarding(self):
        r = "c:/x/HAT3X/clients/onboarding/clients/salon-os/2026-08/01.md"
        self.assertEqual(self.reg.cliente_de_ruta(r), "salon-os")

    def test_ruta_sin_cliente(self):
        self.assertIsNone(self.reg.cliente_de_ruta("c:/x/HAT3X/apps/command/src/server.ts"))

    def test_nombre_fallback_al_slug(self):
        self.assertEqual(self.reg.nombre("salon-os"), "salon-os")
        self.assertEqual(self.reg.nombre("100-montaditos"), "100 Montaditos")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_clients.py -v`
Expected: FAIL con `ModuleNotFoundError` / `AttributeError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/clients.py
import re
from dataclasses import dataclass, field
from pathlib import Path

INTERNO = "interno"
# captura el slug tras clients/projects/  o  clients/onboarding/clients/
_PATRON = re.compile(r"clients[\\/](?:onboarding[\\/]clients|projects)[\\/]([^\\/]+)", re.IGNORECASE)

@dataclass
class ClientRegistry:
    slugs: list
    nombres: dict = field(default_factory=dict)

    def cliente_de_ruta(self, ruta: str):
        m = _PATRON.search(ruta or "")
        return m.group(1) if m else None

    def nombre(self, slug: str) -> str:
        return self.nombres.get(slug, slug)

def descubrir(repo_root, nombres=None):
    repo_root = Path(repo_root)
    slugs = set()
    for base in [repo_root / "clients" / "projects",
                 repo_root / "clients" / "onboarding" / "clients"]:
        if base.is_dir():
            slugs.update(p.name for p in base.iterdir() if p.is_dir())
    return ClientRegistry(sorted(slugs), dict(nombres or {}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_clients.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/clients.py apps/fichaje/tests/test_clients.py
git commit -m "feat(fichaje): registro de clientes por ruta"
```

---

### Task 3: Parser de logs (jsonl → Evento) + caché

**Files:**
- Create: `apps/fichaje/fichaje/logs.py`
- Create: `apps/fichaje/fichaje/cache.py`
- Test: `apps/fichaje/tests/test_logs.py`

**Interfaces:**
- Consumes: `models.Evento`, `timeutil`.
- Produces:
  - `logs.parse_linea(linea: bytes, tz) -> Evento|None`
  - `logs.eventos_de_fichero(path: Path, tz) -> list[Evento]`
  - `logs.eventos_de_proyectos(projects_dir: Path, tz, cache=None) -> list[Evento]` (ordenados por ts)
  - `cache.Cache(dir: Path)` con `.get(path) -> list[Evento]|None`, `.put(path, eventos)`, clave `stem+size+mtime`

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_logs.py
import json, unittest
from fichaje import logs, timeutil

TZ = timeutil.TZ_DEFECTO

class TestLogs(unittest.TestCase):
    def test_parse_linea_con_ruta(self):
        linea = json.dumps({
            "type": "assistant",
            "timestamp": "2026-08-03T12:00:00.000Z",
            "sessionId": "s1",
            "isSidechain": False,
            "message": {"content": [
                {"type": "tool_use", "name": "Read", "input": {"file_path": "c:/x/clients/projects/100-montaditos/a.ts"}}
            ]},
        }).encode()
        ev = logs.parse_linea(linea, TZ)
        self.assertEqual(ev.session_id, "s1")
        self.assertEqual(ev.ts.hour, 14)  # 12:00Z -> 14:00 +02
        self.assertIn("100-montaditos", ev.rutas[0])

    def test_parse_linea_prompt_usuario(self):
        linea = json.dumps({
            "type": "user", "timestamp": "2026-08-03T10:00:00.000Z", "sessionId": "s1",
            "message": {"content": "hola"},
        }).encode()
        ev = logs.parse_linea(linea, TZ)
        self.assertTrue(ev.hay_prompt_usuario)
        self.assertEqual(ev.rutas, ())

    def test_linea_corrupta_devuelve_none(self):
        self.assertIsNone(logs.parse_linea(b"{no es json", TZ))

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_logs.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/logs.py
import json
from datetime import datetime, timezone
from pathlib import Path
from .models import Evento

def _rutas(content):
    out = []
    if isinstance(content, list):
        for b in content:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                inp = b.get("input", {}) or {}
                for f in ("file_path", "path", "notebook_path"):
                    if f in inp and isinstance(inp[f], str):
                        out.append(inp[f])
    return tuple(out)

def parse_linea(linea, tz):
    try:
        o = json.loads(linea)
    except Exception:
        return None
    ts = o.get("timestamp")
    sid = o.get("sessionId")
    if not ts or not sid:
        return None
    try:
        dt = datetime.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).astimezone(tz)
    except Exception:
        return None
    msg = o.get("message") or {}
    content = msg.get("content") if isinstance(msg, dict) else None
    return Evento(
        ts=dt,
        session_id=sid,
        rutas=_rutas(content),
        es_subagente=bool(o.get("isSidechain")),
        hay_prompt_usuario=(o.get("type") == "user"),
    )

def eventos_de_fichero(path, tz):
    out = []
    with open(path, "rb") as f:
        for linea in f:
            ev = parse_linea(linea, tz)
            if ev:
                out.append(ev)
    return out

def eventos_de_proyectos(projects_dir, tz, cache=None):
    out = []
    d = Path(projects_dir)
    ficheros = list(d.glob("*.jsonl")) + list(d.glob("*/*.jsonl"))
    for p in ficheros:
        evs = cache.get(p) if cache else None
        if evs is None:
            evs = eventos_de_fichero(p, tz)
            if cache:
                cache.put(p, evs)
        out.extend(evs)
    out.sort(key=lambda e: e.ts)
    return out
```

```python
# apps/fichaje/fichaje/cache.py
import pickle
from pathlib import Path

class Cache:
    def __init__(self, dir):
        self.dir = Path(dir); self.dir.mkdir(parents=True, exist_ok=True)

    def _clave(self, path):
        st = Path(path).stat()
        return f"{Path(path).stem}_{st.st_size}_{int(st.st_mtime)}.pkl"

    def get(self, path):
        f = self.dir / self._clave(path)
        if f.exists():
            try:
                return pickle.loads(f.read_bytes())
            except Exception:
                return None
        return None

    def put(self, path, eventos):
        (self.dir / self._clave(path)).write_bytes(pickle.dumps(eventos))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_logs.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/logs.py apps/fichaje/fichaje/cache.py apps/fichaje/tests/test_logs.py
git commit -m "feat(fichaje): parser de logs jsonl + cache"
```

---

### Task 4: Atribución (eventos → intervalos de actividad por cliente)

**Files:**
- Create: `apps/fichaje/fichaje/attribution.py`
- Create: `apps/fichaje/tests/fixtures.py`
- Test: `apps/fichaje/tests/test_attribution.py`

**Interfaces:**
- Consumes: `models.Evento`, `models.ActividadCliente`, `clients.ClientRegistry`, `clients.INTERNO`.
- Produces:
  - `attribution.intervalos_actividad(eventos: list[Evento], reg: ClientRegistry, umbral_min: int) -> list[ActividadCliente]`
  - Helper de tests `fixtures.ev(hhmm: str, cliente: str|None, session="s1") -> Evento` (el 2026-08-03).

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/fixtures.py
from datetime import datetime
from fichaje import timeutil
from fichaje.models import Evento

TZ = timeutil.TZ_DEFECTO

def ev(hhmm, cliente=None, session="s1"):
    h, m = map(int, hhmm.split(":"))
    ts = datetime(2026, 8, 3, h, m, tzinfo=TZ)
    rutas = (f"c:/x/clients/projects/{cliente}/a.ts",) if cliente else ()
    return Evento(ts=ts, session_id=session, rutas=rutas)
```

```python
# apps/fichaje/tests/test_attribution.py
import unittest
from fichaje import attribution, clients
from tests.fixtures import ev

REG = clients.ClientRegistry(slugs=["100-montaditos", "salon-os"])

class TestAttribution(unittest.TestCase):
    def test_un_run_mismo_cliente(self):
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos"), ev("10:05", None), ev("10:10", "100-montaditos")],
            REG, umbral_min=25)
        self.assertEqual(len(acts), 1)
        self.assertEqual(acts[0].cliente, "100-montaditos")
        self.assertEqual(acts[0].inicio.hour, 10)

    def test_hueco_mayor_que_umbral_parte_intervalo(self):
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos"), ev("11:00", "100-montaditos")], REG, 25)
        self.assertEqual(len(acts), 2)

    def test_evento_sin_ruta_al_principio_es_interno(self):
        acts = attribution.intervalos_actividad([ev("10:00", None)], REG, 25)
        self.assertEqual(acts[0].cliente, clients.INTERNO)

    def test_sesiones_paralelas_generan_solape(self):
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos", "s1"), ev("10:01", "salon-os", "s2"),
             ev("10:10", "100-montaditos", "s1"), ev("10:11", "salon-os", "s2")], REG, 25)
        clientes = sorted({a.cliente for a in acts})
        self.assertEqual(clientes, ["100-montaditos", "salon-os"])

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_attribution.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/attribution.py
from collections import defaultdict
from datetime import timedelta
from .models import ActividadCliente
from .clients import INTERNO

def _cliente_evento(ev, reg, ultimo):
    for r in ev.rutas:
        c = reg.cliente_de_ruta(r)
        if c:
            return c
    return ultimo  # herencia dentro de sesión

def intervalos_actividad(eventos, reg, umbral_min):
    umbral = timedelta(minutes=umbral_min)
    por_sesion = defaultdict(list)
    for ev in eventos:
        por_sesion[ev.session_id].append(ev)
    out = []
    for sid, evs in por_sesion.items():
        evs = sorted(evs, key=lambda e: e.ts)
        ultimo = None
        run_cliente = run_ini = run_fin = None
        for ev in evs:
            c = _cliente_evento(ev, reg, ultimo) or INTERNO
            ultimo = c
            if run_cliente is None:
                run_cliente, run_ini, run_fin = c, ev.ts, ev.ts
            elif c == run_cliente and (ev.ts - run_fin) <= umbral:
                run_fin = ev.ts
            else:
                out.append(ActividadCliente(run_cliente, run_ini, run_fin, sid))
                run_cliente, run_ini, run_fin = c, ev.ts, ev.ts
        if run_cliente is not None:
            out.append(ActividadCliente(run_cliente, run_ini, run_fin, sid))
    out.sort(key=lambda a: a.inicio)
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_attribution.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/attribution.py apps/fichaje/tests/test_attribution.py apps/fichaje/tests/fixtures.py
git commit -m "feat(fichaje): atribucion a intervalos de actividad por cliente"
```

---

### Task 5: Almacén `fichaje.json` (máquina de estados entrada/salida)

**Files:**
- Create: `apps/fichaje/fichaje/store.py`
- Test: `apps/fichaje/tests/test_store.py`

**Interfaces:**
- Consumes: `models.Ventana`.
- Produces:
  - `store.Store(path: Path)` con `.entrada(ts, cliente=None)`, `.salida(ts)`, `.add_manual(cliente, de, a, nota=None)`, `.ventanas_fichado() -> list[Ventana]`, `.ventanas_manual() -> list[Ventana]`, propiedad `.abierto`
  - `store.FichajeError(Exception)`

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_store.py
import unittest, tempfile
from datetime import datetime
from pathlib import Path
from fichaje import store, timeutil

TZ = timeutil.TZ_DEFECTO
def t(h, m=0): return datetime(2026, 8, 5, h, m, tzinfo=TZ)

class TestStore(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.s = store.Store(Path(self.d.name) / "fichaje.json")

    def tearDown(self):
        self.d.cleanup()

    def test_entrada_salida_crea_ventana(self):
        self.s.entrada(t(16), "100-montaditos")
        self.s.salida(t(19, 30))
        vs = self.s.ventanas_fichado()
        self.assertEqual(len(vs), 1)
        self.assertEqual(vs[0].origen, "fichado")
        self.assertEqual(vs[0].cliente_principal, "100-montaditos")

    def test_entrada_con_una_abierta_falla(self):
        self.s.entrada(t(16))
        with self.assertRaises(store.FichajeError):
            self.s.entrada(t(17))

    def test_salida_sin_entrada_falla(self):
        with self.assertRaises(store.FichajeError):
            self.s.salida(t(19))

    def test_persistencia_en_disco(self):
        self.s.entrada(t(16)); self.s.salida(t(17))
        s2 = store.Store(self.s.path)
        self.assertEqual(len(s2.ventanas_fichado()), 1)

    def test_add_manual(self):
        self.s.add_manual("salon-os", t(11), t(12, 30), "reunion")
        vs = self.s.ventanas_manual()
        self.assertEqual(vs[0].origen, "manual")
        self.assertEqual(vs[0].cliente_principal, "salon-os")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_store.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/store.py
import json
from datetime import datetime
from pathlib import Path
from .models import Ventana

class FichajeError(Exception):
    pass

class Store:
    def __init__(self, path):
        self.path = Path(path)
        self._d = {"fichajes": [], "abierto": None, "manuales": []}
        if self.path.exists():
            self._d = json.loads(self.path.read_text(encoding="utf-8"))

    def _guardar(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._d, ensure_ascii=False, indent=2), encoding="utf-8")

    @property
    def abierto(self):
        return self._d.get("abierto")

    def entrada(self, ts, cliente=None):
        if self._d.get("abierto"):
            raise FichajeError("Ya hay una jornada abierta")
        self._d["abierto"] = {"entrada": ts.isoformat(), "cliente_principal": cliente}
        self._guardar()

    def salida(self, ts):
        ab = self._d.get("abierto")
        if not ab:
            raise FichajeError("No hay jornada abierta")
        self._d["fichajes"].append({"entrada": ab["entrada"], "salida": ts.isoformat(),
                                    "cliente_principal": ab.get("cliente_principal")})
        self._d["abierto"] = None
        self._guardar()

    def add_manual(self, cliente, de, a, nota=None):
        self._d["manuales"].append({"cliente": cliente, "de": de.isoformat(),
                                    "a": a.isoformat(), "nota": nota})
        self._guardar()

    def ventanas_fichado(self):
        return [Ventana(datetime.fromisoformat(f["entrada"]), datetime.fromisoformat(f["salida"]),
                        "fichado", f.get("cliente_principal")) for f in self._d["fichajes"]]

    def ventanas_manual(self):
        return [Ventana(datetime.fromisoformat(m["de"]), datetime.fromisoformat(m["a"]),
                        "manual", m.get("cliente")) for m in self._d["manuales"]]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_store.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/store.py apps/fichaje/tests/test_store.py
git commit -m "feat(fichaje): almacen fichaje.json + maquina entrada/salida"
```

---

### Task 6: Ventanas de presencia (estimado + combinación con precedencia)

**Files:**
- Create: `apps/fichaje/fichaje/windows.py`
- Test: `apps/fichaje/tests/test_windows.py`

**Interfaces:**
- Consumes: `models.Evento`, `models.Ventana`.
- Produces:
  - `windows.ventanas_estimado(eventos: list[Evento], cubierto: list[Ventana], umbral_min: int) -> list[Ventana]`
  - `windows.combinar(fichado, manual, estimado) -> list[Ventana]` (ordenadas por inicio)

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_windows.py
import unittest
from datetime import datetime
from fichaje import windows, timeutil
from fichaje.models import Ventana
from tests.fixtures import ev

TZ = timeutil.TZ_DEFECTO
def t(h, m=0): return datetime(2026, 8, 3, h, m, tzinfo=TZ)

class TestWindows(unittest.TestCase):
    def test_estimado_agrupa_por_umbral(self):
        evs = [ev("10:00", "100-montaditos"), ev("10:10", "100-montaditos"),
               ev("12:00", "salon-os")]  # hueco de 1h50 -> 2 ventanas
        vs = windows.ventanas_estimado(evs, cubierto=[], umbral_min=25)
        self.assertEqual(len(vs), 2)
        self.assertTrue(all(v.origen == "estimado" for v in vs))

    def test_fichado_recorta_estimado(self):
        evs = [ev("10:00", "100-montaditos"), ev("10:30", "100-montaditos")]
        cub = [Ventana(t(10, 10), t(10, 20), "fichado")]
        vs = windows.ventanas_estimado(evs, cubierto=cub, umbral_min=25)
        for v in vs:  # ningún estimado solapa 10:10-10:20
            self.assertFalse(v.inicio < t(10, 20) and v.fin > t(10, 10))

    def test_combinar_ordena(self):
        f = [Ventana(t(16), t(17), "fichado")]
        e = [Ventana(t(10), t(11), "estimado")]
        out = windows.combinar(f, [], e)
        self.assertEqual([v.origen for v in out], ["estimado", "fichado"])

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_windows.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/windows.py
from datetime import timedelta
from .models import Ventana

def _clusters(eventos, umbral_min):
    if not eventos:
        return []
    evs = sorted(eventos, key=lambda e: e.ts)
    umbral = timedelta(minutes=umbral_min)
    out = []
    ini = fin = evs[0].ts
    for e in evs[1:]:
        if e.ts - fin <= umbral:
            fin = e.ts
        else:
            out.append((ini, fin)); ini = fin = e.ts
    out.append((ini, fin))
    return out

def _restar(ini, fin, cubierto):
    trozos = [(ini, fin)]
    for c in cubierto:
        nuevos = []
        for a, b in trozos:
            if c.fin <= a or c.inicio >= b:
                nuevos.append((a, b)); continue
            if a < c.inicio:
                nuevos.append((a, c.inicio))
            if c.fin < b:
                nuevos.append((c.fin, b))
        trozos = nuevos
    return trozos

def ventanas_estimado(eventos, cubierto, umbral_min):
    out = []
    for ini, fin in _clusters(eventos, umbral_min):
        for a, b in _restar(ini, fin, cubierto):
            if b > a:
                out.append(Ventana(a, b, "estimado"))
    return out

def combinar(fichado, manual, estimado):
    return sorted([*fichado, *manual, *estimado], key=lambda v: v.inicio)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_windows.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/windows.py apps/fichaje/tests/test_windows.py
git commit -m "feat(fichaje): ventanas estimado + combinacion con precedencia"
```

---

### Task 7: Informe (reparto por minuto + jornada unión + CSV + bloques)

**Files:**
- Create: `apps/fichaje/fichaje/report.py`
- Test: `apps/fichaje/tests/test_report.py`

**Interfaces:**
- Consumes: `models.Ventana`, `models.ActividadCliente`, `models.TotalCliente`, `models.Bloque`, `clients.INTERNO`, `timeutil.epoch_min/desde_epoch_min`.
- Produces:
  - `report.Reporte(totales: list[TotalCliente], jornada_min: int, facturable_min: int, bloques: list[Bloque], rango: tuple[datetime,datetime])`
  - `report.facturar(ventanas, actividades, reg, tarifas: dict[str,dict], tz) -> Reporte`
  - `report.exportar_csv(rep: Reporte, path: Path) -> None`

**Algoritmo (reparto por minuto):** para cada ventana, cada minuto de `[inicio,fin)` cuenta a la jornada (unión, una vez). Clientes activos en ese minuto = actividades cuyo `[inicio,fin]` cubre el minuto (solape → todos). Si ninguno activo, arrastre: cliente de la actividad previa dentro de la ventana; si no hay previa, la siguiente; si ninguna, `INTERNO`. `facturable_min` = suma de minutos por cliente (con solape).

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_report.py
import unittest, tempfile, csv
from datetime import datetime
from pathlib import Path
from fichaje import report, clients, timeutil
from fichaje.models import Ventana, ActividadCliente

TZ = timeutil.TZ_DEFECTO
REG = clients.ClientRegistry(slugs=["100-montaditos", "salon-os"],
                             nombres={"100-montaditos": "100 Montaditos"})
def t(h, m=0): return datetime(2026, 8, 3, h, m, tzinfo=TZ)

class TestReport(unittest.TestCase):
    def test_jornada_union_sin_doble_conteo(self):
        v = [Ventana(t(10), t(11), "fichado")]  # 60 min
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 30), "s1"),
                ActividadCliente("salon-os", t(10), t(10, 30), "s2")]  # solape 30 min
        rep = report.facturar(v, acts, REG, {}, TZ)
        self.assertEqual(rep.jornada_min, 60)                 # union
        self.assertGreater(rep.facturable_min, 60)            # solape suma > jornada
        por = {tc.cliente: tc.minutos for tc in rep.totales}
        self.assertEqual(por["100-montaditos"], por["salon-os"])  # simetrico

    def test_arrastre_rellena_hueco(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 5), "s1")]  # solo 5 min activos
        rep = report.facturar(v, acts, REG, {}, TZ)
        por = {tc.cliente: tc.minutos for tc in rep.totales}
        self.assertEqual(por["100-montaditos"], 60)  # arrastre cubre toda la ventana

    def test_importe_con_tarifa(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(11), "s1")]
        rep = report.facturar(v, acts, REG, {"100-montaditos": {"tarifa_eur_h": 60}}, TZ)
        tc = [x for x in rep.totales if x.cliente == "100-montaditos"][0]
        self.assertAlmostEqual(tc.importe, 60.0)  # 1h * 60

    def test_csv_export(self):
        v = [Ventana(t(10), t(10, 30), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 30), "s1")]
        rep = report.facturar(v, acts, REG, {}, TZ)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "out.csv"
            report.exportar_csv(rep, p)
            filas = list(csv.DictReader(p.open(encoding="utf-8")))
            self.assertEqual(filas[0]["cliente"], "100-montaditos")
            self.assertIn("minutos", filas[0])

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_report.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/report.py
import csv
from dataclasses import dataclass
from .models import TotalCliente, Bloque
from .clients import INTERNO
from .timeutil import epoch_min, desde_epoch_min

@dataclass
class Reporte:
    totales: list
    jornada_min: int
    facturable_min: int
    bloques: list
    rango: tuple

def _arrastre(m, orden_acts):
    prev = nxt = None
    for a in orden_acts:
        if epoch_min(a.fin) <= m:
            prev = a.cliente
        elif epoch_min(a.inicio) >= m and nxt is None:
            nxt = a.cliente
    return prev or nxt or INTERNO

def _bloques(minuto_cliente, tz):
    if not minuto_cliente:
        return []
    out = []
    ms = sorted(minuto_cliente)
    ini = prev = ms[0]; cli = minuto_cliente[ms[0]]
    for m in ms[1:]:
        if m == prev + 1 and minuto_cliente[m] == cli:
            prev = m
        else:
            out.append(Bloque(cli, desde_epoch_min(ini, tz), desde_epoch_min(prev + 1, tz), "mix"))
            ini = prev = m; cli = minuto_cliente[m]
    out.append(Bloque(cli, desde_epoch_min(ini, tz), desde_epoch_min(prev + 1, tz), "mix"))
    return out

def facturar(ventanas, actividades, reg, tarifas, tz):
    acts_min = {}
    for a in actividades:
        for m in range(epoch_min(a.inicio), epoch_min(a.fin) + 1):
            acts_min.setdefault(m, []).append(a.cliente)
    orden_acts = sorted(actividades, key=lambda a: a.inicio)

    jornada = set()
    bill = {}
    minuto_cliente = {}
    for v in sorted(ventanas, key=lambda v: v.inicio):
        for m in range(epoch_min(v.inicio), epoch_min(v.fin)):  # [inicio, fin)
            jornada.add(m)
            activos = acts_min.get(m)
            if not activos:
                activos = [_arrastre(m, orden_acts)]
            for c in set(activos):
                bill[c] = bill.get(c, 0) + 1
            minuto_cliente[m] = sorted(set(activos))[0]

    tot = []
    for c, mins in sorted(bill.items(), key=lambda kv: -kv[1]):
        tarifa = (tarifas.get(c) or {}).get("tarifa_eur_h")
        imp = round(mins / 60 * tarifa, 2) if tarifa is not None else None
        tot.append(TotalCliente(c, mins, {}, imp))

    rango = (min((v.inicio for v in ventanas), default=None),
             max((v.fin for v in ventanas), default=None))
    return Reporte(tot, len(jornada), sum(bill.values()), _bloques(minuto_cliente, tz), rango)

def exportar_csv(rep, path):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["cliente", "minutos", "horas", "importe"])
        for tc in rep.totales:
            w.writerow([tc.cliente, tc.minutos, round(tc.minutos / 60, 2),
                        "" if tc.importe is None else tc.importe])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_report.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/report.py apps/fichaje/tests/test_report.py
git commit -m "feat(fichaje): informe reparto por minuto + jornada union + csv"
```

---

### Task 8: Dashboard (render HTML autocontenido)

**Files:**
- Create: `apps/fichaje/fichaje/dashboard.py`
- Test: `apps/fichaje/tests/test_dashboard.py`

**Interfaces:**
- Consumes: `report.Reporte`, `clients.ClientRegistry`.
- Produces:
  - `dashboard.datos_json(rep: Reporte, reg: ClientRegistry) -> dict`
  - `dashboard.render_html(rep: Reporte, reg: ClientRegistry) -> str`

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_dashboard.py
import unittest, json, re
from datetime import datetime
from fichaje import dashboard, report, clients, timeutil
from fichaje.models import Ventana, ActividadCliente

TZ = timeutil.TZ_DEFECTO
REG = clients.ClientRegistry(slugs=["100-montaditos"], nombres={"100-montaditos": "100 Montaditos"})
def t(h, m=0): return datetime(2026, 8, 3, h, m, tzinfo=TZ)

class TestDashboard(unittest.TestCase):
    def _rep(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(11), "s1")]
        return report.facturar(v, acts, REG, {}, TZ)

    def test_datos_json_tiene_totales(self):
        d = dashboard.datos_json(self._rep(), REG)
        self.assertEqual(d["jornada_min"], 60)
        self.assertTrue(any(c["cliente"] == "100-montaditos" for c in d["totales"]))

    def test_html_embebe_json_parseable(self):
        html = dashboard.render_html(self._rep(), REG)
        self.assertIn("<!doctype html>", html.lower())
        m = re.search(r'id="datos"[^>]*>(.*?)</script>', html, re.S)
        self.assertIsNotNone(m)
        json.loads(m.group(1))  # no lanza

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_dashboard.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/dashboard.py
import json

def datos_json(rep, reg):
    return {
        "jornada_min": rep.jornada_min,
        "facturable_min": rep.facturable_min,
        "rango": [rep.rango[0].isoformat() if rep.rango[0] else None,
                  rep.rango[1].isoformat() if rep.rango[1] else None],
        "totales": [{"cliente": tc.cliente, "nombre": reg.nombre(tc.cliente),
                     "minutos": tc.minutos, "importe": tc.importe} for tc in rep.totales],
        "bloques": [{"cliente": b.cliente, "nombre": reg.nombre(b.cliente),
                     "inicio": b.inicio.isoformat(), "fin": b.fin.isoformat()} for b in rep.bloques],
    }

def render_html(rep, reg):
    datos = json.dumps(datos_json(rep, reg), ensure_ascii=False)
    return _PLANTILLA.replace("/*DATOS*/", datos)

_PLANTILLA = """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>HAT3X Fichaje</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif}
body{margin:0;padding:1.5rem;background:#0b0c10;color:#e8e8ea}
@media(prefers-color-scheme:light){body{background:#f6f7f9;color:#111}}
.kpi{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
.card{background:#15171f;border-radius:12px;padding:1rem 1.25rem}
@media(prefers-color-scheme:light){.card{background:#fff;box-shadow:0 1px 4px #0002}}
.big{font-size:2rem;font-weight:700}
.bar{height:14px;border-radius:7px;background:#5b8def}
table{width:100%;border-collapse:collapse;margin-top:1rem}
td,th{padding:.4rem .6rem;text-align:left;border-bottom:1px solid #ffffff14}
</style></head><body>
<h1>HAT3X — Fichaje</h1>
<div class="kpi">
  <div class="card"><div class="big" id="jornada"></div><div>jornada real (union)</div></div>
  <div class="card"><div class="big" id="fact"></div><div>facturable (con solape)</div></div>
</div>
<div id="tabla" class="card"></div>
<script id="datos" type="application/json">/*DATOS*/</script>
<script>
const D = JSON.parse(document.getElementById('datos').textContent);
const hm = m => `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`;
document.getElementById('jornada').textContent = hm(D.jornada_min);
document.getElementById('fact').textContent = hm(D.facturable_min);
const max = Math.max(1, ...D.totales.map(t=>t.minutos));
document.getElementById('tabla').innerHTML =
 '<table><tr><th>Cliente</th><th>Tiempo</th><th></th><th>Importe</th></tr>' +
 D.totales.map(t=>`<tr><td>${t.nombre}</td><td>${hm(t.minutos)}</td>
   <td style="width:40%"><div class="bar" style="width:${100*t.minutos/max}%"></div></td>
   <td>${t.importe==null?'—':t.importe.toFixed(2)+'€'}</td></tr>`).join('') + '</table>';
</script>
</body></html>"""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_dashboard.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/dashboard.py apps/fichaje/tests/test_dashboard.py
git commit -m "feat(fichaje): dashboard html autocontenido"
```

---

### Task 9: Pipeline + CLI (orquesta el motor)

**Files:**
- Create: `apps/fichaje/fichaje/pipeline.py`
- Create: `apps/fichaje/fichaje/cli.py`
- Test: `apps/fichaje/tests/test_pipeline.py`

**Interfaces:**
- Consumes: todo el motor (`config`, `logs`, `clients`, `attribution`, `windows`, `report`, `store`).
- Produces:
  - `pipeline.construir_reporte(repo_root: Path, projects_dir: Path, store_path: Path, config_path: Path|None, desde: date|None, hasta: date|None) -> (Reporte, ClientRegistry)`
  - `cli.main(argv: list[str]|None=None) -> int`

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_pipeline.py
import unittest, tempfile, json
from datetime import date
from pathlib import Path
from fichaje import pipeline

class TestPipeline(unittest.TestCase):
    def test_reporte_desde_log_sintetico(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            linea = json.dumps({
                "type":"assistant","timestamp":"2026-08-03T08:00:00.000Z","sessionId":"s1",
                "message":{"content":[{"type":"tool_use","name":"Read",
                    "input":{"file_path":"c:/x/clients/projects/100-montaditos/a.ts"}}]}}) + "\n"
            (proj / "s1.jsonl").write_text(linea, encoding="utf-8")
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=Path(d)/"fichaje.json", config_path=None,
                desde=date(2026,8,3), hasta=date(2026,8,3))
            self.assertGreaterEqual(rep.jornada_min, 1)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_pipeline.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/pipeline.py
from datetime import datetime, time
from . import config as cfgmod, logs, clients, attribution, windows, report
from .store import Store

def construir_reporte(repo_root, projects_dir, store_path, config_path, desde=None, hasta=None):
    cfg = cfgmod.cargar(config_path)
    reg = clients.descubrir(repo_root, {k: v.get("nombre") for k, v in cfg.clientes.items()})
    eventos = logs.eventos_de_proyectos(projects_dir, cfg.tz)
    if desde:
        lo = datetime.combine(desde, time.min, cfg.tz)
        eventos = [e for e in eventos if e.ts >= lo]
    if hasta:
        hi = datetime.combine(hasta, time.max, cfg.tz)
        eventos = [e for e in eventos if e.ts <= hi]
    st = Store(store_path)
    fich, man = st.ventanas_fichado(), st.ventanas_manual()
    est = windows.ventanas_estimado(eventos, cubierto=[*fich, *man],
                                    umbral_min=cfg.umbral_inactividad_min)
    vent = windows.combinar(fich, man, est)
    acts = attribution.intervalos_actividad(eventos, reg, cfg.umbral_inactividad_min)
    return report.facturar(vent, acts, reg, cfg.clientes, cfg.tz), reg
```

```python
# apps/fichaje/fichaje/cli.py
import argparse, sys, webbrowser
from datetime import datetime, date
from pathlib import Path
from . import pipeline, dashboard, report, timeutil
from .store import Store, FichajeError

def _paths(root):
    root = Path(root)
    return dict(repo_root=root,
                projects_dir=Path.home()/".claude"/"projects"/"c--Users-josem-Desktop-HAT3X-CLAUDE-HAT3X",
                store_path=root/"apps"/"fichaje"/"data"/"fichaje.json",
                config_path=root/"apps"/"fichaje"/"fichaje.config.json")

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    ap = argparse.ArgumentParser(prog="fichaje")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("entrada").add_argument("--cliente")
    sub.add_parser("salida")
    inf = sub.add_parser("informe")
    inf.add_argument("--desde"); inf.add_argument("--hasta"); inf.add_argument("--csv")
    sub.add_parser("dashboard")
    a = ap.parse_args(argv)
    P = _paths(Path.cwd())
    tz = timeutil.TZ_DEFECTO
    if a.cmd == "entrada":
        Store(P["store_path"]).entrada(datetime.now(tz), getattr(a, "cliente", None))
        print("Entrada fichada."); return 0
    if a.cmd == "salida":
        try:
            Store(P["store_path"]).salida(datetime.now(tz)); print("Salida fichada.")
        except FichajeError as e:
            print(e); return 1
        return 0
    desde = date.fromisoformat(a.desde) if getattr(a, "desde", None) else None
    hasta = date.fromisoformat(a.hasta) if getattr(a, "hasta", None) else None
    rep, reg = pipeline.construir_reporte(P["repo_root"], P["projects_dir"], P["store_path"],
                                          P["config_path"], desde, hasta)
    if a.cmd == "informe":
        for tc in rep.totales:
            print(f"{reg.nombre(tc.cliente):24} {tc.minutos//60}h{tc.minutos%60:02d}")
        print(f"JORNADA REAL: {rep.jornada_min//60}h{rep.jornada_min%60:02d}")
        if a.csv:
            report.exportar_csv(rep, a.csv); print(f"CSV -> {a.csv}")
    if a.cmd == "dashboard":
        out = P["repo_root"]/"apps"/"fichaje"/"out"/"fichaje.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(dashboard.render_html(rep, reg), encoding="utf-8")
        webbrowser.open(out.as_uri()); print(f"Dashboard -> {out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_pipeline.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/pipeline.py apps/fichaje/fichaje/cli.py apps/fichaje/tests/test_pipeline.py
git commit -m "feat(fichaje): pipeline + CLI (entrada/salida/informe/dashboard)"
```

---

### Task 10: App de escritorio (pywebview + puente)

**Files:**
- Create: `apps/fichaje/fichaje/app.py`
- Create: `apps/fichaje/requirements-dev.txt`
- Test: `apps/fichaje/tests/test_app_api.py`

**Interfaces:**
- Consumes: `pipeline`, `dashboard`, `store`.
- Produces:
  - `app.Api(repo_root, projects_dir, store_path, config_path)` con `.entrada(cliente=None) -> dict`, `.salida() -> dict`, `.estado() -> dict`, `.datos(desde=None, hasta=None) -> dict`
  - `app.lanzar()` (crea la ventana pywebview; **no** se testea unitariamente).

**Nota:** `app.py` importa `webview` de forma perezosa dentro de `lanzar()`, para que `Api` sea testeable sin la dependencia instalada.

- [ ] **Step 1: Write the failing test**

```python
# apps/fichaje/tests/test_app_api.py
import unittest, tempfile
from pathlib import Path
from fichaje import app

class TestApi(unittest.TestCase):
    def test_entrada_y_datos_no_lanzan(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            api = app.Api(repo_root=Path(d), projects_dir=proj,
                          store_path=Path(d)/"fichaje.json", config_path=None)
            r = api.entrada("100-montaditos")
            self.assertTrue(r["ok"])
            self.assertIsNotNone(api.estado()["abierto"])
            self.assertIn("jornada_min", api.datos())

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/fichaje && python -m pytest tests/test_app_api.py -v`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 3: Write minimal implementation**

```python
# apps/fichaje/fichaje/app.py
from datetime import datetime
from pathlib import Path
from . import pipeline, dashboard, timeutil
from .store import Store, FichajeError

class Api:
    def __init__(self, repo_root, projects_dir, store_path, config_path):
        self.repo_root = Path(repo_root); self.projects_dir = Path(projects_dir)
        self.store_path = Path(store_path); self.config_path = config_path
        self.tz = timeutil.TZ_DEFECTO

    def entrada(self, cliente=None):
        try:
            Store(self.store_path).entrada(datetime.now(self.tz), cliente); return {"ok": True}
        except FichajeError as e:
            return {"ok": False, "error": str(e)}

    def salida(self):
        try:
            Store(self.store_path).salida(datetime.now(self.tz)); return {"ok": True}
        except FichajeError as e:
            return {"ok": False, "error": str(e)}

    def estado(self):
        return {"abierto": Store(self.store_path).abierto}

    def datos(self, desde=None, hasta=None):
        rep, reg = pipeline.construir_reporte(self.repo_root, self.projects_dir,
                                              self.store_path, self.config_path, desde, hasta)
        return dashboard.datos_json(rep, reg)

def lanzar():
    import webview  # perezoso: solo al abrir la ventana
    root = Path(__file__).resolve().parents[2]  # .../HAT3X
    api = Api(root,
              Path.home()/".claude"/"projects"/"c--Users-josem-Desktop-HAT3X-CLAUDE-HAT3X",
              root/"apps"/"fichaje"/"data"/"fichaje.json",
              root/"apps"/"fichaje"/"fichaje.config.json")
    rep, reg = pipeline.construir_reporte(api.repo_root, api.projects_dir,
                                          api.store_path, api.config_path, None, None)
    html = dashboard.render_html(rep, reg)
    webview.create_window("HAT3X Fichaje", html=html, js_api=api, width=1100, height=800)
    webview.start()

if __name__ == "__main__":
    lanzar()
```

`apps/fichaje/requirements-dev.txt`:
```
pywebview==5.*
pyinstaller==6.*
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/fichaje && python -m pytest tests/test_app_api.py -v`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/fichaje/fichaje/app.py apps/fichaje/requirements-dev.txt apps/fichaje/tests/test_app_api.py
git commit -m "feat(fichaje): app pywebview + puente Api (testeable sin webview)"
```

---

### Task 11: Empaquetado a `.exe` (PyInstaller) + README

**Files:**
- Create: `apps/fichaje/build.ps1`
- Create: `apps/fichaje/fichaje.spec`
- Create: `apps/fichaje/README.md`

**Interfaces:**
- Consumes: `fichaje/app.py` como entrypoint.
- Produces: `apps/fichaje/dist/fichaje.exe`.

- [ ] **Step 1: Correr la suite completa (verde antes de empaquetar)**

Run: `cd apps/fichaje && python -m pytest -q`
Expected: todos los tests PASS.

- [ ] **Step 2: Escribir el spec de PyInstaller**

```python
# apps/fichaje/fichaje.spec
# -*- mode: python ; coding: utf-8 -*-
block_cipher = None
a = Analysis(['fichaje/app.py'], pathex=['.'], binaries=[], datas=[],
             hiddenimports=['webview'], hookspath=[], runtime_hooks=[],
             excludes=[], cipher=block_cipher)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
          name='fichaje', console=False, onefile=True)
```

- [ ] **Step 3: Escribir el build script**

```powershell
# apps/fichaje/build.ps1
param([switch]$Clean)
Push-Location $PSScriptRoot
if ($Clean) { Remove-Item -Recurse -Force build,dist -ErrorAction SilentlyContinue }
python -m pip install -r requirements-dev.txt
python -m PyInstaller --noconfirm fichaje.spec
Write-Host "Listo: dist\fichaje.exe"
Pop-Location
```

- [ ] **Step 4: Construir y verificar el .exe**

Run: `cd apps/fichaje && powershell -File build.ps1 -Clean`
Expected: se genera `apps/fichaje/dist/fichaje.exe`. Doble clic → abre la ventana con el dashboard.

Verificación manual (checklist):
- [ ] La ventana abre y muestra jornada real + facturable.
- [ ] El dashboard lista clientes con sus horas.
- [ ] `fichaje.exe` no requiere Python instalado en la máquina.

- [ ] **Step 5: README + commit**

`apps/fichaje/README.md` con: qué es, cómo correr en dev (`python -m fichaje.app`), cómo buildear (`./build.ps1 -Clean`), estructura de `fichaje.config.json`, y nota de que `data/` es privado (gitignored).

```bash
git add apps/fichaje/build.ps1 apps/fichaje/fichaje.spec apps/fichaje/README.md
git commit -m "build(fichaje): empaquetado .exe con PyInstaller + README"
```

---

## Mejoras incrementales (post-v1, no bloquean)

- **Botones Entrada/Salida dentro del dashboard:** añadir sobre `_PLANTILLA` una barra que llame a `window.pywebview.api.entrada()/salida()` y refresque vía `api.datos()`. El puente (`Api`, Task 10) ya lo soporta.
- **Timeline visual con carriles y solape:** render de `D.bloques` en carriles paralelos sobre `_PLANTILLA`. Los datos ya salen de `report._bloques`.
- **`projects_dir` a config:** hoy el slug del directorio de sesiones de Claude Code va fijo en `cli.py`/`app.py`; moverlo a `fichaje.config.json`.
- **`estado()` con totales de hoy en vivo** y `add` manual desde la UI.

## Self-Review (hecho)

- **Cobertura del spec:** solape+unión (Task 7), auto+manual (Task 5/9), jornada por entrada/salida (Task 5), histórico estimado (Task 6), atribución por ruta+interno+herencia+arrastre (Task 4/7), caché (Task 3), dashboard embebido (Task 8/10), `.exe` (Task 11), config con tarifas (Task 1/7), CSV (Task 7). ✔
- **Sin placeholders:** todos los steps llevan código real. ✔
- **Consistencia de tipos:** `Evento/Ventana/ActividadCliente/Bloque/TotalCliente/Reporte` y firmas (`intervalos_actividad`, `ventanas_estimado`, `combinar`, `facturar`, `construir_reporte`, `Api`) coinciden entre tareas. ✔
