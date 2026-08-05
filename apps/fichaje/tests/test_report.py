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
            with p.open(encoding="utf-8") as f:
                filas = list(csv.DictReader(f))
            self.assertEqual(filas[0]["cliente"], "100-montaditos")
            self.assertIn("minutos", filas[0])

    def test_csv_export_bloques(self):
        v = [Ventana(t(10), t(10, 30), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 30), "s1")]
        rep = report.facturar(v, acts, REG, {}, TZ)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "bloques.csv"
            report.exportar_csv_bloques(rep, p)
            with p.open(encoding="utf-8") as f:
                filas = list(csv.DictReader(f))
            self.assertEqual(set(filas[0].keys()),
                             {"fecha", "cliente", "inicio", "fin", "minutos", "origen"})
            self.assertEqual(filas[0]["cliente"], "100-montaditos")
            self.assertEqual(filas[0]["fecha"], "2026-08-03")

    def test_frontera_entre_actividades_consecutivas_sin_doble_conteo(self):
        # CRITICAL 2: cliente A 10:00-10:30, cliente B 10:30-11:00; ventana 10:00-11:00.
        # El minuto 10:30 (frontera) debe contar solo para B, no para ambos.
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(10, 30), "s1"),
                ActividadCliente("salon-os", t(10, 30), t(11), "s2")]
        rep = report.facturar(v, acts, REG, {}, TZ)
        por = {tc.cliente: tc.minutos for tc in rep.totales}
        self.assertEqual(por["100-montaditos"], 30)
        self.assertEqual(por["salon-os"], 30)
        self.assertEqual(rep.jornada_min, 60)
        self.assertEqual(rep.facturable_min, 60)  # sin doble conteo en la frontera

if __name__ == "__main__":
    unittest.main()
