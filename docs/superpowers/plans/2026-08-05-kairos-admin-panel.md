# Kairos Admin — Panel de administración · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea a tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** App de escritorio Windows (`.exe`, pywebview + Python) para que Jose administre Kairos: alta de tenants, add-ons, API keys de recepción, reset de contraseña y siembra de catálogo, hablando directo con Supabase (service_role).

**Architecture:** Ventana pywebview que carga una UI web local y expone un bridge Python. El backend Python (paquete `kairos_admin`) opera datos en Supabase vía PostgREST + Auth admin API. La lógica de negocio (`ops/*`) es Python puro testeable contra un `FakeSupabase` en memoria; el cliente real (`supa.py`) se prueba con un transporte HTTP falso. Config con secretos cifrada en disco, descifrada con una contraseña maestra. Empaquetado con PyInstaller.

**Tech Stack:** Python 3.11+, pywebview, cryptography (Fernet + scrypt), requests, pytest, PyInstaller. Frontend HTML/CSS/JS vanilla (look Kairos).

**Spec:** `docs/superpowers/specs/2026-08-05-kairos-admin-panel-design.md`

## Global Constraints

- Ubicación del código: `clients/projects/kairos-admin/`.
- Usuario único (Jose). Sin multiusuario, sin analítica, sin edición de citas (YAGNI).
- **Secretos**: service_role/URL solo en `%APPDATA%\KairosAdmin\config.enc` (cifrado). NUNCA en el `.exe`, NUNCA en logs. Las contraseñas y API keys generadas se muestran **una sola vez**.
- **Aislamiento**: toda lectura/escritura acotada por `salon_id` (service_role omite RLS).
- **Convenciones de esquema** (fijas, verbatim del esquema Kairos):
  - Email de login sintético: `<login_id>@salonos.app`.
  - `professional_schedules.weekday`: entero 0-6 con **0=domingo … 6=sábado**; `start_time`/`end_time` como `HH:MM:SS`.
  - `services`: `application_min`, `exposure_min`, `post_exposure_min` (enteros); `duration_minutes` es GENERADA (no se inserta).
  - `salon_features.feature` enum: `loyalty | client_app | staff_app | ai_receptionist | pos`.
  - API key recepción: formato `sk_recep_` + 43 chars base62; se guarda `key_hash` (SHA-256 hex) + `key_prefix` (primeros 15 chars) + `scopes` (array); NUNCA la clave en claro.
- **TDD**: test que falla → mínimo para pasar → verde → commit. Tests con pytest en `tests/`.
- **Sin red en tests**: los tests no llaman a Supabase real; usan `FakeSupabase` (ops) o un transporte HTTP falso (`supa.py`).

---

## File Structure

```
clients/projects/kairos-admin/
├─ requirements.txt
├─ pyproject.toml                # config de pytest
├─ .gitignore
├─ README.md
├─ MANTENIMIENTO.md
├─ run.py                        # entry point: ventana pywebview + bridge
├─ kairos_admin.spec             # PyInstaller
├─ kairos_admin/
│  ├─ __init__.py
│  ├─ crypto.py                  # cifrado de config (scrypt + Fernet)
│  ├─ config.py                  # load/save config.enc, first-run
│  ├─ slug.py                    # slugify + unicidad
│  ├─ supa.py                    # SupabaseClient (PostgREST + Auth admin)
│  ├─ importers.py               # CSV/JSON → catálogo canónico + validación
│  ├─ templates.py               # plantillas de catálogo por sector
│  ├─ ops/
│  │  ├─ __init__.py
│  │  ├─ tenants.py
│  │  ├─ features.py
│  │  ├─ access.py
│  │  ├─ catalog.py
│  │  └─ onboarding.py           # orquesta el alta completa
│  └─ bridge.py                  # Api expuesta a la UI
├─ ui/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
└─ tests/
   ├─ conftest.py                # FakeSupabase + fixtures
   ├─ test_crypto.py
   ├─ test_config.py
   ├─ test_slug.py
   ├─ test_supa.py
   ├─ test_importers.py
   ├─ test_templates.py
   ├─ test_ops_tenants.py
   ├─ test_ops_features.py
   ├─ test_ops_access.py
   ├─ test_ops_catalog.py
   ├─ test_ops_onboarding.py
   └─ test_bridge.py
```

---

### Task 1: Scaffold del proyecto + pytest

**Files:**
- Create: `clients/projects/kairos-admin/requirements.txt`, `pyproject.toml`, `.gitignore`, `kairos_admin/__init__.py`, `kairos_admin/ops/__init__.py`, `tests/__init__.py`
- Test: `tests/test_smoke.py`

**Interfaces:**
- Produces: paquete `kairos_admin` importable; pytest configurado.

- [ ] **Step 1: requirements.txt**

```
pywebview==5.*
cryptography==43.*
requests==2.*
pytest==8.*
```

- [ ] **Step 2: pyproject.toml (pytest)**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 3: .gitignore**

```
__pycache__/
*.pyc
.pytest_cache/
build/
dist/
*.spec.bak
```

- [ ] **Step 4: paquetes vacíos** — crear `kairos_admin/__init__.py`, `kairos_admin/ops/__init__.py`, `tests/__init__.py` (vacíos).

- [ ] **Step 5: test de humo** — `tests/test_smoke.py`

```python
def test_package_imports():
    import kairos_admin  # noqa: F401
```

- [ ] **Step 6: Ejecutar** — `pytest -q`. Esperado: 1 passed.

- [ ] **Step 7: Commit** — `git add clients/projects/kairos-admin && git commit -m "chore(kairos-admin): scaffold + pytest"`

---

### Task 2: `crypto.py` — cifrado de la config

**Files:**
- Create: `kairos_admin/crypto.py`
- Test: `tests/test_crypto.py`

**Interfaces:**
- Produces:
  - `encrypt(plaintext: bytes, password: str) -> bytes`
  - `decrypt(blob: bytes, password: str) -> bytes` (lanza `BadPassword` si la contraseña es incorrecta o el blob está corrupto)
  - `class BadPassword(Exception)`

- [ ] **Step 1: Test que falla** — `tests/test_crypto.py`

```python
import pytest
from kairos_admin.crypto import encrypt, decrypt, BadPassword

def test_roundtrip():
    blob = encrypt(b'{"k":"v"}', "correct horse")
    assert decrypt(blob, "correct horse") == b'{"k":"v"}'

def test_wrong_password_raises():
    blob = encrypt(b"secret", "right")
    with pytest.raises(BadPassword):
        decrypt(blob, "wrong")

def test_blob_is_not_plaintext():
    blob = encrypt(b"service_role_key", "pw")
    assert b"service_role_key" not in blob
```

- [ ] **Step 2: Ejecutar y ver fallar** — `pytest tests/test_crypto.py -q` → ImportError.

- [ ] **Step 3: Implementación mínima** — `kairos_admin/crypto.py`

```python
"""Cifrado simétrico de la config con clave derivada de la contraseña maestra."""
import base64, os
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

class BadPassword(Exception):
    pass

_MAGIC = b"KADM1"          # cabecera de versión
_SALT_LEN = 16

def _derive(password: str, salt: bytes) -> bytes:
    kdf = Scrypt(salt=salt, length=32, n=2**14, r=8, p=1)
    return base64.urlsafe_b64encode(kdf.derive(password.encode("utf-8")))

def encrypt(plaintext: bytes, password: str) -> bytes:
    salt = os.urandom(_SALT_LEN)
    token = Fernet(_derive(password, salt)).encrypt(plaintext)
    return _MAGIC + salt + token

def decrypt(blob: bytes, password: str) -> bytes:
    if not blob.startswith(_MAGIC):
        raise BadPassword("Formato de config no reconocido.")
    salt = blob[len(_MAGIC):len(_MAGIC) + _SALT_LEN]
    token = blob[len(_MAGIC) + _SALT_LEN:]
    try:
        return Fernet(_derive(password, salt)).decrypt(token)
    except InvalidToken as exc:
        raise BadPassword("Contraseña maestra incorrecta.") from exc
```

- [ ] **Step 4: Ejecutar** — `pytest tests/test_crypto.py -q` → 3 passed.

- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): crypto de config (scrypt+Fernet)"`

---

### Task 3: `config.py` — persistencia de la config cifrada

**Files:**
- Create: `kairos_admin/config.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Consumes: `crypto.encrypt/decrypt/BadPassword`.
- Produces:
  - `@dataclass Config(supabase_url: str, service_role_key: str, project_ref: str)`
  - `config_path() -> Path` (`%APPDATA%\KairosAdmin\config.enc`; respeta `KAIROS_ADMIN_HOME` para tests)
  - `exists() -> bool`
  - `save(cfg: Config, password: str) -> None`
  - `load(password: str) -> Config` (lanza `BadPassword` si la contraseña falla; `FileNotFoundError` si no existe)

- [ ] **Step 1: Test que falla** — `tests/test_config.py`

```python
import pytest
from kairos_admin.config import Config, save, load, exists
from kairos_admin.crypto import BadPassword

def test_save_load_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    assert exists() is False
    cfg = Config(supabase_url="https://x.supabase.co", service_role_key="svc", project_ref="x")
    save(cfg, "master")
    assert exists() is True
    got = load("master")
    assert got.service_role_key == "svc"

def test_wrong_master_password(tmp_path, monkeypatch):
    monkeypatch.setenv("KAIROS_ADMIN_HOME", str(tmp_path))
    save(Config("u", "svc", "r"), "right")
    with pytest.raises(BadPassword):
        load("wrong")
```

- [ ] **Step 2: Ejecutar y ver fallar** — `pytest tests/test_config.py -q`.

- [ ] **Step 3: Implementación** — `kairos_admin/config.py`

```python
"""Config con secretos, persistida CIFRADA en disco."""
import json, os
from dataclasses import dataclass, asdict
from pathlib import Path
from kairos_admin import crypto

@dataclass
class Config:
    supabase_url: str
    service_role_key: str
    project_ref: str

def _home() -> Path:
    base = os.environ.get("KAIROS_ADMIN_HOME")
    if base:
        return Path(base)
    return Path(os.environ.get("APPDATA", str(Path.home()))) / "KairosAdmin"

def config_path() -> Path:
    return _home() / "config.enc"

def exists() -> bool:
    return config_path().exists()

def save(cfg: Config, password: str) -> None:
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    blob = crypto.encrypt(json.dumps(asdict(cfg)).encode("utf-8"), password)
    path.write_bytes(blob)

def load(password: str) -> Config:
    data = json.loads(crypto.decrypt(config_path().read_bytes(), password).decode("utf-8"))
    return Config(**data)
```

- [ ] **Step 4: Ejecutar** — `pytest tests/test_config.py -q` → 2 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): config cifrada en disco"`

---

### Task 4: `slug.py` — slugify + unicidad

**Files:**
- Create: `kairos_admin/slug.py`
- Test: `tests/test_slug.py`

**Interfaces:**
- Produces:
  - `slugify(name: str) -> str` (minúsculas, sin acentos, `-` por espacios, solo `[a-z0-9-]`)
  - `ensure_unique(base: str, existing: set[str]) -> str` (añade `-2`, `-3`… si colisiona)

- [ ] **Step 1: Test que falla** — `tests/test_slug.py`

```python
from kairos_admin.slug import slugify, ensure_unique

def test_slugify_accents_and_spaces():
    assert slugify("Clínica Ñandú  Dental") == "clinica-nandu-dental"

def test_ensure_unique():
    assert ensure_unique("biodental", set()) == "biodental"
    assert ensure_unique("biodental", {"biodental"}) == "biodental-2"
    assert ensure_unique("biodental", {"biodental", "biodental-2"}) == "biodental-3"
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/slug.py`

```python
"""Slug de salón: slugify + unicidad."""
import re, unicodedata

def slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", str(name or "")).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-+", "-", s)

def ensure_unique(base: str, existing: set) -> str:
    if base not in existing:
        return base
    i = 2
    while f"{base}-{i}" in existing:
        i += 1
    return f"{base}-{i}"
```

- [ ] **Step 4: Ejecutar** → 2 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): slugify + unicidad"`

---

### Task 5: `supa.py` (SupabaseClient) + `FakeSupabase` (conftest)

**Files:**
- Create: `kairos_admin/supa.py`, `tests/conftest.py`
- Test: `tests/test_supa.py`

**Interfaces:**
- Produces: `SupabaseClient` con la interfaz que consumen los `ops`:
  - `select(table, filters: dict, columns="*") -> list[dict]`
  - `insert(table, rows: list[dict]) -> list[dict]` (devuelve las filas insertadas con `id`)
  - `update(table, filters: dict, patch: dict) -> list[dict]`
  - `delete(table, filters: dict) -> None`
  - `auth_create_user(email, password) -> dict` (→ `{"id": ...}`)
  - `auth_update_user(uid, patch: dict) -> dict`
  - `class SupabaseError(Exception)`
  - `FakeSupabase` (en `conftest.py`) implementa la MISMA interfaz en memoria (para tests de ops).

- [ ] **Step 1: Test que falla** — `tests/test_supa.py` (prueba el cliente real con un transporte falso que captura la request)

```python
import json
from kairos_admin.supa import SupabaseClient

class FakeResp:
    def __init__(self, status, body): self.status_code = status; self._b = body
    def json(self): return self._b
    @property
    def text(self): return json.dumps(self._b)

class FakeSession:
    def __init__(self): self.calls = []
    def request(self, method, url, headers=None, params=None, json=None, timeout=None):
        self.calls.append({"method": method, "url": url, "params": params, "json": json, "headers": headers})
        return FakeResp(200, [{"id": "new-id"}])

def test_insert_builds_rest_request():
    sess = FakeSession()
    c = SupabaseClient("https://p.supabase.co", "svckey", session=sess)
    out = c.insert("salons", [{"name": "X"}])
    call = sess.calls[-1]
    assert call["method"] == "POST"
    assert call["url"].endswith("/rest/v1/salons")
    assert call["headers"]["apikey"] == "svckey"
    assert call["headers"]["Prefer"] == "return=representation"
    assert out == [{"id": "new-id"}]

def test_select_builds_filters():
    sess = FakeSession()
    c = SupabaseClient("https://p.supabase.co", "svc", session=sess)
    c.select("salon_features", {"salon_id": "S1"}, columns="feature,enabled")
    call = sess.calls[-1]
    assert call["method"] == "GET"
    assert call["params"]["salon_id"] == "eq.S1"
    assert call["params"]["select"] == "feature,enabled"
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/supa.py`

```python
"""Cliente Supabase (service_role): PostgREST + Auth admin API. Transporte inyectable."""
import requests

class SupabaseError(Exception):
    pass

class SupabaseClient:
    def __init__(self, url: str, service_role_key: str, session=None):
        self.url = url.rstrip("/")
        self.key = service_role_key
        self.session = session or requests.Session()

    def _headers(self, extra=None):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}",
             "Content-Type": "application/json"}
        if extra:
            h.update(extra)
        return h

    def _call(self, method, path, params=None, body=None, headers=None):
        resp = self.session.request(method, self.url + path, headers=self._headers(headers),
                                    params=params, json=body, timeout=30)
        if resp.status_code >= 300:
            raise SupabaseError(f"{resp.status_code}: {resp.text[:300]}")
        try:
            return resp.json()
        except Exception:
            return None

    # ---- PostgREST ----
    def select(self, table, filters=None, columns="*"):
        params = {"select": columns}
        for k, v in (filters or {}).items():
            params[k] = f"eq.{v}"
        return self._call("GET", f"/rest/v1/{table}", params=params) or []

    def insert(self, table, rows):
        return self._call("POST", f"/rest/v1/{table}", body=rows,
                          headers={"Prefer": "return=representation"}) or []

    def update(self, table, filters, patch):
        params = {k: f"eq.{v}" for k, v in filters.items()}
        return self._call("PATCH", f"/rest/v1/{table}", params=params, body=patch,
                          headers={"Prefer": "return=representation"}) or []

    def delete(self, table, filters):
        params = {k: f"eq.{v}" for k, v in filters.items()}
        self._call("DELETE", f"/rest/v1/{table}", params=params)

    # ---- Auth admin ----
    def auth_create_user(self, email, password):
        return self._call("POST", "/auth/v1/admin/users",
                          body={"email": email, "password": password, "email_confirm": True})

    def auth_update_user(self, uid, patch):
        return self._call("PUT", f"/auth/v1/admin/users/{uid}", body=patch)
```

- [ ] **Step 4: `FakeSupabase` en `tests/conftest.py`** (interfaz idéntica, en memoria)

```python
import itertools, pytest

class FakeSupabase:
    def __init__(self):
        self.tables = {}
        self._ids = itertools.count(1)
        self.auth_users = {}

    def _key(self, table):
        return self.tables.setdefault(table, [])

    def select(self, table, filters=None, columns="*"):
        rows = self._key(table)
        out = []
        for r in rows:
            if all(str(r.get(k)) == str(v) for k, v in (filters or {}).items()):
                out.append(dict(r))
        return out

    def insert(self, table, rows):
        created = []
        for row in rows:
            r = dict(row)
            r.setdefault("id", f"id-{next(self._ids)}")
            self._key(table).append(r)
            created.append(dict(r))
        return created

    def update(self, table, filters, patch):
        changed = []
        for r in self._key(table):
            if all(str(r.get(k)) == str(v) for k, v in filters.items()):
                r.update(patch)
                changed.append(dict(r))
        return changed

    def delete(self, table, filters):
        rows = self._key(table)
        self.tables[table] = [r for r in rows
                              if not all(str(r.get(k)) == str(v) for k, v in filters.items())]

    def auth_create_user(self, email, password):
        uid = f"uid-{next(self._ids)}"
        self.auth_users[uid] = {"email": email, "password": password}
        return {"id": uid, "email": email}

    def auth_update_user(self, uid, patch):
        self.auth_users.setdefault(uid, {}).update(patch)
        return {"id": uid, **self.auth_users[uid]}

@pytest.fixture
def supa():
    return FakeSupabase()
```

- [ ] **Step 5: Ejecutar** — `pytest tests/test_supa.py -q` → 2 passed.
- [ ] **Step 6: Commit** — `git commit -am "feat(kairos-admin): SupabaseClient + FakeSupabase"`

---

### Task 6: `importers.py` — CSV/JSON → catálogo canónico + validación

**Files:**
- Create: `kairos_admin/importers.py`
- Test: `tests/test_importers.py`

**Interfaces:**
- Produces:
  - Tipo canónico (dicts): `{"professionals": [...], "services": [...], "schedules": [...], "links": [...]}` (ver spec §7).
  - `load_json(text: str) -> dict` (valida forma canónica).
  - `load_csv(text: str, kind: str) -> list[dict]` (`kind` ∈ professionals|services|schedules|links).
  - `validate(catalog: dict) -> list[str]` (lista de errores; vacía = OK). Reglas: weekday 0-6; fases enteras ≥ 0; nombres de profesional/servicio únicos; `links`/`schedules` referencian nombres existentes; horas `HH:MM` válidas.
  - `class ImportError_(Exception)`.

- [ ] **Step 1: Test que falla** — `tests/test_importers.py`

```python
from kairos_admin.importers import load_json, load_csv, validate

CANON = {
    "professionals": [{"full_name": "Nadia Ros"}],
    "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
    "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
    "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
}

def test_load_json_ok():
    import json
    assert validate(load_json(json.dumps(CANON))) == []

def test_validate_bad_weekday():
    bad = {**CANON, "schedules": [{"professional": "Nadia Ros", "weekday": 9, "start": "10:00", "end": "14:00"}]}
    errs = validate(bad)
    assert any("weekday" in e for e in errs)

def test_validate_unknown_reference():
    bad = {**CANON, "links": [{"professional": "Fantasma", "service": "Revisión"}]}
    assert any("Fantasma" in e for e in validate(bad))

def test_load_csv_services():
    csv_text = "name,application_min,exposure_min,post_exposure_min\nRevisión,20,0,0\n"
    rows = load_csv(csv_text, "services")
    assert rows[0]["application_min"] == 20  # convertido a int
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/importers.py`

```python
"""Importación de catálogo: JSON canónico o CSV por entidad. Con validación."""
import csv, io, json, re

class ImportError_(Exception):
    pass

_TIME = re.compile(r"^([01]?\d|2[0-3]):[0-5]\d$")
_INT_FIELDS = {
    "services": {"application_min", "exposure_min", "post_exposure_min", "price_cents"},
    "schedules": {"weekday"},
}

def load_json(text: str) -> dict:
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ImportError_("El JSON debe ser un objeto con professionals/services/schedules/links.")
    return {k: data.get(k, []) for k in ("professionals", "services", "schedules", "links")}

def load_csv(text: str, kind: str) -> list:
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for raw in reader:
        row = {k: (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
        for f in _INT_FIELDS.get(kind, set()):
            if row.get(f) not in (None, ""):
                row[f] = int(row[f])
        rows.append(row)
    return rows

def validate(catalog: dict) -> list:
    errors = []
    pros = [p.get("full_name") for p in catalog.get("professionals", [])]
    svcs = [s.get("name") for s in catalog.get("services", [])]
    if len(pros) != len(set(pros)):
        errors.append("Hay profesionales con nombre repetido.")
    if len(svcs) != len(set(svcs)):
        errors.append("Hay servicios con nombre repetido.")
    for s in catalog.get("services", []):
        for f in ("application_min", "exposure_min", "post_exposure_min"):
            v = s.get(f, 0)
            if not isinstance(v, int) or v < 0:
                errors.append(f"Servicio '{s.get('name')}': {f} debe ser entero >= 0.")
    for sch in catalog.get("schedules", []):
        if sch.get("weekday") not in range(0, 7):
            errors.append(f"schedule de '{sch.get('professional')}': weekday debe ser 0-6.")
        for f in ("start", "end"):
            if not _TIME.match(str(sch.get(f, ""))):
                errors.append(f"schedule de '{sch.get('professional')}': {f} hora inválida.")
        if sch.get("professional") not in pros:
            errors.append(f"schedule referencia profesional inexistente: {sch.get('professional')}.")
    for ln in catalog.get("links", []):
        if ln.get("professional") not in pros:
            errors.append(f"link referencia profesional inexistente: {ln.get('professional')}.")
        if ln.get("service") not in svcs:
            errors.append(f"link referencia servicio inexistente: {ln.get('service')}.")
    return errors
```

- [ ] **Step 4: Ejecutar** → 4 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): importers CSV/JSON + validación de catálogo"`

---

### Task 7: `templates.py` — plantillas de catálogo por sector

**Files:**
- Create: `kairos_admin/templates.py`
- Test: `tests/test_templates.py`

**Interfaces:**
- Consumes: `importers.validate`.
- Produces:
  - `SECTORS: list[str]` (p. ej. `["dental", "peluqueria", "clinica"]`).
  - `get_template(sector: str) -> dict` (catálogo canónico válido; canónico vacío si el sector no tiene plantilla).

- [ ] **Step 1: Test que falla** — `tests/test_templates.py`

```python
from kairos_admin.templates import SECTORS, get_template
from kairos_admin.importers import validate

def test_sectors_present():
    assert "dental" in SECTORS and "peluqueria" in SECTORS

def test_templates_are_valid():
    for s in SECTORS:
        assert validate(get_template(s)) == []

def test_dental_has_services():
    assert len(get_template("dental")["services"]) >= 3
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/templates.py` (plantillas mínimas válidas)

```python
"""Plantillas de catálogo por sector (esquema canónico de importers)."""

def _empty():
    return {"professionals": [], "services": [], "schedules": [], "links": []}

_DENTAL = {
    "professionals": [{"full_name": "Odontólogo/a 1"}],
    "services": [
        {"name": "Revisión", "category": "General", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0},
        {"name": "Limpieza dental", "category": "General", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
        {"name": "Empaste", "category": "General", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
    ],
    "schedules": [
        {"professional": "Odontólogo/a 1", "weekday": d, "start": "10:00", "end": "14:00"} for d in (1, 2, 3, 4, 5)
    ],
    "links": [
        {"professional": "Odontólogo/a 1", "service": s}
        for s in ("Revisión", "Limpieza dental", "Empaste")
    ],
}

_PELUQUERIA = {
    "professionals": [{"full_name": "Estilista 1"}],
    "services": [
        {"name": "Corte", "category": "Peluquería", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
        {"name": "Tinte", "category": "Peluquería", "application_min": 30, "exposure_min": 30, "post_exposure_min": 15},
        {"name": "Peinado", "category": "Peluquería", "application_min": 30, "exposure_min": 0, "post_exposure_min": 0},
    ],
    "schedules": [
        {"professional": "Estilista 1", "weekday": d, "start": "10:00", "end": "20:00"} for d in (1, 2, 3, 4, 5)
    ],
    "links": [
        {"professional": "Estilista 1", "service": s} for s in ("Corte", "Tinte", "Peinado")
    ],
}

_TEMPLATES = {"dental": _DENTAL, "peluqueria": _PELUQUERIA, "clinica": _empty()}
SECTORS = list(_TEMPLATES.keys())

def get_template(sector: str) -> dict:
    import copy
    return copy.deepcopy(_TEMPLATES.get(sector, _empty()))
```

- [ ] **Step 4: Ejecutar** → 3 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): plantillas de catálogo por sector"`

---

### Task 8: `ops/tenants.py` — salones (list/create/update/active)

**Files:**
- Create: `kairos_admin/ops/tenants.py`
- Test: `tests/test_ops_tenants.py`

**Interfaces:**
- Consumes: `SupabaseClient`-like (usa `supa` fixture), `slug.slugify/ensure_unique`.
- Produces:
  - `list_salons(supa) -> list[dict]`
  - `create_salon(supa, name, sector, timezone="Europe/Madrid") -> dict` (genera slug único, inserta `salons` con `active=True`, `settings={}`)
  - `set_active(supa, salon_id, active: bool) -> dict`
  - `update_salon(supa, salon_id, patch: dict) -> dict`

- [ ] **Step 1: Test que falla** — `tests/test_ops_tenants.py`

```python
from kairos_admin.ops import tenants

def test_create_salon_unique_slug(supa):
    a = tenants.create_salon(supa, "Biodental", "dental")
    b = tenants.create_salon(supa, "Biodental", "dental")
    assert a["slug"] == "biodental"
    assert b["slug"] == "biodental-2"
    assert a["active"] is True

def test_list_and_set_active(supa):
    s = tenants.create_salon(supa, "X", "dental")
    tenants.set_active(supa, s["id"], False)
    assert tenants.list_salons(supa)[0]["active"] is False
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/ops/tenants.py`

```python
"""Operaciones sobre salones (tenants)."""
from kairos_admin.slug import slugify, ensure_unique

def list_salons(supa):
    return supa.select("salons", columns="id,name,slug,sector,timezone,active,settings")

def create_salon(supa, name, sector, timezone="Europe/Madrid"):
    existing = {s["slug"] for s in supa.select("salons", columns="slug")}
    slug = ensure_unique(slugify(name), existing)
    rows = supa.insert("salons", [{
        "name": name, "slug": slug, "sector": sector,
        "timezone": timezone, "active": True, "settings": {},
    }])
    return rows[0]

def set_active(supa, salon_id, active):
    return supa.update("salons", {"id": salon_id}, {"active": active})[0]

def update_salon(supa, salon_id, patch):
    return supa.update("salons", {"id": salon_id}, patch)[0]
```

- [ ] **Step 4: Ejecutar** → 2 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): ops.tenants"`

---

### Task 9: `ops/features.py` — add-ons

**Files:**
- Create: `kairos_admin/ops/features.py`
- Test: `tests/test_ops_features.py`

**Interfaces:**
- Produces:
  - `FEATURES: list[str]` = `["loyalty","client_app","staff_app","ai_receptionist","pos"]`
  - `get_features(supa, salon_id) -> dict` (`{feature: {"enabled": bool, "notes": str|None}}`, todas las FEATURES presentes; las que no existan en BD → `enabled=False`)
  - `set_feature(supa, salon_id, feature, enabled, notes=None) -> dict` (upsert: update si existe, insert si no)

- [ ] **Step 1: Test que falla** — `tests/test_ops_features.py`

```python
from kairos_admin.ops import features

def test_defaults_all_disabled(supa):
    f = features.get_features(supa, "S1")
    assert set(f.keys()) == set(features.FEATURES)
    assert f["pos"]["enabled"] is False

def test_set_feature_upsert_and_notes(supa):
    features.set_feature(supa, "S1", "ai_receptionist", True, notes="Sara")
    features.set_feature(supa, "S1", "ai_receptionist", True, notes="Noa")  # update, no duplica
    f = features.get_features(supa, "S1")
    assert f["ai_receptionist"]["enabled"] is True
    assert f["ai_receptionist"]["notes"] == "Noa"
    assert len(supa.select("salon_features", {"salon_id": "S1", "feature": "ai_receptionist"})) == 1
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/ops/features.py`

```python
"""Add-ons del salón (salon_features)."""
FEATURES = ["loyalty", "client_app", "staff_app", "ai_receptionist", "pos"]

def get_features(supa, salon_id):
    rows = {r["feature"]: r for r in supa.select("salon_features", {"salon_id": salon_id})}
    out = {}
    for f in FEATURES:
        r = rows.get(f)
        out[f] = {"enabled": bool(r["enabled"]) if r else False,
                  "notes": (r.get("notes") if r else None)}
    return out

def set_feature(supa, salon_id, feature, enabled, notes=None):
    if feature not in FEATURES:
        raise ValueError(f"feature desconocida: {feature}")
    existing = supa.select("salon_features", {"salon_id": salon_id, "feature": feature})
    patch = {"enabled": enabled, "notes": notes}
    if existing:
        return supa.update("salon_features", {"salon_id": salon_id, "feature": feature}, patch)[0]
    return supa.insert("salon_features", [{"salon_id": salon_id, "feature": feature, **patch}])[0]
```

- [ ] **Step 4: Ejecutar** → 2 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): ops.features (add-ons)"`

---

### Task 10: `ops/access.py` — login del dueño, reset, API keys

**Files:**
- Create: `kairos_admin/ops/access.py`
- Test: `tests/test_ops_access.py`

**Interfaces:**
- Produces:
  - `create_owner(supa, salon_id, login_id, password) -> dict` (Auth user con email `<login_id>@salonos.app` + insert `salon_members` role=owner; devuelve `{"user_id","email"}`)
  - `reset_password(supa, user_id, new_password) -> None`
  - `gen_api_key() -> tuple[str, str, str]` (clave en claro, sha256 hex, prefix 15)
  - `issue_api_key(supa, salon_id, name, scopes=("appointments:write",)) -> dict` (inserta hash+prefix; **devuelve la clave en claro UNA vez** en `{"key": ..., "prefix": ...}`)
  - `list_api_keys(supa, salon_id) -> list[dict]` (id, name, key_prefix, created_at — NUNCA la clave)
  - `revoke_api_key(supa, key_id) -> None`

- [ ] **Step 1: Test que falla** — `tests/test_ops_access.py`

```python
import hashlib
from kairos_admin.ops import access

def test_create_owner_email_and_member(supa):
    out = access.create_owner(supa, "S1", "biodental", "Pw-2026")
    assert out["email"] == "biodental@salonos.app"
    members = supa.select("salon_members", {"salon_id": "S1"})
    assert members[0]["role"] == "owner"
    assert members[0]["user_id"] == out["user_id"]

def test_issue_api_key_stores_hash_only(supa):
    out = access.issue_api_key(supa, "S1", "Recepción")
    assert out["key"].startswith("sk_recep_")
    row = supa.select("service_api_keys", {"salon_id": "S1"})[0]
    assert "key" not in row
    assert row["key_hash"] == hashlib.sha256(out["key"].encode()).hexdigest()
    assert row["key_prefix"] == out["key"][:15]

def test_list_api_keys_hides_secret(supa):
    access.issue_api_key(supa, "S1", "Recepción")
    listed = access.list_api_keys(supa, "S1")
    assert "key_hash" not in listed[0] and "key" not in listed[0]
    assert "key_prefix" in listed[0]
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/ops/access.py`

```python
"""Acceso del tenant: login del dueño, reset de contraseña, API keys de recepción."""
import hashlib, secrets

_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

def create_owner(supa, salon_id, login_id, password):
    email = f"{login_id}@salonos.app"
    user = supa.auth_create_user(email, password)
    uid = user["id"]
    supa.insert("salon_members", [{"salon_id": salon_id, "user_id": uid, "role": "owner"}])
    return {"user_id": uid, "email": email}

def reset_password(supa, user_id, new_password):
    supa.auth_update_user(user_id, {"password": new_password})

def gen_api_key():
    token = "".join(secrets.choice(_ALPHABET) for _ in range(43))
    key = "sk_recep_" + token
    return key, hashlib.sha256(key.encode()).hexdigest(), key[:15]

def issue_api_key(supa, salon_id, name, scopes=("appointments:write",)):
    key, key_hash, key_prefix = gen_api_key()
    supa.insert("service_api_keys", [{
        "salon_id": salon_id, "name": name, "key_hash": key_hash,
        "key_prefix": key_prefix, "scopes": list(scopes),
    }])
    return {"key": key, "prefix": key_prefix}

def list_api_keys(supa, salon_id):
    rows = supa.select("service_api_keys", {"salon_id": salon_id},
                       columns="id,name,key_prefix,created_at")
    return rows

def revoke_api_key(supa, key_id):
    supa.delete("service_api_keys", {"id": key_id})
```

- [ ] **Step 4: Ejecutar** → 3 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): ops.access (login, reset, API keys)"`

---

### Task 11: `ops/catalog.py` — aplicar/leer catálogo

**Files:**
- Create: `kairos_admin/ops/catalog.py`
- Test: `tests/test_ops_catalog.py`

**Interfaces:**
- Consumes: `importers.validate`.
- Produces:
  - `apply_catalog(supa, salon_id, catalog: dict) -> dict` (valida; inserta `professionals`, `services`, `professional_schedules` (con `weekday`, `start_time`/`end_time` `HH:MM:SS`), `professional_services`; resuelve nombres→ids; devuelve `{"professionals": n, "services": n, "schedules": n, "links": n}`). Lanza `ValueError` con los errores si `validate` falla.
  - `get_catalog(supa, salon_id) -> dict`

- [ ] **Step 1: Test que falla** — `tests/test_ops_catalog.py`

```python
import pytest
from kairos_admin.ops import catalog

CAT = {
    "professionals": [{"full_name": "Nadia Ros"}],
    "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
    "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
    "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
}

def test_apply_catalog_counts_and_links(supa):
    res = catalog.apply_catalog(supa, "S1", CAT)
    assert res == {"professionals": 1, "services": 1, "schedules": 1, "links": 1}
    sched = supa.select("professional_schedules", {"salon_id": "S1"})[0]
    assert sched["weekday"] == 1 and sched["start_time"] == "10:00:00"
    link = supa.select("professional_services", {"salon_id": "S1"})[0]
    prof = supa.select("professionals", {"salon_id": "S1"})[0]
    svc = supa.select("services", {"salon_id": "S1"})[0]
    assert link["professional_id"] == prof["id"] and link["service_id"] == svc["id"]

def test_apply_invalid_raises(supa):
    bad = {**CAT, "schedules": [{"professional": "Nadia Ros", "weekday": 9, "start": "10:00", "end": "14:00"}]}
    with pytest.raises(ValueError):
        catalog.apply_catalog(supa, "S1", bad)
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/ops/catalog.py`

```python
"""Catálogo del salón: aplicar (sembrar/importar) y leer."""
from kairos_admin.importers import validate

def _hhmmss(t):
    return t if len(t) == 8 else f"{t}:00"

def apply_catalog(supa, salon_id, catalog):
    errors = validate(catalog)
    if errors:
        raise ValueError("Catálogo inválido: " + "; ".join(errors))

    prof_id = {}
    for p in catalog.get("professionals", []):
        row = supa.insert("professionals", [{
            "salon_id": salon_id, "full_name": p["full_name"],
            "color": p.get("color"), "active": True,
        }])[0]
        prof_id[p["full_name"]] = row["id"]

    svc_id = {}
    for s in catalog.get("services", []):
        row = supa.insert("services", [{
            "salon_id": salon_id, "name": s["name"], "category": s.get("category"),
            "application_min": s.get("application_min", 0),
            "exposure_min": s.get("exposure_min", 0),
            "post_exposure_min": s.get("post_exposure_min", 0),
            "price_cents": s.get("price_cents", 0), "currency": s.get("currency", "EUR"),
            "active": True,
        }])[0]
        svc_id[s["name"]] = row["id"]

    n_sched = 0
    for sch in catalog.get("schedules", []):
        supa.insert("professional_schedules", [{
            "salon_id": salon_id, "professional_id": prof_id[sch["professional"]],
            "weekday": sch["weekday"], "start_time": _hhmmss(sch["start"]),
            "end_time": _hhmmss(sch["end"]),
        }])
        n_sched += 1

    n_links = 0
    for ln in catalog.get("links", []):
        supa.insert("professional_services", [{
            "salon_id": salon_id, "professional_id": prof_id[ln["professional"]],
            "service_id": svc_id[ln["service"]],
        }])
        n_links += 1

    return {"professionals": len(prof_id), "services": len(svc_id),
            "schedules": n_sched, "links": n_links}

def get_catalog(supa, salon_id):
    return {
        "professionals": supa.select("professionals", {"salon_id": salon_id}),
        "services": supa.select("services", {"salon_id": salon_id}),
        "schedules": supa.select("professional_schedules", {"salon_id": salon_id}),
        "links": supa.select("professional_services", {"salon_id": salon_id}),
    }
```

- [ ] **Step 4: Ejecutar** → 2 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): ops.catalog (aplicar/leer)"`

---

### Task 12: `ops/onboarding.py` — alta de tenant (orquestador)

**Files:**
- Create: `kairos_admin/ops/onboarding.py`
- Test: `tests/test_ops_onboarding.py`

**Interfaces:**
- Consumes: `ops.tenants`, `ops.features`, `ops.access`, `ops.catalog`.
- Produces:
  - `create_tenant(supa, payload: dict) -> dict` donde `payload` = `{name, sector, timezone?, owner:{login_id, password}, features:{<feature>:{enabled,notes?}}, catalog?:dict, issue_api_key?:{name}}`.
  - Devuelve resumen show-once: `{"salon":{...}, "owner":{"login_id","email","password"}, "features":[...], "catalog":{counts}|None, "api_key":{"key","prefix"}|None}`.
  - Orden: salón → owner → features → catalog (si) → api key (si). Si algo falla, propaga la excepción (v1 sin rollback transaccional; documentado como riesgo).

- [ ] **Step 1: Test que falla** — `tests/test_ops_onboarding.py`

```python
from kairos_admin.ops import onboarding

PAYLOAD = {
    "name": "Biodental", "sector": "dental",
    "owner": {"login_id": "biodental", "password": "Pw-2026"},
    "features": {"ai_receptionist": {"enabled": True, "notes": "Sara"}},
    "catalog": {
        "professionals": [{"full_name": "Nadia Ros"}],
        "services": [{"name": "Revisión", "application_min": 20, "exposure_min": 0, "post_exposure_min": 0}],
        "schedules": [{"professional": "Nadia Ros", "weekday": 1, "start": "10:00", "end": "14:00"}],
        "links": [{"professional": "Nadia Ros", "service": "Revisión"}],
    },
    "issue_api_key": {"name": "Recepción"},
}

def test_create_tenant_full(supa):
    out = onboarding.create_tenant(supa, PAYLOAD)
    assert out["salon"]["slug"] == "biodental"
    assert out["owner"]["email"] == "biodental@salonos.app"
    assert out["owner"]["password"] == "Pw-2026"
    assert out["catalog"]["services"] == 1
    assert out["api_key"]["key"].startswith("sk_recep_")
    # efectos en BD
    assert supa.select("salon_members", {"salon_id": out["salon"]["id"]})[0]["role"] == "owner"
    feats = supa.select("salon_features", {"salon_id": out["salon"]["id"], "feature": "ai_receptionist"})
    assert feats[0]["enabled"] is True and feats[0]["notes"] == "Sara"
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/ops/onboarding.py`

```python
"""Alta de tenant: orquesta salón + owner + add-ons + catálogo + API key."""
from kairos_admin.ops import tenants, features, access, catalog as catalog_ops

def create_tenant(supa, payload):
    salon = tenants.create_salon(
        supa, payload["name"], payload["sector"],
        payload.get("timezone", "Europe/Madrid"),
    )
    sid = salon["id"]

    owner_in = payload["owner"]
    owner = access.create_owner(supa, sid, owner_in["login_id"], owner_in["password"])

    applied_features = []
    for feat, cfg in (payload.get("features") or {}).items():
        features.set_feature(supa, sid, feat, cfg.get("enabled", False), cfg.get("notes"))
        applied_features.append(feat)

    catalog_summary = None
    if payload.get("catalog"):
        catalog_summary = catalog_ops.apply_catalog(supa, sid, payload["catalog"])

    api_key = None
    if payload.get("issue_api_key"):
        api_key = access.issue_api_key(supa, sid, payload["issue_api_key"]["name"])

    return {
        "salon": salon,
        "owner": {"login_id": owner_in["login_id"], "email": owner["email"],
                  "password": owner_in["password"]},
        "features": applied_features,
        "catalog": catalog_summary,
        "api_key": api_key,
    }
```

- [ ] **Step 4: Ejecutar** → 1 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): ops.onboarding (alta completa)"`

---

### Task 13: `bridge.py` — API para la UI

**Files:**
- Create: `kairos_admin/bridge.py`
- Test: `tests/test_bridge.py`

**Interfaces:**
- Consumes: `config`, `supa.SupabaseClient`, todos los `ops`.
- Produces: `class Api` con métodos llamables desde JS. Cada método devuelve dicts serializables (o `{"error": msg}`). Métodos:
  - `needs_setup() -> bool`, `first_run(url, service_role, master) -> {"ok":True}`, `unlock(master) -> {"ok":True}|{"error"}` (crea el `SupabaseClient` interno y lo guarda en `self._supa`).
  - `list_tenants()`, `get_tenant(salon_id)` (salón + features + api keys + catálogo), `create_tenant(payload)`, `set_feature(salon_id, feature, enabled, notes)`, `reset_password(user_id, pw)`, `issue_key(salon_id, name)`, `revoke_key(key_id)`, `set_active(salon_id, active)`.
  - `template(sector)`, `import_file(path, kind)` (lee fichero y devuelve catálogo/filas), `validate_catalog(catalog)`.
- Inyección para test: `Api(supa=<FakeSupabase>)` salta el unlock (usa el supa dado).

- [ ] **Step 1: Test que falla** — `tests/test_bridge.py`

```python
from kairos_admin.bridge import Api

def test_bridge_create_and_list(supa):
    api = Api(supa=supa)
    out = api.create_tenant({
        "name": "X", "sector": "dental",
        "owner": {"login_id": "x", "password": "p"},
        "features": {}, "catalog": None,
    })
    assert out["salon"]["slug"] == "x"
    assert len(api.list_tenants()) == 1

def test_bridge_errors_are_returned_not_raised(supa):
    api = Api(supa=supa)
    res = api.set_feature("S1", "feature_inexistente", True, None)
    assert "error" in res

def test_bridge_template(supa):
    api = Api(supa=supa)
    assert len(api.template("dental")["services"]) >= 3
```

- [ ] **Step 2: Ejecutar y ver fallar.**

- [ ] **Step 3: Implementación** — `kairos_admin/bridge.py`

```python
"""API expuesta a la UI (window.pywebview.api). Traduce llamadas JS → ops. Nunca lanza:
devuelve {"error": msg} para que la UI lo muestre."""
import functools
from kairos_admin import config as cfg_mod
from kairos_admin.supa import SupabaseClient
from kairos_admin.ops import tenants, features, access, catalog as catalog_ops, onboarding
from kairos_admin import templates, importers

def _safe(fn):
    @functools.wraps(fn)
    def wrap(self, *a, **k):
        try:
            return fn(self, *a, **k)
        except Exception as exc:  # noqa: BLE001 — frontera con la UI
            return {"error": str(exc)}
    return wrap

class Api:
    def __init__(self, supa=None):
        self._supa = supa  # en tests se inyecta un FakeSupabase

    # ---- setup / unlock ----
    def needs_setup(self):
        return not cfg_mod.exists()

    @_safe
    def first_run(self, url, service_role, master):
        cfg_mod.save(cfg_mod.Config(url, service_role, ""), master)
        self._supa = SupabaseClient(url, service_role)
        return {"ok": True}

    @_safe
    def unlock(self, master):
        cfg = cfg_mod.load(master)
        self._supa = SupabaseClient(cfg.supabase_url, cfg.service_role_key)
        return {"ok": True}

    # ---- tenants ----
    @_safe
    def list_tenants(self):
        return tenants.list_salons(self._supa)

    @_safe
    def get_tenant(self, salon_id):
        salon = [s for s in tenants.list_salons(self._supa) if s["id"] == salon_id]
        return {
            "salon": salon[0] if salon else None,
            "features": features.get_features(self._supa, salon_id),
            "api_keys": access.list_api_keys(self._supa, salon_id),
            "catalog": catalog_ops.get_catalog(self._supa, salon_id),
        }

    @_safe
    def create_tenant(self, payload):
        return onboarding.create_tenant(self._supa, payload)

    @_safe
    def set_feature(self, salon_id, feature, enabled, notes):
        return features.set_feature(self._supa, salon_id, feature, enabled, notes)

    @_safe
    def set_active(self, salon_id, active):
        return tenants.set_active(self._supa, salon_id, active)

    @_safe
    def reset_password(self, user_id, new_password):
        access.reset_password(self._supa, user_id, new_password)
        return {"ok": True}

    @_safe
    def issue_key(self, salon_id, name):
        return access.issue_api_key(self._supa, salon_id, name)

    @_safe
    def revoke_key(self, key_id):
        access.revoke_api_key(self._supa, key_id)
        return {"ok": True}

    # ---- catálogo ----
    @_safe
    def template(self, sector):
        return templates.get_template(sector)

    @_safe
    def import_file(self, path, kind):
        text = open(path, encoding="utf-8").read()
        if path.lower().endswith(".json"):
            return importers.load_json(text)
        return importers.load_csv(text, kind)

    @_safe
    def validate_catalog(self, catalog):
        return {"errors": importers.validate(catalog)}
```

- [ ] **Step 4: Ejecutar** → 3 passed.
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): bridge Api para la UI"`

---

### Task 14: UI — shell + desbloqueo

**Files:**
- Create: `ui/index.html`, `ui/styles.css`, `ui/app.js`

**Interfaces:**
- Consumes: `window.pywebview.api.needs_setup/first_run/unlock`.
- Produces: pantalla de desbloqueo (o primer arranque) que, al validar, muestra la vista de tenants (contenedor `#app`).

- [ ] **Step 1: `ui/index.html`** — estructura base (contenedor `#app`, incluye `styles.css` + `app.js`). Paleta Kairos (tinta `#1c1a17`, porcelana `#f5f1ea`, latón `#a97b45`), fuente Inter (system stack). Pantalla `#unlock` con input contraseña y botón; y `#setup` (url + service_role + master) para primer arranque; contenedor `#toast`.

- [ ] **Step 2: `ui/styles.css`** — estilos look Kairos (tema claro/oscuro por `prefers-color-scheme`; cards, tabla, chips de add-ons, botones).

- [ ] **Step 3: `ui/app.js` — arranque + desbloqueo**

```javascript
const api = () => window.pywebview.api;
const $ = (s) => document.querySelector(s);

async function boot() {
  const needs = await api().needs_setup();
  show(needs ? "setup" : "unlock");
}
async function doUnlock() {
  const res = await api().unlock($("#master").value);
  if (res.error) return toast(res.error);
  renderTenants();
}
async function doSetup() {
  const res = await api().first_run($("#url").value, $("#svc").value, $("#master2").value);
  if (res.error) return toast(res.error);
  renderTenants();
}
function show(id) { document.querySelectorAll(".screen").forEach(e => e.hidden = true); $("#" + id).hidden = false; }
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; setTimeout(() => t.hidden = true, 4000); }
window.addEventListener("pywebviewready", boot);
```

- [ ] **Step 4: Verificación manual** — se completa al tener `run.py` (Task 17). Aquí solo se comprueba que los ficheros existen y `app.js` no tiene errores de sintaxis (`node --check ui/app.js`).
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): UI shell + desbloqueo"`

---

### Task 15: UI — lista y detalle de tenants

**Files:**
- Modify: `ui/app.js`, `ui/styles.css`, `ui/index.html`

**Interfaces:**
- Consumes: `list_tenants`, `get_tenant`, `set_feature`, `set_active`, `reset_password`, `issue_key`, `revoke_key`.
- Produces: tabla de tenants + vista de detalle con pestañas (General / Add-ons / Acceso & API keys / Catálogo).

- [ ] **Step 1: `renderTenants()`** — pinta tabla con nombre/sector/activo/chips de add-ons; fila → `renderDetail(id)`; botón "＋ Nuevo tenant" → `renderWizard()` (Task 16).

```javascript
async function renderTenants() {
  show("app");
  const list = await api().list_tenants();
  $("#app").innerHTML = `<header><h1>Tenants</h1><button id="new">＋ Nuevo tenant</button></header>
    <table><thead><tr><th>Nombre</th><th>Sector</th><th>Activo</th></tr></thead>
    <tbody>${list.map(s => `<tr data-id="${s.id}"><td>${s.name}</td><td>${s.sector}</td><td>${s.active ? "sí" : "no"}</td></tr>`).join("")}</tbody></table>`;
  $("#new").onclick = renderWizard;
  document.querySelectorAll("tr[data-id]").forEach(r => r.onclick = () => renderDetail(r.dataset.id));
}
```

- [ ] **Step 2: `renderDetail(id)`** — llama `get_tenant`, pinta pestañas. Add-ons: toggles → `set_feature`. Acceso: botón reset (pide nueva contraseña, muestra una vez), lista de keys con emitir (muestra en claro una vez) / revocar. Catálogo: tablas de profesionales/servicios/horarios.

- [ ] **Step 3: estilos** de pestañas/toggles/chips en `styles.css`.

- [ ] **Step 4: Verificación** — `node --check ui/app.js`. (Funcional en Task 17.)
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): UI lista + detalle de tenants"`

---

### Task 16: UI — asistente de alta de tenant

**Files:**
- Modify: `ui/app.js`, `ui/styles.css`

**Interfaces:**
- Consumes: `template`, `import_file`, `validate_catalog`, `create_tenant`.
- Produces: asistente por pasos (salón → owner → add-ons → catálogo → extras → resumen). El paso catálogo permite: vacío / plantilla (`template(sector)`) / importar (`import_file`), con vista previa y `validate_catalog`. El resumen muestra credenciales + API key en claro (una vez) con botón "copiar".

- [ ] **Step 1: `renderWizard()`** — estado en memoria del payload; navegación entre pasos; en el paso catálogo, botones "Vacío / Plantilla del sector / Importar fichero" que rellenan `payload.catalog` y muestran vista previa + errores de `validate_catalog`.

- [ ] **Step 2: paso final** — `create_tenant(payload)`; si `res.error` → toast; si OK → pantalla de resumen con `owner.password` y `api_key.key` (aviso "guárdalo, no se vuelve a mostrar") + botón copiar.

- [ ] **Step 3: estilos** del wizard (pasos, barra de progreso, resumen).

- [ ] **Step 4: Verificación** — `node --check ui/app.js`. (Funcional en Task 17.)
- [ ] **Step 5: Commit** — `git commit -am "feat(kairos-admin): UI asistente de alta"`

---

### Task 17: `run.py` — ventana pywebview + verificación funcional

**Files:**
- Create: `clients/projects/kairos-admin/run.py`

**Interfaces:**
- Consumes: `bridge.Api`, `ui/index.html`.
- Produces: ejecutable en dev (`python run.py`) que abre la ventana con la UI y el bridge.

- [ ] **Step 1: `run.py`**

```python
"""Entry point: abre la ventana pywebview con la UI y el bridge Api."""
import os, sys, webview
from kairos_admin.bridge import Api

def main():
    base = getattr(sys, "_MEIPASS", os.path.dirname(__file__))
    ui = os.path.join(base, "ui", "index.html")
    webview.create_window("Kairos Admin", ui, js_api=Api(), width=1100, height=760, min_size=(900, 600))
    webview.start()

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificación funcional manual** (checklist; requiere entorno gráfico Windows con WebView2):
  1. `pip install -r requirements.txt`
  2. `python run.py` → abre ventana "Kairos Admin".
  3. Primer arranque: introduce URL + service_role (de un proyecto de PRUEBA) + contraseña maestra → guarda config.
  4. Cierra y reabre → pide contraseña; con la correcta entra, con otra da error.
  5. Alta de un tenant de prueba con plantilla dental → aparece en la lista; verifica en Supabase (proyecto de prueba) el salón/miembro/features.
  6. Emite y revoca una API key; resetea la contraseña del owner.
  7. **Limpieza**: borra el tenant de prueba del proyecto de prueba.

- [ ] **Step 3: Commit** — `git commit -am "feat(kairos-admin): run.py (ventana pywebview)"`

---

### Task 18: Empaquetado PyInstaller (`.exe`)

**Files:**
- Create: `clients/projects/kairos-admin/kairos_admin.spec`

**Interfaces:**
- Produces: `dist/KairosAdmin.exe` (one-file) que incluye `ui/`. (`run.py` ya resuelve la ruta de `ui/` con `sys._MEIPASS` desde la Task 17.)

- [ ] **Step 1: `kairos_admin.spec`** — one-file, `datas=[('ui', 'ui')]`, `name='KairosAdmin'`, `console=False`.

- [ ] **Step 2: Build** — `pyinstaller kairos_admin.spec`.

- [ ] **Step 3: Verificación manual**:
  1. Ejecutar `dist/KairosAdmin.exe` en una máquina Windows (idealmente limpia) → abre la ventana (WebView2 presente en Win11).
  2. Repetir el flujo mínimo (unlock + listar tenants) contra el proyecto de prueba.

- [ ] **Step 4: Commit** — `git commit -am "build(kairos-admin): empaquetado PyInstaller"`

---

### Task 19: Documentación (README + MANTENIMIENTO)

**Files:**
- Create: `clients/projects/kairos-admin/README.md`, `MANTENIMIENTO.md`

- [ ] **Step 1: README.md** — qué es, instalación (`pip install -r requirements.txt`), `python run.py` (dev), build (`pyinstaller kairos_admin.spec`), primer arranque (config cifrada + contraseña maestra), y aviso de que la service_role vive cifrada en `%APPDATA%\KairosAdmin`.

- [ ] **Step 2: MANTENIMIENTO.md** — troubleshooting: contraseña maestra olvidada (hay que rehacer la config; los datos en Supabase no se pierden), la ventana no abre (instalar WebView2 Runtime), error de Supabase (revisar service_role/URL), reset de la config (borrar `config.enc`). Tests: `pytest -q`.

- [ ] **Step 3: Commit** — `git commit -am "docs(kairos-admin): README + MANTENIMIENTO"`

---

## Self-Review

- **Cobertura del spec**: forma (.exe pywebview) → Task 17/18; acceso directo Supabase (service_role) → Task 5; contraseña maestra + config cifrada → Tasks 2/3; alta de tenant → Task 12/16; add-ons → Task 9/15; API keys → Task 10/15; reset contraseña → Task 10/15; catálogo (plantillas + import CSV/JSON) → Tasks 6/7/11/16; show-once → Tasks 10/12/16; YAGNI → respetado. ✔
- **Consistencia de tipos**: la interfaz `SupabaseClient` (select/insert/update/delete/auth_*) es idéntica en el cliente real (Task 5) y en `FakeSupabase` (conftest); todos los `ops` la consumen igual. El esquema canónico de catálogo es el mismo en importers/templates/catalog/onboarding. La ruta de `ui/` en `run.py` usa `sys._MEIPASS` desde la Task 17 (coherente con el empaquetado de la Task 18). ✔
- **Placeholders**: los pasos de UI (14-16) llevan código real de arranque + estructura; el detalle fino de pintado se completa en su tarea, con verificación por `node --check` y funcional en Task 17. No hay TBD/TODO.
- **Riesgo conocido**: `create_tenant` no es transaccional (v1); si falla a medias puede dejar un salón sin catálogo. Documentado; el remedio v2 sería un rollback o un endpoint server-side. La UI muestra el error y Jose puede reintentar/limpiar.

## Execution Handoff

Plan guardado en `docs/superpowers/plans/2026-08-05-kairos-admin-panel.md`. Dos opciones de ejecución:

1. **Subagent-Driven (recomendado)** — despacho un subagente por tarea, con revisión entre tareas.
2. **Inline** — ejecuto las tareas en esta sesión con checkpoints.

¿Qué approach prefieres?
