import json, unittest
from fichaje import logs, timeutil

TZ = timeutil.TZ_DEFECTO

class TestLogs(unittest.TestCase):
    def test_parse_linea_con_ruta(self):
        linea = json.dumps({
            "type": "assistant",
            "timestamp": "2026-08-03T12:00:00.000Z",
            "sessionId": "s1",
            "isSidechain": False,
            "message": {"content": [
                {"type": "tool_use", "name": "Read", "input": {"file_path": "c:/x/clients/projects/100-montaditos/a.ts"}}
            ]},
        }).encode()
        ev = logs.parse_linea(linea, TZ)
        self.assertEqual(ev.session_id, "s1")
        self.assertEqual(ev.ts.hour, 14)  # 12:00Z -> 14:00 +02
        self.assertIn("100-montaditos", ev.rutas[0])

    def test_parse_linea_prompt_usuario(self):
        linea = json.dumps({
            "type": "user", "timestamp": "2026-08-03T10:00:00.000Z", "sessionId": "s1",
            "message": {"content": "hola"},
        }).encode()
        ev = logs.parse_linea(linea, TZ)
        self.assertTrue(ev.hay_prompt_usuario)
        self.assertEqual(ev.rutas, ())

    def test_linea_corrupta_devuelve_none(self):
        self.assertIsNone(logs.parse_linea(b"{no es json", TZ))

if __name__ == "__main__":
    unittest.main()
