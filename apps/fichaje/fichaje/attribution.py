from collections import defaultdict
from datetime import timedelta
from .models import ActividadCliente
from .clients import INTERNO

def _cliente_evento(ev, reg, ultimo):
    for r in ev.rutas:
        c = reg.cliente_de_ruta(r)
        if c:
            return c
    return ultimo  # herencia dentro de sesion

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
            hueco = run_fin is not None and (ev.ts - run_fin) > umbral
            if hueco:
                ultimo = None  # el hueco cierra el run: la herencia no lo cruza
            c = _cliente_evento(ev, reg, ultimo) or INTERNO
            ultimo = c
            if run_cliente is None:
                run_cliente, run_ini, run_fin = c, ev.ts, ev.ts
            elif c == run_cliente and not hueco:
                run_fin = ev.ts
            else:
                out.append(ActividadCliente(run_cliente, run_ini, run_fin, sid))
                run_cliente, run_ini, run_fin = c, ev.ts, ev.ts
        if run_cliente is not None:
            out.append(ActividadCliente(run_cliente, run_ini, run_fin, sid))
    out.sort(key=lambda a: a.inicio)
    return out
