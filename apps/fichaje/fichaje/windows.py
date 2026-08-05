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
            out.append((ini, fin if fin > ini else fin + timedelta(minutes=1)))
            ini = fin = e.ts
    out.append((ini, fin if fin > ini else fin + timedelta(minutes=1)))
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
            if b >= a:
                out.append(Ventana(a, b, "estimado"))
    return out

def combinar(fichado, manual, estimado):
    return sorted([*fichado, *manual, *estimado], key=lambda v: v.inicio)
