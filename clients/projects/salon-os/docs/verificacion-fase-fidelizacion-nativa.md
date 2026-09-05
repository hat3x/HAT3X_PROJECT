# Verificación final de fase — fidelización nativa + identidad por teléfono / RLS SELF (sub-10)

> Cierre de QA de la fase. Evidencia reproducible de que **la fase es aditiva en
> capacidad y no rompe nada**, y de que los dos invariantes de seguridad se
> mantienen: **ningún salón ve datos de otro** y **el cliente jamás escribe
> puntos/cupones/recompensas**. Fecha: 2026-07-17. Rama: `hat3x/HAT3X-021`.

## 1. Alcance revisado

La fase sustituye la fidelización basada en **route handlers proxy** a la API
externa (denueveanueve) por un **núcleo nativo de servidor** sobre el esquema
propio, y añade la vista de autoservicio del cliente. Cambios del árbol de trabajo:

| Cambio | Archivos | Naturaleza |
|---|---|---|
| Núcleo nativo (ya en repo) | `src/lib/loyalty/server.ts` | Escritura sensible gateada por pertenencia de staff |
| Vista de fidelización del cliente (nueva) | `src/app/(dashboard)/customers/[id]/loyalty/{loyalty-view,customer-qr}.tsx` | **Solo lectura** (render de un `LoyaltyLookupResult` + QR) |
| TPV | `src/app/(dashboard)/tpv/{page,tpv-view}.tsx` | Consumo del núcleo nativo vía Server Actions |
| Test de integración (nuevo) | `src/tests/integration/loyalty-server.test.ts` | Orquestación de `awardVisit`/`lookupByQr` con doble con estado |
| **Retirada** de la capa proxy | `src/app/api/loyalty/**`, `src/lib/validations/loyalty.ts`, `src/tests/unit/loyalty-routes.test.ts` | Superficie HTTP obsoleta eliminada junto con sus tests |

La retirada de `src/app/api/loyalty/**` **no debilita** nada: elimina una
superficie de red (y la exposición del `SUPABASE_SERVICE_ROLE_KEY`) que hoy queda
cubierta por Server Actions `"use server"` gateadas. No queda ninguna referencia
colgante a las rutas o validaciones borradas (`grep` de `/api/loyalty`,
`validations/loyalty`, `loyalty/lookup`, `loyalty/verify-visit` → 0 coincidencias).

## 2. Comprobaciones de base (evidencia)

| Comando | Resultado | Exit code |
|---|---|---|
| `npx tsc --noEmit` | Sin salida (0 errores de tipos) | `0` |
| `npx vitest run` | **31 archivos, 414 tests, 414 passed** (0 fallidos, 0 saltados) | `0` |
| `npm run build` | `✓ Compiled successfully`, 21/21 páginas estáticas | `0` |

- **Tipos:** `tsc --noEmit` limpio.
- **Tests:** verde total. La suite crece desde la base de **311** hasta **414**
  (previos + nuevos). El único archivo de test retirado
  (`loyalty-routes.test.ts`) se eliminó **junto con la funcionalidad que cubría**
  (las rutas proxy), no para ocultar un fallo; ningún test previo pasa a rojo.
- **Build:** compila; la tabla de rutas ya **no** incluye `/api/loyalty/*`
  (retiradas), y no hay imports rotos por las eliminaciones (si los hubiera, el
  build habría fallado).

## 3. Invariante A — ningún salón ve datos de otro (aislamiento multi-tenant)

Verificado en tres capas concéntricas:

1. **Aplicación** (`src/lib/loyalty/server.ts`):
   - `lookupByQr` es solo lectura con el **cliente RLS de la sesión**, acotado al
     salón activo (`requireActiveSalonId`): un miembro solo consulta clientes de
     SU salón.
   - Toda lectura/escritura acota **siempre** por `.eq("salon_id", salonId)`, y
     `resolveCustomer` / `assertCustomerInSalon` devuelven `404` si el cliente no
     pertenece al salón.
2. **Base de datos** (RLS, `20260717120000_rls_self_customer.sql` +
   `20260717130000_rls_self_guard.sql`): barrera de staff por
   `app.user_salon_ids()` y barrera SELF por `app.user_customer_ids()` en
   `customers` + las 4 tablas de fidelización. El **guardián** aborta la migración
   si cualquier política pierde su anclaje de aislamiento (caza un `using (true)`).
3. **Tests** (verdes): `loyalty-server.test.ts` §4 (un miembro de B no ve/acredita
   al cliente de A → `404`; miembro de A no opera en B → `403`; sin sesión →
   `401`) y `customers-self-isolation.test.ts` (`getMyCustomer` solo devuelve lo
   propio; pedir la ficha de otra cuenta → `403`).

## 4. Invariante B — el cliente jamás escribe puntos/cupones/recompensas

La **única** vía de escritura de puntos/cupones/recompensas es `awardVisit` /
`grantWelcomeCoupon`, ambas con `requireMembershipForSalon(salonId)` (pertenencia
real a `salon_members`). Verificado en tres capas:

1. **Aplicación:** los puntos de entrada del TPV (`tpv/actions.ts`) son Server
   Actions `"use server"` que resuelven el salón por la sesión; un cliente sin
   pertenencia obtiene `forbidden` antes de tocar nada. Las nuevas pantallas del
   cliente (`loyalty-view.tsx`, `customer-qr.tsx`) son **puramente de lectura**:
   no hay ni un Server Action ni una mutación.
2. **Base de datos:** **no existe** ninguna política SELF de `INSERT/UPDATE/DELETE`
   sobre las tablas de fidelización (deny-by-default). El guardián comprueba
   explícitamente `0` políticas que referencien `user_customer_ids` con `cmd <>
   SELECT`, y que `points_movements` sea **append-only** (sin política de UPDATE).
3. **Tests** (verdes): `customers-self-isolation.test.ts` §1b — un cliente
   autenticado (no staff) que llama a `awardVisit` sobre su propia ficha recibe
   `forbidden 403` y **la cuenta queda intacta** (`points_balance` 0, sin
   movimientos); control positivo: el **staff** sí acredita. Además, un test de
   fuente escanea **todas** las migraciones y exige que cada política acotada por
   `user_customer_ids` sea `for select` (ninguna escritura de cliente).

## 5. Conclusión

`tsc --noEmit` limpio, `vitest run` en verde (414/414), `npm run build` OK. La
fase suma capacidad (fidelización nativa + autoservicio de lectura) y retira la
capa proxy obsoleta **sin romper** tipos, tests ni build, y **sin debilitar** el
aislamiento: ningún cambio permite que un salón vea datos de otro ni que el
cliente escriba puntos/cupones/recompensas. **Apta para cierre de fase.**
