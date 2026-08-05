import unittest, tempfile
from datetime import datetime
from pathlib import Path
from fichaje import store, timeutil

TZ = timeutil.TZ_DEFECTO
def t(h, m=0): return datetime(2026, 8, 5, h, m, tzinfo=TZ)

class TestStore(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.s = store.Store(Path(self.d.name) / "fichaje.json")

    def tearDown(self):
        self.d.cleanup()

    def test_entrada_salida_crea_ventana(self):
        self.s.entrada(t(16), "100-montaditos")
        self.s.salida(t(19, 30))
        vs = self.s.ventanas_fichado()
        self.assertEqual(len(vs), 1)
        self.assertEqual(vs[0].origen, "fichado")
        self.assertEqual(vs[0].cliente_principal, "100-montaditos")

    def test_entrada_con_una_abierta_falla(self):
        self.s.entrada(t(16))
        with self.assertRaises(store.FichajeError):
            self.s.entrada(t(17))

    def test_salida_sin_entrada_falla(self):
        with self.assertRaises(store.FichajeError):
            self.s.salida(t(19))

    def test_persistencia_en_disco(self):
        self.s.entrada(t(16)); self.s.salida(t(17))
        s2 = store.Store(self.s.path)
        self.assertEqual(len(s2.ventanas_fichado()), 1)

    def test_add_manual(self):
        self.s.add_manual("salon-os", t(11), t(12, 30), "reunion")
        vs = self.s.ventanas_manual()
        self.assertEqual(vs[0].origen, "manual")
        self.assertEqual(vs[0].cliente_principal, "salon-os")

if __name__ == "__main__":
    unittest.main()
