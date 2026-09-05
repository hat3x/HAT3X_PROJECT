# Fix final — Módulo Ortodoncia (revisión whole-branch)

Rama: `hat3x/HAT3X-038`. Tres findings de la revisión final aplicados; resto de la rama intacto.

## FIX 1 (Important) — Un plan CANCELADO no debe generar morosidad

**Archivo:** `src/lib/queries/ortho-payments.ts`, función `fetchOverdueOrthoCounts` (líneas 41-80 tras el cambio).

**Problema:** la consulta original contaba cuotas `ortho_installment` con `status='pendiente'` y `due_date < todayIso` sin mirar el estado del plan al que pertenecen. Al cancelar un plan, sus cuotas pendientes antiguas seguían contando como vencidas → morosidad permanente en la agenda, contradiciendo la tarjeta del paciente (que solo lee planes `activo`).

**Enfoque aplicado:** dos consultas, sin depender de un embed `!inner` de PostgREST sobre la FK compuesta `(plan_id, salon_id)`:

1. `ortho_payment_plan?select=id,customer_id&salon_id=eq.<salonId>&customer_id=in.(...)&status=eq.activo` → IDs de planes activos de esos pacientes.
2. Si el conjunto de planes activos está vacío → `return {}` inmediatamente (corto-circuito, sin segunda query).
3. `ortho_installment?select=customer_id&salon_id=eq.<salonId>&plan_id=in.(...)&status=eq.pendiente&due_date=lt.<todayIso>` → cuotas vencidas, filtradas por `plan_id` restringido a los planes activos.
4. Agregación por `customer_id` como antes (`result[row.customer_id]++`).

No se borra ni modifica ninguna cuota — el histórico de planes cancelados se preserva intacto en la tabla; simplemente deja de contarse en el conteo de morosidad.

## FIX 2 (Important) — Morosidad relativa a HOY real + clave de caché con la fecha

**(a)** `src/lib/queries/ortho-payments.ts:8-14` — `orthoPaymentKeys.overdue` ahora acepta `todayIso` como tercer parámetro y lo incluye en la query key:
```ts
overdue: (salonId: string, customerIds: readonly string[], todayIso: string) =>
  [...orthoPaymentKeys.all(salonId), "overdue", [...customerIds].sort().join(","), todayIso] as const,
```

**(b)** `src/hooks/use-ortho-payments.ts:33` — `useOverdueOrtho` pasa `todayIso` al factory de la key: `orthoPaymentKeys.overdue(salonId, customerIds, todayIso)`.

**(c)** `src/app/(dashboard)/appointments/appointments-view.tsx:109` — la llamada pasaba `date` (el día VISUALIZADO de la agenda, que puede ser pasado o futuro) como corte de morosidad. Cambiado el 3er argumento a `today` (ya calculado en la línea 76 vía `localDateInZone(timezone)`):
```ts
const overdueQuery = useOverdueOrtho(salonId, dayCustomerIds, today, sector === "odontologia");
```
Efecto: morosidad = "debe dinero a día de hoy real", constante aunque el usuario navegue a días futuros/pasados de la agenda. Como la key ahora incluye `todayIso`, no hay riesgo de que una entrada de caché de un día se sirva incorrectamente para otro.

## FIX 3 (Minor) — Carrera en creación del plan → 23505

**Archivo:** `src/app/(dashboard)/ortodoncia/payment-actions.ts`, `createOrthoPaymentPlan` (líneas 73-85 tras el cambio).

**Problema:** solo se traducía `error.message.includes("PLAN_EXISTS")` (el chequeo `perform 1 ... if found` dentro de la RPC). Si dos creaciones concurrentes pasaban ambas ese chequeo antes de que la primera insertase, la segunda choca contra el índice único parcial `ortho_payment_plan_one_active` → Postgres devuelve SQLSTATE `23505` con mensaje del tipo `duplicate key value violates unique constraint "ortho_payment_plan_one_active"`, que NO contiene la cadena `"PLAN_EXISTS"` → el usuario veía el error crudo de Postgres en vez del mensaje amigable.

**Fix:**
```ts
if (
  error.code === "23505" ||
  error.message.includes("PLAN_EXISTS") ||
  error.message.includes("ortho_payment_plan_one_active")
) {
  return { ok: false, error: "Este paciente ya tiene un plan de pago activo" };
}
```
Tres condiciones OR: código SQLSTATE, mensaje de la RPC, o nombre del índice — cubre tanto el camino feliz (RPC detecta el duplicado y aborta con `PLAN_EXISTS`) como la carrera real (constraint DB).

## Tests añadidos

`src/tests/unit/ortho-payment-actions.test.ts` — nuevo test para FIX 3:
```ts
it("traduce el 23505 de carrera (índice único parcial) al mismo mensaje claro", async () => {
  ...
  rpcMock.mockResolvedValue({
    data: null,
    error: { code: "23505", message: 'duplicate key value violates unique constraint "ortho_payment_plan_one_active"' },
  });
  const res = await createOrthoPaymentPlan("c1", { ... });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error).toMatch(/ya tiene un plan/i);
});
```

**Test de `fetchOverdueOrthoCounts` (FIX 1) — OMITIDO, según lo previsto en el brief.** Motivo: el helper compartido `src/tests/helpers/supabase-mock.ts` (usado en los tests de Server Actions de esta rama, p. ej. `restauracion-carta-actions.test.ts`) NO aplica filtrado real — `.eq()`, `.in()`, `.lt()` son no-ops encadenables; cada `.from(tabla)` devuelve siempre los datos fijos configurados para esa tabla, sin mirar los filtros de la query. Con ese helper, un test "cuota de plan cancelado no cuenta / cuota de plan activo sí cuenta" pasaría igual aunque la exclusión por plan activo estuviera rota (el mock ignoraría el filtro `plan_id=in.(...)` de la segunda consulta), dando falsa confianza. Además, `fetchOverdueOrthoCounts` usa el cliente de navegador (`@/lib/supabase/client`), y la convención ya establecida en este repo para los query-files de `src/lib/queries/*.ts` que usan ese cliente (ver `recall-queries.test.ts`, `perio-queries.test.ts`, `treatment-queries.test.ts`) es extraer la lógica pura a funciones testeables por separado y dejar el wrapper de I/O sin mock — pero `fetchOverdueOrthoCounts` no tiene lógica de agregación extraída a función pura exportada. Escribir un mock ad-hoc de dos pasos solo para este test habría sido frágil (rompería con cualquier cambio de shape en la cadena de consultas) sin aportar cobertura real de la exclusión. tsc + revisión manual de la lógica de las dos consultas bastan, tal como autorizaba el brief.

## Resultado `npx tsc --noEmit`

Limpio, 0 errores.

## Resultado tests ortho

```
npx vitest run src/tests/unit/ortho-payment-actions.test.ts src/tests/unit/ortho-payments-logic.test.ts

 Test Files  2 passed (2)
      Tests  11 passed (11)
```
(5 tests en `ortho-payment-actions.test.ts`, incluyendo el nuevo de FIX 3; 6 tests en `ortho-payments-logic.test.ts`, sin cambios de contenido, verificados en verde tras el resto de fixes.)

## Concerns

- El test de FIX 1 no quedó cubierto por un test automatizado — mitigado por: (a) el mismo patrón de dos consultas + corto-circuito en vacío ya se usa en otras partes del código (agregación manual tras dos queries), (b) tsc valida los tipos de las columnas (`id`, `customer_id` de `ortho_payment_plan`; `customer_id`, `plan_id` de `ortho_installment`) contra `src/types/database.ts`, y (c) la lógica es lineal y fácil de auditar a simple vista.
- No se ha tocado la RPC `create_ortho_payment_plan` ni ninguna migración SQL — FIX 3 es puramente de traducción de error en la capa de Server Action, tal como pedía el brief.
- No se ejecutó la suite completa (por instrucción explícita); solo los tests de ortodoncia + tsc del proyecto completo.
