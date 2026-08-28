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

    def test_importe_con_tarifa_defecto_sin_tarifa_por_cliente(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("cliente-sin-tarifa", t(10), t(11), "s1")]
        rep = report.facturar(v, acts, REG, {}, TZ, tarifa_defecto=35)
        tc = [x for x in rep.totales if x.cliente == "cliente-sin-tarifa"][0]
        self.assertAlmostEqual(tc.importe, 35.0)  # 1h * 35 (tarifa defecto, sin tarifa por cliente)

    def test_tarifa_por_cliente_tiene_prioridad_sobre_defecto(self):
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("100-montaditos", t(10), t(11), "s1")]
        rep = report.facturar(v, acts, REG, {"100-montaditos": {"tarifa_eur_h": 60}}, TZ, tarifa_defecto=35)
        tc = [x for x in rep.totales if x.cliente == "100-montaditos"][0]
        self.assertAlmostEqual(tc.importe, 60.0)  # tarifa especifica gana sobre el defecto

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

    def test_por_dia_agrupa_por_fecha_local_cruzando_medianoche(self):
        # C: ventana 23:00 (dia 3) -> 01:00 (dia 4) cruza medianoche en tz local.
        # por_dia debe tener 2 entradas, con jornada_min y clientes correctos por dia,
        # y la suma de jornada_min de por_dia debe igualar rep.jornada_min.
        ini = datetime(2026, 8, 3, 23, 0, tzinfo=TZ)
        fin = datetime(2026, 8, 4, 1, 0, tzinfo=TZ)
        v = [Ventana(ini, fin, "fichado")]
        acts = [ActividadCliente("100-montaditos", ini, fin, "s1")]
        rep = report.facturar(v, acts, REG, {}, TZ)
        self.assertEqual(len(rep.por_dia), 2)
        por_fecha = {d["fecha"]: d for d in rep.por_dia}
        self.assertEqual(list(por_fecha.keys()), sorted(por_fecha.keys()))  # lista ordenada
        self.assertIn("2026-08-03", por_fecha)
        self.assertIn("2026-08-04", por_fecha)
        self.assertEqual(por_fecha["2026-08-03"]["jornada_min"], 60)   # 23:00-24:00
        self.assertEqual(por_fecha["2026-08-04"]["jornada_min"], 60)   # 00:00-01:00
        self.assertEqual(por_fecha["2026-08-03"]["clientes"]["100-montaditos"], 60)
        self.assertEqual(por_fecha["2026-08-04"]["clientes"]["100-montaditos"], 60)
        self.assertEqual(sum(d["jornada_min"] for d in rep.por_dia), rep.jornada_min)

    def test_actividad_instantanea_no_desaparece_junto_a_otra(self):
        # CRITICAL (re-review): un run de un solo evento (inicio==fin, sesion s1, cliente
        # "a") no debe perderse cuando otra actividad ("b", sesion s2) ya ocupa ese mismo
        # minuto en acts_min. El rango exclusivo [inicio,fin) de una actividad degenerada
        # da range(m,m) vacio; si ese hueco no se acolcha a minimo 1 minuto, "a" desaparece
        # en silencio de totales/facturable_min porque _arrastre no se dispara (el minuto
        # ya esta "ocupado" por "b").
        v = [Ventana(t(10), t(11), "fichado")]
        acts = [ActividadCliente("a", t(10), t(10), "s1"),        # evento unico, instantaneo
                ActividadCliente("b", t(10), t(10, 5), "s2")]      # 5 min activos
        rep = report.facturar(v, acts, REG, {}, TZ)
        por = {tc.cliente: tc.minutos for tc in rep.totales}
        self.assertIn("a", por)
        self.assertGreaterEqual(por["a"], 1)
        self.assertIn("b", por)

if __name__ == "__main__":
    unittest.main()
