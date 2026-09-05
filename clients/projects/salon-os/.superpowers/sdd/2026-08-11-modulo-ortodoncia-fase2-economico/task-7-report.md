# Task 7 — Report: UI "Plan de pago" + montaje en /ortodoncia

## Resumen

Creado `src/components/dental/ortho-payment-plan-card.tsx` (componente cliente
`OrthoPaymentPlanCard`, props `{ salonId, customerId }`) y montado como último
bloque de `src/components/dental/ortodoncia-view.tsx`, dentro del
`<div className="space-y-6">`, tras la tarjeta "Consentimiento de ortodoncia".

El cableado (hooks de Task 6, lógica pura de Task 1, tipos de Task 3,
`formatMoney` de `@/lib/format`) se mantuvo intacto tal como especifica el
brief; todo el trabajo de esta tarea fue la capa visual e interacción.

## ui-ux-pro-max: invocación y pautas aplicadas

Invocado vía `Skill("ui-ux-pro-max", ...)` con contexto del componente (dos
estados: formulario de creación con preview, y plan activo con saldo/tabla/cobro).
Como el script CLI de la skill (`search.py --design-system`) está orientado a
producto móvil/nuevo con paleta desde cero, y este proyecto YA tiene un sistema
de diseño consolidado (tokens shadcn/tailwind: `primary`, `destructive`,
`success`, `warning`, `muted`, `border`, radios `rounded-lg`/`rounded-xl`,
easing `ease-apple-out`), no se importó una paleta nueva — se usó el resultado
de `--design-system` solo como checklist de calidad, y se hicieron búsquedas
dirigidas por dominio `ux` para los patrones concretos del componente:

- **Progress Indicators / Loading Indicators** (`--domain ux "progress bar
  status badge chip table row highlight overdue"` y `"loading empty error
  state skeleton form validation"`) → barra de progreso con `role="progressbar"`
  + `aria-valuenow/min/max`, transición de `width` 300ms; skeletons (no texto
  "Cargando…") para el estado de carga; estado de error con icono + mensaje +
  botón "Reintentar" (`planQuery.refetch()`).
- **Confirmation Dialogs** (`--domain ux "confirmation dialog destructive
  action irreversible cancel"`) → "Cancelar plan" y "Cobrar cuota" abren un
  `Dialog` de confirmación en vez de ejecutar la mutación al primer clic;
  "Cancelar plan" usa `variant="destructive"` y explica que el histórico se
  conserva pero deja de poder cobrarse desde ahí.
- **Forms & Feedback** → labels visibles (no placeholder-only), asteriscos en
  campos obligatorios, pista de validación bajo el formulario ANTES de que el
  usuario envíe (explica por qué no hay preview: "El importe a financiar es
  menor que el número de cuotas: sube el total, baja la entrada o reduce las
  cuotas."), error de mutación con `role="alert"`, botones deshabilitados +
  spinner durante mutaciones en curso.
- **Color not only** → los chips de estado de cuota combinan color + icono +
  texto (`CheckCircle2`+"Pagada", `AlertTriangle`+"Vencida"), no solo color.
- **Table Handling (responsive)** → `Table` con `scrollRegionLabel` (región
  enfocable por teclado con scroll horizontal en móvil) envuelta en un
  contenedor `rounded-xl border overflow-hidden` para el aspecto de tarjeta.

## Decisiones de UI

- **Jerarquía del saldo**: 4 "stat tiles" (Total/Pagado/Pendiente/Vencidas) en
  grid 2×2 (móvil) / 1×4 (sm+), en vez de una línea de texto plana como en la
  referencia. "Pagado" en `text-success`, "Vencidas" cambia a tono destructivo
  solo si `overdueCount > 0` (si no, "Al día" en verde) — evita alarmar cuando
  no hay morosidad.
- **Barra de progreso**: pagado/total con `bg-success`, animada, con etiqueta
  de porcentaje. Reemplaza el resumen textual de la referencia.
- **Tabla de cuotas** (shadcn `Table`, no `<ul>`): columnas Cuota/Vencimiento/
  Importe/Estado/Acción; filas vencidas resaltadas con `bg-destructive/5` +
  fecha en rojo (además del chip), consistente con "no depender solo del
  color".
- **Selector de método antes de cobrar (mejora pedida por el brief)**: "Cobrar"
  abre un `Dialog` con el importe, un `Select` de `ORTHO_PAYMENT_METHOD_LABELS`
  (por defecto "efectivo") y "Confirmar cobro"/"Cancelar". El diálogo se
  autocierra cuando la cuota objetivo pasa a `"pagada"` en los datos frescos
  tras invalidar la query (`useEffect` sobre `installments`); si el cobro
  falla, la cuota sigue pendiente, el diálogo permanece abierto y muestra
  `payError`.
- **Preview del calendario** (creación de plan): en vez de una frase de texto
  como en la referencia, se muestra una lista desplazable (máx. `52` de alto)
  con cada pago (Entrada/Cuota N, fecha, importe) + fila de total, para
  verificar visualmente el reparto de céntimos antes de crear.
- **Campos de importe**: `MoneyField` con sufijo "€" visible dentro del input
  (alineado a la derecha, `tabular-nums`), en vez de un `<Input>` desnudo.
- **Convención de fecha**: se replicó el helper local `formatDate` (dd/mm/aaaa)
  usado en `ConsentList`/`PrescriptionList`/`ImageGallery` (mismo módulo
  dental), en lugar del `formatDate` de `@/lib/format` (que usa "d MMM yyyy" y
  se usa en TPV/WhatsApp) — consistencia dentro del dominio dental.
- Iconografía Lucide (ya usada en el repo: `Wallet`, `CalendarDays`,
  `CheckCircle2`, `AlertTriangle`, `AlertCircle`, `Loader2`, `Undo2`, `Ban`),
  ningún emoji.

## Componentes usados

`Card/CardHeader/CardTitle/CardContent`, `Button`, `Input`, `Label`, `Badge`,
`Select/SelectTrigger/SelectValue/SelectContent/SelectItem` (todos existían en
`src/components/ui/`, no hizo falta un `<select>` nativo), `Dialog` y
subcomponentes (primer uso dentro del módulo dental; ya se usaba en
`tpv-view.tsx`), `Table` y subcomponentes, `Skeleton`.

## Verificación

- `npx tsc --noEmit` → **0 errores** (ejecutado dos veces, antes y después de
  un ajuste de estilo menor al `TableHeader`).
- `npm run dev` levantado y `GET /ortodoncia` compilado por Next.js sin
  errores ni warnings: `✓ Compiled /ortodoncia in 40.8s (2586 modules)` (log
  completo revisado, sin entradas de error). La ruta devuelve `307` a
  `/dashboard` porque la petición vía `curl` no lleva sesión — no llegué a
  validar visualmente el render autenticado con un paciente real de Biodental
  (no dispongo de credenciales de login para ese entorno); ver "Concerns".
- Revisión manual de imports (todos usados, verificado con `Grep` por símbolo)
  y de la lógica de estados (loading/error/vacío-con-formulario/activo).

## Self-review

- Contrato del brief respetado: mismos hooks, mismas firmas de mutación
  (`payMut.mutate({ installmentId, input: { method } })`), mismo cálculo de
  saldo (`computePlanBalance`) y de vencimiento (`isOverdue`), mismo criterio
  de conversión €→céntimos (`eurosToCents`) y de gating del preview.
- Los tres flags de "pending" están separados (`payPending`/`unpayPending`/
  `cancelPending`) en vez de un único `mutating` global de la referencia —
  cada botón solo se deshabilita por su propia mutación, mejor feedback.
- Cancelar el plan no requiere gestión manual de estado tras confirmar: al
  invalidar la query, `planQuery.data` pasa a `null` y `ActivePlan` (con su
  diálogo) se desmonta entero.
- Validación cliente del "día de cobro" (1–31) añadida al gating del preview y
  al mensaje de ayuda, alineada con el `zod` schema del server action
  (`payInstallmentSchema`/`createOrthoPlanSchema`), para no depender solo del
  error del servidor.

## Concerns

- **No se hizo la verificación visual interactiva** que pide el Step 3 del
  brief (crear un plan real 3000€/600€/24 cuotas/día 5 desde el navegador con
  un paciente de Biodental, cobrar/deshacer una cuota). No tengo credenciales
  de login para ese entorno de desarrollo y no debía fabricarlas ni asumir una
  sesión. Verifiqué en su lugar: `tsc` limpio + compilación completa de la
  ruta `/ortodoncia` por Next.js (2586 módulos, sin errores/warnings) +
  revisión manual exhaustiva del JSX/estados. Recomiendo que alguien con
  acceso real haga una pasada visual de 2–3 minutos antes de dar la fase por
  cerrada.
- El diálogo de cobro se autocierra observando que la cuota objetivo cambie a
  `"pagada"` en `installments` (en vez de un callback `onSuccess` directo de
  la mutación, porque la firma `onPay(installmentId, method)` del contrato no
  expone la mutación al hijo). Funciona correctamente con el flujo real
  (invalidate → refetch → nuevo array `installments`), pero es un patrón algo
  más indirecto que "cerrar en onSuccess"; documentado con comentario en el
  código.
  **→ Corregido en Fix round 1** (ver abajo): este era precisamente el
  problema que originó el hallazgo IMPORTANT #3.

## Fix round 1 (revisión del coordinador)

La revisión encontró 3 hallazgos IMPORTANT, todos en
`ortho-payment-plan-card.tsx`, más 1 MENOR opcional. Se corrigieron los 4,
siguiendo el patrón de referencia señalado (`consent-list.tsx`: error local
por acción, reseteado antes de cada llamada, fijado en `onError`) — pero
implementado con `mutateAsync` en vez de la forma `mutate(vars, {onSuccess,
onError})`, porque aquí la mutación vive en el padre (`OrthoPaymentPlanCard`,
donde se llama a los hooks de Task 6) y el estado del diálogo vive en el hijo
(`ActivePlan`); `mutateAsync` deja que el hijo haga `.then()/.catch()` sobre
la llamada concreta sin tener que pasar objetos de callback por props ni
exponer la mutación entera hacia abajo. El cableado de hooks en
`OrthoPaymentPlanCard` no cambia (`usePayInstallment` etc. siguen invocándose
igual arriba); solo se cambió `.mutate(...)` por `.mutateAsync(...)` en las
tres props que se pasan a `ActivePlan`.

1. **Fallos de "Cancelar plan" silenciados → corregido.** Se añadió estado
   local `cancelError` en `ActivePlan`, reseteado en `openCancelDialog()`
   (antes de abrir el diálogo) y fijado en el `.catch()` de
   `onCancel(plan.id)`. Se renderiza dentro del diálogo de confirmación con
   el mismo patrón `role="alert"` que ya se usaba para otros errores.
2. **Error de cobro obsoleto al reabrir "Cobrar" → corregido.** El botón
   "Cobrar" ahora llama a `openPayDialog(installment)`, que resetea
   `payDialogError` (y el método a "efectivo") ANTES de fijar `payTarget` y
   abrir el diálogo — ya no puede arrastrar el error de una cuota anterior.
   El error dejó de derivarse de `payMut.isError/.error` (estado compartido
   entre filas) y pasó a ser local a `ActivePlan`, fijado solo en el
   `.catch()` de la llamada de cobro en curso.
3. **Autocierre acoplado al refetch → corregido.** Se eliminó por completo el
   `useEffect` que observaba `installments` (y el import ahora-innecesario de
   `useEffect`). `handleConfirmPay()` llama a `onPay(...)` (que internamente
   usa `mutateAsync`) y cierra el diálogo (`setPayTarget(null)`) en el
   `.then()` de ESA llamada — éxito de la mutación, no del siguiente fetch.
   Si el cobro tiene éxito pero un refetch posterior fallara, el diálogo
   igualmente se cierra (ya no depende de ver la cuota "pagada" en datos
   frescos).
   - Extendí el mismo patrón (no pedido explícitamente pero mismo defecto de
     raíz) a "Deshacer" (`handleUnpay`, con `unpayError` mostrado en un
     banner sobre la tabla, ya que esa acción no tiene diálogo) para no dejar
     un caso análogo sin corregir en el mismo archivo.
4. **MENOR: tope de 120 cuotas en cliente → corregido.** Añadido
   `installmentCount > 120` al gating del `preview` (useMemo) y un mensaje
   ("Máximo 120 cuotas.") a `validationHint`, alineado con
   `createOrthoPlanSchema` (`installmentCount: z.number().int().min(1).max(120)`
   en `src/lib/validations/ortho-payments.ts`). También se añadió `max={120}`
   al `<Input type="number">` de "Nº de cuotas" para el límite nativo del
   control, igual que ya tenía "Día de cobro" (`min={1} max={31}`).

**Cableado intacto**: no se tocaron `src/hooks/use-ortho-payments.ts`, `src/lib/dental/ortho-payments.ts`,
`src/app/(dashboard)/ortodoncia/payment-actions.ts` ni `src/lib/validations/ortho-payments.ts`. Tampoco cambió
el diseño visual (mismos componentes, mismos tokens, mismo layout) — el fix
es enteramente de manejo de estado/errores.

**Verificación tras el fix:**
- `npx tsc --noEmit` → **0 errores**.
- `npm run dev` + `GET /ortodoncia` → recompiló limpio: `✓ Compiled /ortodoncia in 5.1s (2586 modules)`, sin errores ni warnings en el log (misma redirección `307` esperada por falta de sesión en la petición `curl`).
