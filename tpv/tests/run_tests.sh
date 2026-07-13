#!/usr/bin/env bash
# ============================================================================
# TPV · Runner de la suite completa de pruebas (sub-8)
# ----------------------------------------------------------------------------
# Ejecuta, en orden:
#   1. Unitarias del núcleo (tpv/shared/*_test.ts) — cálculo puro, sin red.
#   2. Unitarias de bordes + integración + e2e (tpv/tests/*_test.ts) — usan el
#      stub de Supabase (import_map.test.json), sin red ni base de datos.
#   3. Tests SQL de RLS / integración / aditividad (db/tests/*.sql) — SÓLO si
#      hay DATABASE_URL exportada y psql disponible.
#
# Uso (desde la raíz del repo o desde tpv/tests):
#   ./tpv/tests/run_tests.sh                 # deno + (sql si hay DATABASE_URL)
#   DATABASE_URL=postgres://... ./tpv/tests/run_tests.sh
#
# Requisitos: deno >= 1.45 (para --import-map y jsr:). psql para los .sql.
# Códigos de salida: 0 = todo verde; !=0 = algún test falló.
# ============================================================================
set -euo pipefail

# Raíz del repo (este script vive en tpv/tests/).
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$RAIZ"

echo "==> [1/3] Unitarias del núcleo TPV (tpv/shared)"
deno test --allow-none tpv/shared/

echo "==> [2/3] Bordes + integración + e2e (tpv/tests, stub de Supabase)"
deno test --allow-none --import-map=tpv/tests/import_map.test.json tpv/tests/

if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  echo "==> [3/3] Tests SQL (RLS / integración / aditividad) contra \$DATABASE_URL"
  for f in \
    db/tests/rls_tpv_isolation_test.sql \
    db/tests/rls_tpv_config_facturacion_test.sql \
    db/tests/tpv_reservas_integracion_test.sql \
    db/tests/tpv_aditividad_regresion_test.sql
  do
    echo "    · $f"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  done
else
  echo "==> [3/3] Tests SQL OMITIDOS (define DATABASE_URL y ten psql para ejecutarlos)."
fi

echo "==> Suite TPV completada."
