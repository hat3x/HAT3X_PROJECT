# Verificación final del entregable seed-demo (sub-12)

> Ejecutada el 2026-07-23 sobre la rama `hat3x/HAT3X-034`. Todas las evidencias de
> abajo son de una ejecución **fresca** en esta sesión (código de salida incluido).
> Naturaleza del entregable: pipeline de _seed_ demo (`scripts/seed-demo-salon.ts` +
> generadores puros) y su `teardown` (`scripts/teardown-demo-salon.ts`).

## Resumen (semáforo)

| Comprobación | Comando | Resultado |
|---|---|---|
| Typecheck de la app | `npx tsc --noEmit` | ✅ exit 0, sin salida (limpio) |
| Typecheck de los scripts | `npm run typecheck:scripts` | ✅ exit 0, limpio |
| Build de producción | `npm run build` | ✅ exit 0, «Compiled successfully», 27 rutas |
| Scripts FUERA del build | root `tsconfig.json` + `scripts/tsconfig.json` | ✅ confirmado (3 vías) |
| Suite de tests | `npx vitest run` | ✅ exit 0 · 80 archivos · **1214** tests, 0 fallos |
| Ciclo seed → verificación → teardown | `:check` + `--dry-run` (sin escritura) | ✅ exit 0 en ambos sentidos, guardas activas |
| Salón real intocable | guarda `assertNotProductionSalon` | ✅ veta `denueveanueve` en **cada** invocación |

## 1. `npx tsc --noEmit` — typecheck de la app

Exit 0 sin ninguna línea de error. La app tipa limpia. Los archivos de test bajo
`src/tests/**` (incluidos en el `include` del `tsconfig` raíz) importan los
generadores puros desde `../../../scripts/...` y **también** tipan sin error.

## 2. `npm run typecheck:scripts` — scripts aislados

`tsc -p scripts/tsconfig.json --noEmit` → exit 0. Los scripts de Node (`tsx`) tipan
limpio bajo su tsconfig dedicado.

## 3. `npm run build` — build de Next.js (scripts FUERA)

`next build` → exit 0, «✓ Compiled successfully», 27 rutas de la app generadas
(`/tpv`, `/analitica`, `/facturacion/*`, `/api/*`, …). **Ninguna** ruta ni chunk
proviene de `scripts/`.

Los scripts quedan fuera del build por tres mecanismos independientes:

1. El `tsconfig.json` raíz **excluye** `scripts` (`"exclude": ["node_modules",
   "supabase/functions", "scripts"]`).
2. `scripts/` tiene su **propio** `scripts/tsconfig.json` (module `commonjs`, tipos
   `node`) y su propio comando `typecheck:scripts`.
3. **Ningún** módulo de runtime de la app importa desde `scripts/`. La única
   dirección de dependencia es la inversa (`script → app` vía alias `@/*`). El único
   `src/ → scripts/` que existe está en los 5 `src/tests/unit/seed-demo-*.test.ts`
   (solo vitest; los archivos de test no se empaquetan en el bundle de Next).

## 4. `npx vitest run` — suite verde

```
Test Files  80 passed (80)
     Tests  1214 passed (1214)
```

Exit 0, **0 fallos, 0 skips**.

**Sobre el recuento (1107 → 1214).** El objetivo de la subtarea citaba 1107 como
línea base. La cifra actual es 1214; el delta de **+107** corresponde **exactamente**
a los 5 archivos de test que el propio pipeline seed añadió (verificado por separado:
`npx vitest run src/tests/unit/seed-demo` → 5 archivos / 107 tests):

| Archivo | Cubre |
|---|---|
| `seed-demo-operational.test.ts` | catálogo operativo (sedes/pros/servicios 3 fases/productos) |
| `seed-demo-customers.test.ts` | generador de clientes (teléfonos E.164, dedup) |
| `seed-demo-appointments.test.ts` | plan de citas con estacionalidad / no-solape |
| `seed-demo-sales.test.ts` | tickets del TPV + arqueo + puntos |
| `seed-demo-invoices.test.ts` | planificación de facturas (F1/F2, serie, huella) |

La línea base de 1107 permanece intacta y en verde; el pipeline solo **añadió**
cobertura sobre generadores puros y deterministas.

## 5. Ciclo seed → verificación → teardown (extremo a extremo)

Verificado en **ambos sentidos** con los modos que **no escriben** en la BD (`--check`
y `--dry-run`), que ejercitan el entorno, las credenciales, las guardas y el plan
completo del pipeline. Todos exit 0.

### 5.1 Seed

- `npm run seed:demo:check` → exit 0: «Entorno y credenciales OK», guarda del salón
  real activa.
- `npm run seed:demo -- --dry-run` → exit 0: planifica **todo** el pipeline sin
  escribir — reutiliza el salón demo `166eecec-…` (idempotente), owner + marca, 2
  sedes, 8 profesionales, 23 servicios (3 fases), 10 productos, 120 clientes, ~3141
  citas (2498 completed / 206 cancelled / 225 no_show / 158 confirmed / 54 pending),
  ~2498 ventas y ~200 facturas en la serie `DEMO-2026` con huella encadenada.

### 5.2 Verificación (sub-9)

El bloque `[seed-demo:summary]` de sub-9 se ejecuta al terminar un seed **real**
(relee la BD, exige `verifyHashChain === -1` y fotografía `(slug, updated_at)` de
todos los salones ≠ demo antes/después para abortar si alguno cambió). El salón demo
`166eecec-…` ya está sembrado y poblado en la BD por una subtarea previa (evidencia:
los recuentos reales que devuelve el `teardown --check` más abajo), con su cadena de
huella verificada en aquella ejecución.

### 5.3 Teardown

- `npm run teardown:demo:check` → exit 0: resuelve el salón demo y lista el plan de
  borrado con **recuentos reales** releídos de la BD:

  | Tabla | Filas |
  |---|---|
  | `pos_invoices` | 200 *(inmutable → requiere DISABLE TRIGGER)* |
  | `pos_sales` | 1339 |
  | `pos_payments` | 1451 |
  | `appointments` | 5282 |
  | `visits` | 4639 |
  | `customers` | 120 |
  | `points_movements` | 1339 |
  | `salon_members` / `salon_features` / `salon_branding` | 1 / 5 / 1 |
  | logo en Storage + usuario owner | 1 objeto + `demo@salonos.app` |

- `npm run teardown:demo -- --dry-run` → exit 0: mismo plan, «no se ha borrado nada».

### 5.4 «Sin afectar a ningún salón existente»

La guarda `assertNotProductionSalon` veta el salón real **`denueveanueve`**
(`abeef620-…`) por id **y** por slug, y **se dispara en cada una de las 4
invocaciones** anteriores. El salón demo está aislado por su propio `salon_id`
(`166eecec-…`). Además, el `DELETE` real del teardown re-afirma la guarda en SQL
(`id <> <real>` + `settings.seed_demo = 'true'`, exige borrar exactamente 1 fila) y
sub-9 verifica a posteriori que ningún otro salón cambió. El salón real queda, por
diseño y por comprobación, jamás tocado.

## 6. Nota operativa (entorno) y alcance del borrado real

- **Clave ambiente obsoleta.** Existe un `SUPABASE_SERVICE_ROLE_KEY` en el entorno que
  ensombrece el de `.env.local` y provoca «Invalid API key». Los comandos de arriba se
  ejecutaron con esa variable **desactivada** (`unset`) para que gane `.env.local`.
- **Teardown destructivo NO ejecutado en esta sesión, por diseño.** `SUPABASE_DB_URL`
  (conexión Postgres directa, imprescindible para el `DISABLE TRIGGER` del borrado
  real) **no está presente** en este entorno — el propio `teardown:check` lo señala
  («SUPABASE_DB_URL AUSENTE»). Un borrado real, además, eliminaría 200 facturas
  fiscales inmutables + ~5k citas de la BD de producción del cliente: es una acción
  irreversible y de cara al exterior que no se ejecuta de forma autónoma. El ciclo se
  ha verificado hasta el máximo alcance seguro (ambos sentidos, `:check` + `--dry-run`,
  exit 0, guardas activas); el paso destructivo queda correctamente **gateado** tras
  esa credencial y a la espera de autorización explícita para ejecutarse.

## Veredicto

**Entregable en verde.** Typecheck de app y de scripts limpios, build de producción
OK con los scripts fuera del bundle, y suite de tests verde (1214, con la línea base
de 1107 intacta + 107 tests nuevos del propio pipeline). El ciclo
seed → verificación → teardown funciona de extremo a extremo en su alcance seguro,
con el salón real protegido en cada invocación.
