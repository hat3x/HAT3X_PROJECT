import unittest
from fichaje import attribution, clients
from tests.fixtures import ev

REG = clients.ClientRegistry(slugs=["100-montaditos", "salon-os"])

class TestAttribution(unittest.TestCase):
    def test_un_run_mismo_cliente(self):
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos"), ev("10:05", None), ev("10:10", "100-montaditos")],
            REG, umbral_min=25)
        self.assertEqual(len(acts), 1)
        self.assertEqual(acts[0].cliente, "100-montaditos")
        self.assertEqual(acts[0].inicio.hour, 10)

    def test_hueco_mayor_que_umbral_parte_intervalo(self):
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos"), ev("11:00", "100-montaditos")], REG, 25)
        self.assertEqual(len(acts), 2)

    def test_evento_sin_ruta_al_principio_es_interno(self):
        acts = attribution.intervalos_actividad([ev("10:00", None)], REG, 25)
        self.assertEqual(acts[0].cliente, clients.INTERNO)

    def test_sesiones_paralelas_generan_solape(self):
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos", "s1"), ev("10:01", "salon-os", "s2"),
             ev("10:10", "100-montaditos", "s1"), ev("10:11", "salon-os", "s2")], REG, 25)
        clientes = sorted({a.cliente for a in acts})
        self.assertEqual(clientes, ["100-montaditos", "salon-os"])

    def test_herencia_no_cruza_hueco_mayor_que_umbral(self):
        # IMPORTANT 9: tras un hueco > umbral el run se cierra; un evento sin ruta
        # despues del hueco no debe heredar el cliente de antes del hueco.
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos"), ev("11:00", None)], REG, 25)
        self.assertEqual(len(acts), 2)
        self.assertEqual(acts[0].cliente, "100-montaditos")
        self.assertEqual(acts[1].cliente, clients.INTERNO)

    def test_herencia_se_mantiene_dentro_del_mismo_run(self):
        # Control: sin hueco (gap <= umbral) la herencia si debe aplicarse.
        acts = attribution.intervalos_actividad(
            [ev("10:00", "100-montaditos"), ev("10:10", None)], REG, 25)
        self.assertEqual(len(acts), 1)
        self.assertEqual(acts[0].cliente, "100-montaditos")

if __name__ == "__main__":
    unittest.main()
