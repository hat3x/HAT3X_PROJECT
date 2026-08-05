import argparse, sys, webbrowser
from datetime import datetime, date, time, timedelta
from pathlib import Path
from . import pipeline, dashboard, report, clients, config as cfgmod
from .store import Store, FichajeError

def _paths(root):
    root = Path(root)
    return dict(repo_root=root,
                projects_dir=Path.home()/".claude"/"projects"/"c--Users-josem-Desktop-HAT3X-CLAUDE-HAT3X",
                store_path=root/"apps"/"fichaje"/"data"/"fichaje.json",
                config_path=root/"apps"/"fichaje"/"fichaje.config.json")

def _parse_fecha(s, tz):
    hoy = datetime.now(tz).date()
    if s is None or s == "hoy":
        return hoy
    if s == "ayer":
        return hoy - timedelta(days=1)
    return date.fromisoformat(s)

def _parse_hora(fecha, hhmm, tz):
    h, m = map(int, hhmm.split(":"))
    return datetime.combine(fecha, time(h, m), tz)

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    ap = argparse.ArgumentParser(prog="fichaje")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("entrada").add_argument("--cliente")
    sub.add_parser("salida")
    sub.add_parser("estado")
    sub.add_parser("clientes")
    addp = sub.add_parser("add")
    addp.add_argument("--cliente", required=True)
    addp.add_argument("--de", required=True)
    addp.add_argument("--a", required=True)
    addp.add_argument("--fecha")
    addp.add_argument("--nota")
    inf = sub.add_parser("informe")
    inf.add_argument("--desde"); inf.add_argument("--hasta"); inf.add_argument("--csv")
    sub.add_parser("dashboard")
    args = ap.parse_args(argv)
    P = _paths(Path.cwd())
    cfg = cfgmod.cargar(P["config_path"])
    tz = cfg.tz

    if args.cmd == "entrada":
        try:
            Store(P["store_path"]).entrada(datetime.now(tz), getattr(args, "cliente", None))
        except FichajeError as e:
            print(e); return 1
        print("Entrada fichada."); return 0

    if args.cmd == "salida":
        try:
            Store(P["store_path"]).salida(datetime.now(tz))
        except FichajeError as e:
            print(e); return 1
        print("Salida fichada."); return 0

    if args.cmd == "estado":
        abierto = Store(P["store_path"]).abierto
        if abierto:
            extra = f" (cliente: {abierto['cliente_principal']})" if abierto.get("cliente_principal") else ""
            print(f"Jornada ABIERTA desde {abierto['entrada']}{extra}")
        else:
            print("Sin jornada abierta.")
        return 0

    if args.cmd == "clientes":
        reg = clients.descubrir(P["repo_root"], {k: v.get("nombre") for k, v in cfg.clientes.items()})
        for slug in reg.slugs:
            print(f"{slug:24} {reg.nombre(slug)}")
        return 0

    if args.cmd == "add":
        fecha = _parse_fecha(args.fecha, tz)
        de = _parse_hora(fecha, args.de, tz)
        a_hasta = _parse_hora(fecha, args.a, tz)
        try:
            Store(P["store_path"]).add_manual(args.cliente, de, a_hasta, args.nota)
        except FichajeError as e:
            print(e); return 1
        print(f"Bloque manual anadido: {args.cliente} {args.de}-{args.a} ({fecha.isoformat()})")
        return 0

    desde = date.fromisoformat(args.desde) if getattr(args, "desde", None) else None
    hasta = date.fromisoformat(args.hasta) if getattr(args, "hasta", None) else None
    rep, reg = pipeline.construir_reporte(P["repo_root"], P["projects_dir"], P["store_path"],
                                          P["config_path"], desde, hasta)
    if args.cmd == "informe":
        for tc in rep.totales:
            print(f"{reg.nombre(tc.cliente):24} {tc.minutos//60}h{tc.minutos%60:02d}")
        print(f"JORNADA REAL: {rep.jornada_min//60}h{rep.jornada_min%60:02d}")
        if args.csv:
            report.exportar_csv(rep, args.csv); print(f"CSV -> {args.csv}")
    if args.cmd == "dashboard":
        out = P["repo_root"]/"apps"/"fichaje"/"out"/"fichaje.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(dashboard.render_html(rep, reg), encoding="utf-8")
        webbrowser.open(out.as_uri()); print(f"Dashboard -> {out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
