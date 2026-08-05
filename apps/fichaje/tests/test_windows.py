import unittest
from datetime import datetime
from fichaje import windows, timeutil
from fichaje.models import Ventana
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

if __name__ == "__main__":
    unittest.main()
