import unittest, json, re
from datetime import datetime
from fichaje import dashboard, report, clients, timeutil
from fichaje.models import Ventana, ActividadCliente

TZ = timeutil.TZ_DEFECTO
REG = clients.ClientRegistry(slugs=["100-montaditos"], nombres={"100-montaditos": "100 Montaditos"})
def t(h, m=0): return datetime(2026, 8, 3, h, m, tzinfo=TZ)

class TestDashboard(unittest.TestCase):
    def _rep(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(11), "s1")]
        return report.facturar(v, acts, REG, {}, TZ)

    def test_datos_json_tiene_totales(self):
        d = dashboard.datos_json(self._rep(), REG)
        self.assertEqual(d["jornada_min"], 60)
        self.assertTrue(any(c["cliente"] == "100-montaditos" for c in d["totales"]))

    def test_html_embebe_json_parseable(self):
        html = dashboard.render_html(self._rep(), REG)
        self.assertIn("<!doctype html>", html.lower())
        m = re.search(r'id="datos"[^>]*>(.*?)</script>', html, re.S)
        self.assertIsNotNone(m)
        json.loads(m.group(1))  # no lanza

if __name__ == "__main__":
    unittest.main()
