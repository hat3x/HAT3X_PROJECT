import unittest, tempfile, io, os, contextlib
from pathlib import Path
from fichaje import cli
from fichaje.store import Store

class TestCli(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.root = Path(self.d.name)
        (self.root / "apps" / "fichaje" / "data").mkdir(parents=True)
        (self.root / "clients" / "projects" / "100-montaditos").mkdir(parents=True)
        self._cwd = os.getcwd()
        os.chdir(self.root)

    def tearDown(self):
        os.chdir(self._cwd)
        self.d.cleanup()

    def _run(self, *args):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code = cli.main(list(args))
        return code, buf.getvalue()

    def test_entrada_dos_veces_no_revienta(self):
        # IMPORTANT 5: la segunda 'entrada' debe capturar FichajeError, no propagarla.
        code, _ = self._run("entrada")
        self.assertEqual(code, 0)
        code, out = self._run("entrada")
        self.assertEqual(code, 1)
        self.assertIn("Ya hay una jornada abierta", out)

    def test_estado_sin_jornada(self):
        code, out = self._run("estado")
        self.assertEqual(code, 0)
        self.assertIn("Sin jornada abierta", out)

    def test_estado_muestra_jornada_abierta(self):
        self._run("entrada", "--cliente", "100-montaditos")
        code, out = self._run("estado")
        self.assertEqual(code, 0)
        self.assertIn("ABIERTA", out)
        self.assertIn("100-montaditos", out)

    def test_clientes_lista_slugs(self):
        code, out = self._run("clientes")
        self.assertEqual(code, 0)
        self.assertIn("100-montaditos", out)

    def test_add_crea_bloque_manual(self):
        code, out = self._run("add", "--cliente", "100-montaditos",
                               "--de", "16:00", "--a", "17:30", "--fecha", "2026-08-01")
        self.assertEqual(code, 0)
        s = Store(self.root / "apps" / "fichaje" / "data" / "fichaje.json")
        vs = s.ventanas_manual()
        self.assertEqual(len(vs), 1)
        self.assertEqual(vs[0].cliente_principal, "100-montaditos")
        self.assertEqual(vs[0].inicio.hour, 16)
        self.assertEqual(vs[0].inicio.date().isoformat(), "2026-08-01")

    def test_add_usa_hoy_por_defecto(self):
        from datetime import datetime, timezone, timedelta
        code, _ = self._run("add", "--cliente", "100-montaditos", "--de", "09:00", "--a", "10:00")
        self.assertEqual(code, 0)
        s = Store(self.root / "apps" / "fichaje" / "data" / "fichaje.json")
        vs = s.ventanas_manual()
        hoy = datetime.now(timezone(timedelta(hours=2))).date()
        self.assertEqual(vs[0].inicio.date(), hoy)

    def test_add_cruza_medianoche_no_se_descarta(self):
        # IMPORTANT (re-review): --de 22:00 --a 02:00 es trabajo nocturno legitimo;
        # antes del fix se guardaba con fin <= inicio y pipeline lo descartaba en silencio.
        code, out = self._run("add", "--cliente", "100-montaditos",
                               "--de", "22:00", "--a", "02:00", "--fecha", "2026-08-01")
        self.assertEqual(code, 0)
        s = Store(self.root / "apps" / "fichaje" / "data" / "fichaje.json")
        vs = s.ventanas_manual()
        self.assertEqual(len(vs), 1)
        self.assertGreater(vs[0].fin, vs[0].inicio)
        self.assertEqual(vs[0].inicio.date().isoformat(), "2026-08-01")
        self.assertEqual(vs[0].fin.date().isoformat(), "2026-08-02")
        self.assertEqual(vs[0].fin.hour, 2)

    def test_resolver_rango_manual_suma_un_dia_si_a_no_es_posterior(self):
        # Unidad: la funcion que resuelve el rango debe garantizar fin > inicio.
        from datetime import date as ddate
        from fichaje import timeutil
        tz = timeutil.TZ_DEFECTO
        fecha = ddate(2026, 8, 1)
        de, a = cli._resolver_rango_manual(fecha, "22:00", "02:00", tz)
        self.assertGreater(a, de)
        self.assertEqual(a.date().isoformat(), "2026-08-02")
        # caso normal (mismo dia) no debe alterarse
        de2, a2 = cli._resolver_rango_manual(fecha, "16:00", "17:30", tz)
        self.assertEqual(a2.date().isoformat(), "2026-08-01")

    def test_paths_incluye_history_path_por_defecto(self):
        # C: el pipeline del CLI debe apuntar por defecto a ~/.claude/history.jsonl
        # para extender el estimado hacia atras con logs.eventos_de_history.
        paths = cli._paths(self.root)
        self.assertEqual(paths["history_path"], Path.home() / ".claude" / "history.jsonl")

if __name__ == "__main__":
    unittest.main()
