import unittest, tempfile, json
from datetime import date, datetime, timezone
from pathlib import Path
from unittest import mock
from fichaje import logs, pipeline, store, timeutil

TZ = timeutil.TZ_DEFECTO

def _linea_evento(ts_iso, cliente="100-montaditos", sid="s1"):
    return json.dumps({
        "type": "assistant", "timestamp": ts_iso, "sessionId": sid,
        "message": {"content": [{"type": "tool_use", "name": "Read",
            "input": {"file_path": f"c:/x/clients/projects/{cliente}/a.ts"}}]}}) + "\n"

class TestPipeline(unittest.TestCase):
    def test_reporte_desde_log_sintetico(self):
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            (proj / "s1.jsonl").write_text(_linea_evento("2026-08-03T08:00:00.000Z"), encoding="utf-8")
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=Path(d)/"fichaje.json", config_path=None,
                desde=date(2026,8,3), hasta=date(2026,8,3))
            self.assertGreaterEqual(rep.jornada_min, 1)

    def test_ventana_fichada_fuera_de_rango_no_aparece(self):
        # CRITICAL 1: un fichaje fuera de [desde, hasta] no debe entrar en el informe.
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            store_path = Path(d) / "fichaje.json"
            s = store.Store(store_path)
            s.entrada(datetime(2026, 8, 1, 9, 0, tzinfo=TZ))
            s.salida(datetime(2026, 8, 1, 10, 0, tzinfo=TZ))
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=store_path, config_path=None,
                desde=date(2026, 8, 3), hasta=date(2026, 8, 3))
            self.assertEqual(rep.jornada_min, 0)

    def test_ventana_fichada_se_recorta_al_rango(self):
        # CRITICAL 1: una ventana que cruza el borde del rango se recorta, no se descarta entera.
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            store_path = Path(d) / "fichaje.json"
            s = store.Store(store_path)
            s.entrada(datetime(2026, 8, 2, 23, 0, tzinfo=TZ))   # dia anterior
            s.salida(datetime(2026, 8, 3, 1, 0, tzinfo=TZ))     # cruza medianoche
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=store_path, config_path=None,
                desde=date(2026, 8, 3), hasta=date(2026, 8, 3))
            self.assertEqual(rep.jornada_min, 60)  # solo cuenta 00:00-01:00 del dia 3

    def test_tarifa_defecto_de_config_llega_al_importe(self):
        # B: cfg.tarifa_defecto_eur_h debe cablearse hasta report.facturar cuando el
        # cliente no tiene tarifa especifica en cfg.clientes.
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            (proj / "s1.jsonl").write_text(_linea_evento("2026-08-03T08:00:00.000Z"), encoding="utf-8")
            cfg_path = Path(d) / "fichaje.config.json"
            cfg_path.write_text(json.dumps({
                "umbral_inactividad_min": 25, "tz": "+02:00",
                "tarifa_defecto_eur_h": 35, "clientes": {}}), encoding="utf-8")
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=Path(d)/"fichaje.json", config_path=cfg_path,
                desde=date(2026,8,3), hasta=date(2026,8,3))
            tc = [x for x in rep.totales if x.cliente == "100-montaditos"][0]
            self.assertIsNotNone(tc.importe)
            self.assertAlmostEqual(tc.importe, round(tc.minutos / 60 * 35, 2))

    def test_history_extiende_el_rango_hacia_atras(self):
        # B: 1 evento en agosto (projects_dir) + 1 prompt en marzo (history.jsonl), sin
        # filtro de fechas -> rep.rango[0] cae en marzo y por_dia incluye el dia de marzo.
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            (proj / "s1.jsonl").write_text(_linea_evento("2026-08-03T08:00:00.000Z"), encoding="utf-8")
            history_path = Path(d) / "history.jsonl"
            ts_marzo = int(datetime(2026, 3, 5, 10, 0, tzinfo=timezone.utc).timestamp() * 1000)
            history_path.write_text(json.dumps({
                "display": "prompt antiguo", "timestamp": ts_marzo, "sessionId": "hist1"}) + "\n",
                encoding="utf-8")
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=Path(d)/"fichaje.json", config_path=None,
                desde=None, hasta=None, history_path=history_path)
            self.assertLess(rep.rango[0].date(), date(2026, 8, 1))
            self.assertTrue(any(pd["fecha"].startswith("2026-03") for pd in rep.por_dia))

    def test_sin_history_path_no_cambia_el_comportamiento(self):
        # history_path=None (por defecto) no debe tocar nada fuera de projects_dir.
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            (proj / "s1.jsonl").write_text(_linea_evento("2026-08-03T08:00:00.000Z"), encoding="utf-8")
            rep, reg = pipeline.construir_reporte(
                repo_root=Path(d), projects_dir=proj,
                store_path=Path(d)/"fichaje.json", config_path=None,
                desde=date(2026, 8, 3), hasta=date(2026, 8, 3))
            self.assertGreaterEqual(rep.rango[0].date(), date(2026, 8, 3))

    def test_usa_cache_para_no_reparsear_log(self):
        # IMPORTANT 3: la segunda llamada no debe volver a parsear el .jsonl (cache hit).
        with tempfile.TemporaryDirectory() as d:
            proj = Path(d) / "projects"; proj.mkdir()
            (proj / "s1.jsonl").write_text(_linea_evento("2026-08-03T08:00:00.000Z"), encoding="utf-8")
            store_path = Path(d) / "data" / "fichaje.json"
            with mock.patch("fichaje.logs.eventos_de_fichero", wraps=logs.eventos_de_fichero) as spy:
                pipeline.construir_reporte(repo_root=Path(d), projects_dir=proj,
                                           store_path=store_path, config_path=None,
                                           desde=date(2026, 8, 3), hasta=date(2026, 8, 3))
                pipeline.construir_reporte(repo_root=Path(d), projects_dir=proj,
                                           store_path=store_path, config_path=None,
                                           desde=date(2026, 8, 3), hasta=date(2026, 8, 3))
                self.assertEqual(spy.call_count, 1)  # 2a llamada sirvio desde cache
            self.assertTrue((store_path.parent / "cache").is_dir())

if __name__ == "__main__":
    unittest.main()
