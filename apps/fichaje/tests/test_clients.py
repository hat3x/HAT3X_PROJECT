import unittest
from fichaje import clients

class TestClients(unittest.TestCase):
    def setUp(self):
        self.reg = clients.ClientRegistry(
            slugs=["100-montaditos", "salon-os"],
            nombres={"100-montaditos": "100 Montaditos"},
        )

    def test_ruta_projects(self):
        r = r"c:\x\HAT3X\clients\projects\100-montaditos\app\src\a.ts"
        self.assertEqual(self.reg.cliente_de_ruta(r), "100-montaditos")

    def test_ruta_onboarding(self):
        r = "c:/x/HAT3X/clients/onboarding/clients/salon-os/2026-08/01.md"
        self.assertEqual(self.reg.cliente_de_ruta(r), "salon-os")

    def test_ruta_sin_cliente(self):
        self.assertIsNone(self.reg.cliente_de_ruta("c:/x/HAT3X/apps/command/src/server.ts"))

    def test_nombre_fallback_al_slug(self):
        self.assertEqual(self.reg.nombre("salon-os"), "salon-os")
        self.assertEqual(self.reg.nombre("100-montaditos"), "100 Montaditos")

if __name__ == "__main__":
    unittest.main()
