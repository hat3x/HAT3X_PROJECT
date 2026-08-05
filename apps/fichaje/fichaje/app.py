from datetime import datetime
from pathlib import Path
from . import pipeline, dashboard, timeutil
from .store import Store, FichajeError

class Api:
    def __init__(self, repo_root, projects_dir, store_path, config_path):
        self.repo_root = Path(repo_root); self.projects_dir = Path(projects_dir)
        self.store_path = Path(store_path); self.config_path = config_path
        self.tz = timeutil.TZ_DEFECTO

    def entrada(self, cliente=None):
        try:
            Store(self.store_path).entrada(datetime.now(self.tz), cliente); return {"ok": True}
        except FichajeError as e:
            return {"ok": False, "error": str(e)}

    def salida(self):
        try:
            Store(self.store_path).salida(datetime.now(self.tz)); return {"ok": True}
        except FichajeError as e:
            return {"ok": False, "error": str(e)}

    def estado(self):
        return {"abierto": Store(self.store_path).abierto}

    def datos(self, desde=None, hasta=None):
        rep, reg = pipeline.construir_reporte(self.repo_root, self.projects_dir,
                                              self.store_path, self.config_path, desde, hasta)
        return dashboard.datos_json(rep, reg)

def lanzar():
    import webview  # perezoso: solo al abrir la ventana
    root = Path(__file__).resolve().parents[2]  # .../HAT3X
    api = Api(root,
              Path.home()/".claude"/"projects"/"c--Users-josem-Desktop-HAT3X-CLAUDE-HAT3X",
              root/"apps"/"fichaje"/"data"/"fichaje.json",
              root/"apps"/"fichaje"/"fichaje.config.json")
    rep, reg = pipeline.construir_reporte(api.repo_root, api.projects_dir,
                                          api.store_path, api.config_path, None, None)
    html = dashboard.render_html(rep, reg)
    webview.create_window("HAT3X Fichaje", html=html, js_api=api, width=1100, height=800)
    webview.start()

if __name__ == "__main__":
    lanzar()
