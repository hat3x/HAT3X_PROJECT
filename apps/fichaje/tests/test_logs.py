import json, tempfile, unittest
from datetime import datetime, timezone
from pathlib import Path
from fichaje import logs, timeutil

TZ = timeutil.TZ_DEFECTO

def _epoch_ms(y, m, d, h, mi):
    return int(datetime(y, m, d, h, mi, tzinfo=timezone.utc).timestamp() * 1000)

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

    def test_eventos_de_history_entradas_validas(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.jsonl"
            ts1 = _epoch_ms(2026, 3, 5, 10, 0)   # 10:00Z -> 12:00 +02
            ts2 = _epoch_ms(2026, 3, 6, 9, 30)
            lineas = [
                json.dumps({"display": "prompt 1", "project": "x", "timestamp": ts1, "sessionId": "s1"}),
                json.dumps({"display": "prompt 2", "project": "y", "timestamp": ts2, "sessionId": "s2"}),
            ]
            p.write_text("\n".join(lineas) + "\n", encoding="utf-8")
            evs = logs.eventos_de_history(p, TZ)
            self.assertEqual(len(evs), 2)
            self.assertEqual(evs[0].session_id, "s1")
            self.assertEqual(evs[0].rutas, ())
            self.assertEqual(evs[0].ts.hour, 12)  # 10:00Z -> 12:00 +02
            self.assertEqual(evs[0].ts.month, 3)
            self.assertEqual(evs[1].session_id, "s2")

    def test_eventos_de_history_salta_corruptas_y_sin_timestamp(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.jsonl"
            ts_ok = _epoch_ms(2026, 3, 5, 10, 0)
            lineas = [
                "{esto no es json",
                json.dumps({"display": "sin timestamp", "sessionId": "s3"}),
                json.dumps({"display": "ok", "timestamp": ts_ok, "sessionId": "s4"}),
            ]
            p.write_text("\n".join(lineas) + "\n", encoding="utf-8")
            evs = logs.eventos_de_history(p, TZ)
            self.assertEqual(len(evs), 1)
            self.assertEqual(evs[0].session_id, "s4")

    def test_eventos_de_history_sin_session_id_cae_a_history(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "history.jsonl"
            ts_ok = _epoch_ms(2026, 3, 5, 10, 0)
            p.write_text(json.dumps({"display": "ok", "timestamp": ts_ok}) + "\n", encoding="utf-8")
            evs = logs.eventos_de_history(p, TZ)
            self.assertEqual(evs[0].session_id, "history")

    def test_eventos_de_history_fichero_inexistente(self):
        evs = logs.eventos_de_history(Path("no-existe") / "history.jsonl", TZ)
        self.assertEqual(evs, [])

if __name__ == "__main__":
    unittest.main()
