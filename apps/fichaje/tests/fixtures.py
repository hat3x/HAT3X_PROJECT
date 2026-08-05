from datetime import datetime
from fichaje import timeutil
from fichaje.models import Evento

TZ = timeutil.TZ_DEFECTO

def ev(hhmm, cliente=None, session="s1"):
    h, m = map(int, hhmm.split(":"))
    ts = datetime(2026, 8, 3, h, m, tzinfo=TZ)
    rutas = (f"c:/x/clients/projects/{cliente}/a.ts",) if cliente else ()
    return Evento(ts=ts, session_id=session, rutas=rutas)
