import argparse, sys, webbrowser
from datetime import datetime, date
from pathlib import Path
from . import pipeline, dashboard, report, timeutil
from .store import Store, FichajeError

def _paths(root):
    root = Path(root)
    return dict(repo_root=root,
                projects_dir=Path.home()/".claude"/"projects"/"c--Users-josem-Desktop-HAT3X-CLAUDE-HAT3X",
                store_path=root/"apps"/"fichaje"/"data"/"fichaje.json",
                config_path=root/"apps"/"fichaje"/"fichaje.config.json")

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    ap = argparse.ArgumentParser(prog="fichaje")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("entrada").add_argument("--cliente")
    sub.add_parser("salida")
    inf = sub.add_parser("informe")
    inf.add_argument("--desde"); inf.add_argument("--hasta"); inf.add_argument("--csv")
    sub.add_parser("dashboard")
    a = ap.parse_args(argv)
    P = _paths(Path.cwd())
    tz = timeutil.TZ_DEFECTO
    if a.cmd == "entrada":
        Store(P["store_path"]).entrada(datetime.now(tz), getattr(a, "cliente", None))
        print("Entrada fichada."); return 0
    if a.cmd == "salida":
        try:
            Store(P["store_path"]).salida(datetime.now(tz)); print("Salida fichada.")
        except FichajeError as e:
            print(e); return 1
        return 0
    desde = date.fromisoformat(a.desde) if getattr(a, "desde", None) else None
    hasta = date.fromisoformat(a.hasta) if getattr(a, "hasta", None) else None
    rep, reg = pipeline.construir_reporte(P["repo_root"], P["projects_dir"], P["store_path"],
                                          P["config_path"], desde, hasta)
    if a.cmd == "informe":
        for tc in rep.totales:
            print(f"{reg.nombre(tc.cliente):24} {tc.minutos//60}h{tc.minutos%60:02d}")
        print(f"JORNADA REAL: {rep.jornada_min//60}h{rep.jornada_min%60:02d}")
        if a.csv:
            report.exportar_csv(rep, a.csv); print(f"CSV -> {a.csv}")
    if a.cmd == "dashboard":
        out = P["repo_root"]/"apps"/"fichaje"/"out"/"fichaje.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(dashboard.render_html(rep, reg), encoding="utf-8")
        webbrowser.open(out.as_uri()); print(f"Dashboard -> {out}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
