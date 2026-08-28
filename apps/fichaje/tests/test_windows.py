import unittest
from datetime import date, datetime
from fichaje import windows, timeutil
from fichaje.models import Evento, Ventana
from tests.fixtures import ev

TZ = timeutil.TZ_DEFECTO
def t(h, m=0): return datetime(2026, 8, 3, h, m, tzinfo=TZ)

class TestWindows(unittest.TestCase):
    def test_estimado_agrupa_por_umbral(self):
        evs = [ev("10:00", "100-montaditos"), ev("10:10", "100-montaditos"),
               ev("12:00", "salon-os")]  # hueco de 1h50 -> 2 ventanas
        vs = windows.ventanas_estimado(evs, cubierto=[], umbral_min=25)
        self.assertEqual(len(vs), 2)
        self.assertTrue(all(v.origen == "estimado" for v in vs))

    def test_fichado_recorta_estimado(self):
        evs = [ev("10:00", "100-montaditos"), ev("10:30", "100-montaditos")]
        cub = [Ventana(t(10, 10), t(10, 20), "fichado")]
        vs = windows.ventanas_estimado(evs, cubierto=cub, umbral_min=25)
        for v in vs:  # ningun estimado solapa 10:10-10:20
            self.assertFalse(v.inicio < t(10, 20) and v.fin > t(10, 10))

    def test_combinar_ordena(self):
        f = [Ventana(t(16), t(17), "fichado")]
        e = [Ventana(t(10), t(11), "estimado")]
        out = windows.combinar(f, [], e)
        self.assertEqual([v.origen for v in out], ["estimado", "fichado"])

    def test_presencia_span_diario_ignora_huecos_intermedios(self):
        # Un dia con eventos a las 10:00 y 22:00 -> ventana 10:00-22:00 completa,
        # ignorando el hueco intermedio (a diferencia del modo conservador).
        evs = [ev("10:00"), ev("14:00"), ev("22:00")]
        vs = windows.ventanas_estimado(evs, cubierto=[], umbral_min=25, modo="presencia")
        self.assertEqual(len(vs), 1)
        self.assertEqual(vs[0].inicio, t(10))
        self.assertEqual(vs[0].fin, t(22))
        self.assertEqual(vs[0].origen, "estimado")

    def test_presencia_dos_dias_da_dos_ventanas(self):
        evs = [ev("10:00"), ev("11:00"),
               Evento(ts=datetime(2026, 8, 4, 9, 0, tzinfo=TZ), session_id="s1", rutas=())]
        vs = windows.ventanas_estimado(evs, cubierto=[], umbral_min=25, modo="presencia")
        self.assertEqual(len(vs), 2)
        fechas = sorted(v.inicio.date() for v in vs)
        self.assertEqual(fechas, [date(2026, 8, 3), date(2026, 8, 4)])

    def test_presencia_respeta_cubierto(self):
        evs = [ev("10:00"), ev("22:00")]
        cub = [Ventana(t(14), t(15), "fichado")]
        vs = windows.ventanas_estimado(evs, cubierto=cub, umbral_min=25, modo="presencia")
        for v in vs:  # ningun estimado solapa 14:00-15:00 (recortado por lo fichado)
            self.assertFalse(v.inicio < t(15) and v.fin > t(14))
        total = sum((v.fin - v.inicio).total_seconds() for v in vs)
        esperado = (t(22) - t(10)).total_seconds() - (t(15) - t(14)).total_seconds()
        self.assertAlmostEqual(total, esperado)

    def test_modo_por_defecto_sigue_siendo_conservador(self):
        evs = [ev("10:00", "100-montaditos"), ev("10:10", "100-montaditos"),
               ev("12:00", "salon-os")]  # hueco de 1h50 -> 2 ventanas en conservador
        vs = windows.ventanas_estimado(evs, cubierto=[], umbral_min=25)
        self.assertEqual(len(vs), 2)

if __name__ == "__main__":
    unittest.main()
