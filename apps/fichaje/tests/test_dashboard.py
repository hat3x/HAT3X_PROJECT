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

    def test_datos_json_incluye_por_dia_y_importe_total(self):
        # D: sin tarifa configurada, importe_total debe ser None (nada que sumar);
        # por_dia debe venir tal cual desde rep.por_dia (lista de dicts JSON-serializable).
        d = dashboard.datos_json(self._rep(), REG)
        self.assertIn("por_dia", d)
        self.assertIsInstance(d["por_dia"], list)
        self.assertTrue(len(d["por_dia"]) >= 1)
        self.assertEqual(d["por_dia"][0]["fecha"], "2026-08-03")
        self.assertIn("importe_total", d)
        self.assertIsNone(d["importe_total"])

    def test_datos_json_importe_total_suma_importes_no_nulos(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(11), "s1")]
        rep = report.facturar(v, acts, REG, {"100-montaditos": {"tarifa_eur_h": 60}}, TZ)
        d = dashboard.datos_json(rep, REG)
        self.assertEqual(d["importe_total"], 60.0)

    def test_html_incluye_seccion_historico_y_card_importe(self):
        html = dashboard.render_html(self._rep(), REG)
        self.assertIn("historico", html)
        self.assertIn("card-importe", html)

if __name__ == "__main__":
    unittest.main()
