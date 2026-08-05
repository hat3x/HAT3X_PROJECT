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
