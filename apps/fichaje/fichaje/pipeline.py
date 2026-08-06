from dataclasses import replace
from datetime import datetime, time
from pathlib import Path
from . import config as cfgmod, logs, clients, attribution, windows, report
from .cache import Cache
from .store import Store

def _recortar_ventanas(ventanas, lo, hi):
    """Recorta cada ventana al intervalo [lo, hi]; descarta las que queden fuera por completo."""
    out = []
    for v in ventanas:
        ini = max(v.inicio, lo) if lo else v.inicio
        fin = min(v.fin, hi) if hi else v.fin
        if ini < fin:
            out.append(replace(v, inicio=ini, fin=fin))
    return out

def construir_reporte(repo_root, projects_dir, store_path, config_path, desde=None, hasta=None):
    cfg = cfgmod.cargar(config_path)
    reg = clients.descubrir(repo_root, {k: v.get("nombre") for k, v in cfg.clientes.items()})
    cache = Cache(Path(store_path).parent / "cache")
    eventos = logs.eventos_de_proyectos(projects_dir, cfg.tz, cache=cache)
    lo = datetime.combine(desde, time.min, cfg.tz) if desde else None
    hi = datetime.combine(hasta, time.max, cfg.tz) if hasta else None
    if lo:
        eventos = [e for e in eventos if e.ts >= lo]
    if hi:
        eventos = [e for e in eventos if e.ts <= hi]
    st = Store(store_path)
    fich = _recortar_ventanas(st.ventanas_fichado(), lo, hi)
    man = _recortar_ventanas(st.ventanas_manual(), lo, hi)
    est = windows.ventanas_estimado(eventos, cubierto=[*fich, *man],
                                    umbral_min=cfg.umbral_inactividad_min)
    vent = windows.combinar(fich, man, est)
    acts = attribution.intervalos_actividad(eventos, reg, cfg.umbral_inactividad_min)
    return report.facturar(vent, acts, reg, cfg.clientes, cfg.tz,
                           tarifa_defecto=cfg.tarifa_defecto_eur_h), reg
