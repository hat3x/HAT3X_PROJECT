import unittest, tempfile, json
from datetime import datetime, timezone
from pathlib import Path
from fichaje import app

class TestApi(unittest.TestCase):
    def test_entrada_y_datos_no_lanzan(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            # history_path explicito (inexistente) para no tocar el ~/.claude/history.jsonl
            # real de la maquina que ejecuta el test.
            api = app.Api(repo_root=Path(d), projects_dir=proj,
                          store_path=Path(d)/"fichaje.json", config_path=None,
                          history_path=Path(d)/"no-existe-history.jsonl")
            r = api.entrada("100-montaditos")
            self.assertTrue(r["ok"])
            self.assertIsNotNone(api.estado()["abierto"])
            self.assertIn("jornada_min", api.datos())

    def test_history_path_por_defecto_apunta_a_home(self):
        # C: si no se pasa history_path explicito, cae por defecto a
        # ~/.claude/history.jsonl (mismo criterio que projects_dir del CLI).
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            api = app.Api(repo_root=Path(d), projects_dir=proj,
                          store_path=Path(d)/"fichaje.json", config_path=None)
            self.assertEqual(api.history_path, Path.home() / ".claude" / "history.jsonl")

    def test_history_path_personalizado_se_usa_en_datos(self):
        # C: Api.datos() debe usar self.history_path al llamar al pipeline.
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            history_path = Path(d) / "history.jsonl"
            ts_marzo = int(datetime(2026, 3, 5, 10, 0, tzinfo=timezone.utc).timestamp() * 1000)
            history_path.write_text(json.dumps({
                "display": "prompt antiguo", "timestamp": ts_marzo, "sessionId": "h1"}) + "\n",
                encoding="utf-8")
            api = app.Api(repo_root=Path(d), projects_dir=proj,
                          store_path=Path(d)/"fichaje.json", config_path=None,
                          history_path=history_path)
            d_ = api.datos()
            self.assertTrue(any(pd["fecha"].startswith("2026-03") for pd in d_["por_dia"]))

if __name__ == "__main__":
    unittest.main()
