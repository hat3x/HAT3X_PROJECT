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
