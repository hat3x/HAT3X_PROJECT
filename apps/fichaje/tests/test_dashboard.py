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

    def test_datos_json_incluye_clientes(self):
        # IMPORTANT 8: el JSON embebido debe traer la lista de slugs+nombres
        # para poblar el <select> de la barra de controles sin llamada aparte.
        d = dashboard.datos_json(self._rep(), REG)
        self.assertIn("clientes", d)
        self.assertTrue(any(c["slug"] == "100-montaditos" and c["nombre"] == "100 Montaditos"
                             for c in d["clientes"]))

    def test_html_embebe_json_parseable(self):
        html = dashboard.render_html(self._rep(), REG)
        self.assertIn("<!doctype html>", html.lower())
        m = re.search(r'id="datos"[^>]*>(.*?)</script>', html, re.S)
        self.assertIsNotNone(m)
        datos = json.loads(m.group(1))  # no lanza
        self.assertIn("clientes", datos)

    def test_html_incluye_barra_de_controles(self):
        html = dashboard.render_html(self._rep(), REG)
        for id_ in ("sel-cliente", "btn-entrada", "btn-salida", "btn-estado", "btn-refrescar"):
            self.assertIn(id_, html)

if __name__ == "__main__":
    unittest.main()
