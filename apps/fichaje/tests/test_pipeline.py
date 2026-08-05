import unittest, tempfile, json
from datetime import date
from pathlib import Path
from fichaje import pipeline

class TestPipeline(unittest.TestCase):
    def test_reporte_desde_log_sintetico(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            linea = json.dumps({
                "type":"assistant","timestamp":"2026-08-03T08:00:00.000Z","sessionId":"s1",
                "message":{"content":[{"type":"tool_use","name":"Read",
                    "input":{"file_path":"c:/x/clients/projects/100-montaditos/a.ts"}}]}}) + "\n"
            (proj / "s1.jsonl").write_text(linea, encoding="utf-8")
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=Path(d)/"fichaje.json", config_path=None,
                desde=date(2026,8,3), hasta=date(2026,8,3))
            self.assertGreaterEqual(rep.jornada_min, 1)

if __name__ == "__main__":
    unittest.main()
