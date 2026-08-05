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
