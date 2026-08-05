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
