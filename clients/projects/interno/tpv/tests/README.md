# TPV — Suite de pruebas (sub-8)

Suite de calidad del módulo TPV: **unitarias** del cálculo (totales/IVA/descuentos),
**integración** de la API de cobros y facturación, **e2e** de los flujos
_cobro → pago → factura_ y _apertura → arqueo → cierre de caja_, más los tests
**SQL** de aislamiento **RLS multi-tenant** y de **aditividad/regresión** (la
agenda/reservas siguen intactas).

> No modifica ninguna lógica de sub-1…sub-7: sólo **añade** pruebas. Ejercita el
> código de dominio REAL (`tpv/shared` y `tpv/functions/_shared`) contra un doble
> en memoria, sin red ni base de datos para la capa TS.

## Qué se prueba y dónde

| Área (petición sub-8) | Archivos | Nivel |
|---|---|---|
| Unitarias de totales / IVA / descuentos | `tpv/shared/money_test.ts`, `unit_totales_iva_descuentos_test.ts` | Puro |
| Núcleo de caja y factura | `tpv/shared/caja_test.ts`, `tpv/shared/factura_test.ts` | Puro |
| **Integración API de cobros** | `integracion_cobros_test.ts` | Dominio + fake DB |
| **Integración facturación** | `integracion_facturacion_test.ts` | Dominio + fake DB |
| **E2E cobro → pago → factura** | `e2e_cobro_pago_factura_test.ts` | Flujo servidor |
| **E2E apertura → arqueo → cierre** | `e2e_apertura_arqueo_cierre_test.ts` | Flujo servidor |
| **RLS multi-tenant** | `db/tests/rls_tpv_isolation_test.sql` (7 tablas), `db/tests/rls_tpv_config_facturacion_test.sql` (config sub-6) | SQL (Postgres real) |
| Integración reservas | `db/tests/tpv_reservas_integracion_test.sql` | SQL |
| **Regresión agenda/reservas/ajustes** | `db/tests/tpv_aditividad_regresion_test.sql` | SQL |

### Piezas del arnés (no son tests)

- **`fakeSupabase.ts`** — doble en memoria del query-builder de `supabase-js`
  (`from/select/insert/update/delete/eq/in/order/single/maybeSingle`). Simula los
  invariantes que el dominio observa: numeración correlativa de ticket/factura y
  `UNIQUE(venta_id)` de factura. **No aplica RLS** (eso se prueba en SQL).
- **`stubs/supabase-js.ts`** + **`import_map.test.json`** — redirigen el
  especificador `@supabase/supabase-js` al stub para que la integración/e2e corra
  **offline** (sin descargar npm) y con tipado trivial.
- **`deno.json`** — config con el import map de tests y las tareas.

## Cómo ejecutarla

Requisitos: **Deno ≥ 1.45**. Para los SQL: **psql** y una `DATABASE_URL` con las
migraciones `tpv_*` (0001…0005) aplicadas.

### Todo de una vez (runner)

```bash
# Linux/macOS/CI
./tpv/tests/run_tests.sh
DATABASE_URL=postgres://user:pass@host/db ./tpv/tests/run_tests.sh
```

```powershell
# Windows (dev)
./tpv/tests/run_tests.ps1
$env:DATABASE_URL = 'postgres://user:pass@host/db'; ./tpv/tests/run_tests.ps1
```

Si no hay `DATABASE_URL`/`psql`, el runner ejecuta la capa TS y **omite** los SQL.

### Sólo la capa TypeScript (Deno)

```bash
# Núcleo puro (sin import map)
deno test tpv/shared/

# Bordes + integración + e2e (desde tpv/tests usa deno.json → import map)
cd tpv/tests && deno task test
# o, desde la raíz, explícitando el import map:
deno test --import-map=tpv/tests/import_map.test.json tpv/tests/
```

Cobertura (código financiero/negocio, objetivo 100 % en `shared/money.ts`,
`shared/caja.ts`, `shared/factura.ts`):

```bash
cd tpv/tests && deno task cov
```

### Sólo los SQL (Postgres real)

```bash
for f in db/tests/rls_tpv_isolation_test.sql \
         db/tests/rls_tpv_config_facturacion_test.sql \
         db/tests/tpv_reservas_integracion_test.sql \
         db/tests/tpv_aditividad_regresion_test.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Cada `.sql` corre en una transacción con `ROLLBACK` final: **no deja rastro**.
`ON_ERROR_STOP=1` → cualquier `FAIL` corta con código != 0 (apto para CI).

## Alcance del "e2e"

No hay app servida en este subárbol, por lo que el e2e es de **extremo a extremo
del lado servidor**: encadena el mismo dominio que invocan las Edge Functions
(`crear-ticket → actualizar-lineas → registrar-pago → emitir-factura` y
`abrir → movimiento → cerrar`) verificando que los invariantes (cabecera
autoritativa, saldo, sobrepago, arqueo, descuadre, snapshot de factura) se
mantienen a lo largo del flujo. El e2e de **navegador/UI** queda para cuando la
web del TPV se despliegue (Playwright ya está disponible en el harness).

## Notas para CI

1. Instalar Deno; `deno test tpv/shared/` y `deno test --import-map=tpv/tests/import_map.test.json tpv/tests/`.
2. Levantar Postgres, aplicar `db/migrations/tpv_*` (0001…0005) y correr los `db/tests/*.sql`.
3. El runner (`run_tests.sh`) hace ambos pasos y devuelve un código de salida único.
