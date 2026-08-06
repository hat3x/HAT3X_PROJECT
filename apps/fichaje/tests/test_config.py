import json, tempfile, unittest
from pathlib import Path
from fichaje import config

class TestConfig(unittest.TestCase):
    def test_defaults_cuando_no_hay_fichero(self):
        c = config.cargar(None)
        self.assertEqual(c.umbral_inactividad_min, 25)
        self.assertEqual(c.tz.utcoffset(None).total_seconds(), 2 * 3600)
        self.assertEqual(c.clientes, {})

    def test_lee_umbral_y_clientes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cfg.json"
            p.write_text(json.dumps({
                "umbral_inactividad_min": 30,
                "tz": "+02:00",
                "clientes": {"100-montaditos": {"nombre": "100 Montaditos", "tarifa_eur_h": 50}},
            }), encoding="utf-8")
            c = config.cargar(p)
            self.assertEqual(c.umbral_inactividad_min, 30)
            self.assertEqual(c.clientes["100-montaditos"]["tarifa_eur_h"], 50)

    def test_tarifa_defecto_ausente_es_none(self):
        c = config.cargar(None)
        self.assertIsNone(c.tarifa_defecto_eur_h)

    def test_tarifa_defecto_presente(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cfg.json"
            p.write_text(json.dumps({"tarifa_defecto_eur_h": 35}), encoding="utf-8")
            c = config.cargar(p)
            self.assertEqual(c.tarifa_defecto_eur_h, 35)

if __name__ == "__main__":
    unittest.main()
