import unittest, tempfile
from pathlib import Path
from fichaje import app

class TestApi(unittest.TestCase):
    def test_entrada_y_datos_no_lanzan(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            api = app.Api(repo_root=Path(d), projects_dir=proj,
                          store_path=Path(d)/"fichaje.json", config_path=None)
            r = api.entrada("100-montaditos")
            self.assertTrue(r["ok"])
            self.assertIsNotNone(api.estado()["abierto"])
            self.assertIn("jornada_min", api.datos())

if __name__ == "__main__":
    unittest.main()
