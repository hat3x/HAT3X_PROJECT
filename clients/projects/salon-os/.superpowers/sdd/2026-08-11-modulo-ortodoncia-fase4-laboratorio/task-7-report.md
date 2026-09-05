# Task 7 — UI tarjeta "Laboratorio" (ui-ux-pro-max) — Report

## Status: DONE

## Commit
`3274155` — `feat(ortodoncia): UI tarjeta Laboratorio (ui-ux-pro-max)`
File: `src/components/dental/ortho-lab-card.tsx` (571 líneas, archivo nuevo, único archivo tocado).

## tsc
`npx tsc --noEmit` → **0 errores**.

## Fix round 1

**Bug reportado por revisión:** `actionError` no se limpiaba al abrir el diálogo de confirmación de borrado. Si una mutación de fila (marcar recibido/entregado) fallaba y dejaba `actionError` con un mensaje, y el usuario pulsaba "Borrar" en cualquier pedido, ese error obsoleto y sin relación se renderizaba dentro del diálogo de borrado, mal atribuido a la acción destructiva. La tarjeta hermana `ortho-payment-plan-card.tsx` evita esto reseteando el error propio del diálogo en sus funciones `openPayDialog`/`openCancelDialog`.

**Fix aplicado:** el opener `onDelete` de `LabOrderRow` ahora limpia `actionError` antes de abrir el diálogo:

```tsx
onDelete={() => {
  setActionError(null);
  setDeleteTarget(o);
}}
```

**Commit:** `112700b` — `fix(ortodoncia): limpiar actionError al abrir dialogo de borrado`

**tsc tras el fix:** `npx tsc --noEmit` → **0 errores**.

## ui-ux-pro-max — cómo se aplicó

Invocado el skill (`ui-ux-pro-max:ui-ux-pro-max`) antes de escribir el componente, tal como exige el brief.

1. `--design-system "dental clinic clinical workflow status tracker card healthcare"` → confirmó dirección **"Accessible & Ethical"** (alto contraste, WCAG AAA, foco visible, sin iconos-emoji, 44×44px touch targets, animaciones 150–300ms, sin degradados AI purple/pink). No usé la paleta cian/verde que devolvió la búsqueda (es de landing/marketing) porque el propio brief exige igualar el sistema de diseño ya establecido por `ortho-payment-plan-card.tsx` (tokens semánticos del proyecto: `success`, `destructive`, `info`, `border-border/70`, `ease-apple-out`, `tabular-nums`, etc.) — usar una paleta nueva habría roto la coherencia visual con la tarjeta hermana, que es el criterio explícito de aceptación ("debe sentirse parte del mismo sistema").
2. `--domain ux "status badge colors semantic not color alone confirmation dialog destructive delete"` → confirmó: (a) nunca transmitir estado solo por color → cada `Badge` de estado lleva icono + texto, no solo color; (b) confirmar antes de acciones destructivas → `Dialog` de confirmación para "Borrar pedido"; (c) feedback de carga/envío → `Skeleton` en la lista, spinners `Loader2` en los botones mientras la mutación está pendiente.

## Decisiones de diseño

- **Header con icono en badge redondeado** (`FlaskConical` sobre `bg-primary/10 text-primary`) + subtítulo descriptivo — mismo patrón que `Wallet` en `OrthoPaymentPlanCard`.
- **Formulario "Nuevo pedido"** en panel bordeado (`border-border/70 bg-muted/20`), con `Select` shadcn para "Tipo" (no `<select>` nativo, como pide el brief), `Textarea` para "Notas" (elevación sobre la referencia funcional, que usaba un `Input` de una línea; las notas son texto libre multilínea y ya se renderizan con `whitespace-pre-wrap` en la lista).
- **Badge de estado con 3 colores distintos + icono**, usando los **tokens semánticos ya existentes** en el proyecto (confirmados en `tailwind.config.ts` / `globals.css`, ya usados en `payment-sheet.tsx`, `tpv/payment-dialog.tsx`):
  - `enviado` → neutral (`text-muted-foreground` + icono `Send`), igual que "Pendiente" en la tarjeta hermana.
  - `recibido` → `border-info/30 bg-info/10 text-info` + icono `PackageCheck` (azul/info — pedido de vuelta en la clínica).
  - `entregado` → `border-success/30 bg-success/10 text-success` + icono `CheckCircle2`, igual patrón que "Pagada".
- **Diálogo de confirmación antes de borrar** (encouraged por el brief): icono `Trash2` en badge destructivo, resumen del pedido a borrar, botón "Cancelar" / "Sí, borrar" con spinner mientras `deleteOrder.isPending`.
- **Estados de carga/vacío/error de la lista** como componentes propios (`OrdersSkeleton`, `OrdersEmpty`, `OrdersError` con retry), replicando el patrón `PlanSkeleton` / `PlanError` de la tarjeta hermana en vez de los `<p>` sueltos de la referencia funcional del brief.
- **Manejo de errores por-mutación con estado local**, tal como exige el brief:
  - `formError` para la creación de pedido.
  - `actionError` compartido para las acciones de fila (marcar recibido / entregado / borrar) — mismo espíritu que `unpayError` en `OrthoPaymentPlanCard` (solo suele haber una acción de fila en curso a la vez).
  - Botones deshabilitados con `isPending` de cada mutación mientras están en curso, con `Loader2` animado.

## Cableado (sin cambios respecto al brief)

- Props: `{ salonId: string; customerId: string }`.
- Hooks: `useLabOrders`, `useCreateLabOrder`, `useMarkLabOrderReceived`, `useMarkLabOrderDelivered`, `useDeleteLabOrder` de `@/hooks/use-lab-orders`, sin modificar sus firmas.
- Dominio: `LAB_ORDER_KIND_LABELS`, `LAB_ORDER_STATUS_LABELS`, `labOrderStatus`, `LabOrderKind`, `LabOrderStatus` de `@/lib/dental/lab-orders`.
- `LabOrder` de `@/types/database`.
- `createOrder.mutate({ kind, labName: labName || null, sentAt, notes: notes || null })`, limpia `labName`+`notes` en éxito.
- `markReceived`/`markDelivered.mutate({ orderId, input: { date: todayIso() } })`.
- `deleteOrder.mutate(orderId)` (string directo, no objeto — confirmado leyendo `use-lab-orders.ts`).
- Estado derivado con `labOrderStatus({ sentAt: o.sent_at, receivedAt: o.received_at, deliveredAt: o.delivered_at })`.
- **RSC boundary respetado**: no hay ningún import de `@/lib/salon` en el archivo; `salonId`/`customerId` llegan solo por props.

## Verificación

- `npx tsc --noEmit` → 0 errores (confirmado).
- Verificación visual **no realizada** — es esperado según el brief: la pestaña que monta `OrthoLabCard` se conecta en Task 8, que no está implementada todavía. No se tocó ningún otro archivo.

## Concerns

1. **No verificación visual real.** Al no estar montado en ninguna página todavía, no pude confirmar visualmente contraste, espaciados ni el comportamiento del `Dialog`/`Select` en runtime. Recomiendo una pasada visual rápida tras Task 8 (crear pedido → marcar recibido → marcar entregado → borrar, en claro y oscuro).
2. **`actionError` es compartido entre las tres acciones de fila** (recibido/entregado/borrar), igual que el patrón `unpayError` de la tarjeta hermana. Si dos pedidos distintos fallan casi a la vez, solo se ve el último error. Es el mismo trade-off ya aceptado en `OrthoPaymentPlanCard`, así que lo mantuve por consistencia, pero lo señalo por si Task 8 revela que hace falta un error por fila.
3. Usé el token `text-info` / `bg-info` / `border-info`, que ya existe en `tailwind.config.ts` y `globals.css` (confirmado antes de usarlo) y ya se usa en 3 archivos del proyecto, pero **no** se usaba previamente en ningún componente `dental/`. Es coherente con el sistema de diseño global, no es una clase inventada.
