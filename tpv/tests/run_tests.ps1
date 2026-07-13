# ============================================================================
# TPV · Runner de la suite completa de pruebas (sub-8) — PowerShell (Windows)
# ----------------------------------------------------------------------------
# Equivalente a run_tests.sh para el entorno de desarrollo Windows.
# Ejecuta:
#   1. Unitarias del núcleo (tpv/shared/*_test.ts).
#   2. Bordes + integración + e2e (tpv/tests/*_test.ts) con el stub de Supabase.
#   3. Tests SQL (db/tests/*.sql) SÓLO si $env:DATABASE_URL está definida y hay psql.
#
# Uso (desde la raíz del repo o desde tpv/tests):
#   ./tpv/tests/run_tests.ps1
#   $env:DATABASE_URL = 'postgres://...'; ./tpv/tests/run_tests.ps1
#
# Requisitos: deno >= 1.45. psql para los .sql. Sale con código !=0 si algo falla.
# ============================================================================
$ErrorActionPreference = 'Stop'

$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Resolve-Path (Join-Path $aqui '..\..')
Set-Location $raiz

Write-Host '==> [1/3] Unitarias del núcleo TPV (tpv/shared)'
deno test --allow-none tpv/shared/
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host '==> [2/3] Bordes + integración + e2e (tpv/tests, stub de Supabase)'
deno test --allow-none --import-map=tpv/tests/import_map.test.json tpv/tests/
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$dbUrl = $env:DATABASE_URL
$tienePsql = [bool](Get-Command psql -ErrorAction SilentlyContinue)
if ($dbUrl -and $tienePsql) {
  Write-Host '==> [3/3] Tests SQL (RLS / integración / aditividad) contra $env:DATABASE_URL'
  $sqls = @(
    'db/tests/rls_tpv_isolation_test.sql',
    'db/tests/rls_tpv_config_facturacion_test.sql',
    'db/tests/tpv_reservas_integracion_test.sql',
    'db/tests/tpv_aditividad_regresion_test.sql'
  )
  foreach ($f in $sqls) {
    Write-Host "    · $f"
    psql $dbUrl -v ON_ERROR_STOP=1 -q -f $f
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
} else {
  Write-Host '==> [3/3] Tests SQL OMITIDOS (define $env:DATABASE_URL y ten psql para ejecutarlos).'
}

Write-Host '==> Suite TPV completada.'
