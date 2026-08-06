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
    tarifa_defecto_eur_h: float = None
    modo_estimado: str = "conservador"

def cargar(path):
    if path is None or not Path(path).exists():
        return Config(25, timeutil.TZ_DEFECTO, {}, None, "conservador")
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    tz = timeutil.parse_offset(d.get("tz", "+02:00"))
    tarifa_defecto = d.get("tarifa_defecto_eur_h")
    return Config(int(d.get("umbral_inactividad_min", 25)), tz, d.get("clientes", {}),
                  float(tarifa_defecto) if tarifa_defecto is not None else None,
                  d.get("modo_estimado", "conservador"))
