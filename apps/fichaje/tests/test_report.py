import unittest, tempfile, csv
from datetime import datetime
from pathlib import Path
from fichaje import report, clients, timeutil
from fichaje.models import Ventana, ActividadCliente

TZ = timeutil.TZ_DEFECTO
REG = clients.ClientRegistry(slugs=["100-montaditos", "salon-os"],
                             nombres={"100-montaditos": "100 Montaditos"})
def t(h, m=0): return datetime(2026, 8, 3, h, m, tzinfo=TZ)

class TestReport(unittest.TestCase):
    def test_jornada_union_sin_doble_conteo(self):
        v = [Ventana(t(10), t(11), "fichado")]  # 60 min
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 30), "s1"),
                ActividadCliente("salon-os", t(10), t(10, 30), "s2")]  # solape 30 min
        rep = report.facturar(v, acts, REG, {}, TZ)
        self.assertEqual(rep.jornada_min, 60)                 # union
        self.assertGreater(rep.facturable_min, 60)            # solape suma > jornada
        por = {tc.cliente: tc.minutos for tc in rep.totales}
        self.assertEqual(por["100-montaditos"], por["salon-os"])  # simetrico

    def test_arrastre_rellena_hueco(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 5), "s1")]  # solo 5 min activos
        rep = report.facturar(v, acts, REG, {}, TZ)
        por = {tc.cliente: tc.minutos for tc in rep.totales}
        self.assertEqual(por["100-montaditos"], 60)  # arrastre cubre toda la ventana

    def test_importe_con_tarifa(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(11), "s1")]
        rep = report.facturar(v, acts, REG, {"100-montaditos": {"tarifa_eur_h": 60}}, TZ)
        tc = [x for x in rep.totales if x.cliente == "100-montaditos"][0]
        self.assertAlmostEqual(tc.importe, 60.0)  # 1h * 60

    def test_csv_export(self):
        v = [Ventana(t(10), t(10, 30), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 30), "s1")]
        rep = report.facturar(v, acts, REG, {}, TZ)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "out.csv"
            report.exportar_csv(rep, p)
            filas = list(csv.DictReader(p.open(encoding="utf-8")))
            self.assertEqual(filas[0]["cliente"], "100-montaditos")
            self.assertIn("minutos", filas[0])

if __name__ == "__main__":
    unittest.main()
