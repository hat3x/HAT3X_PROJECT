# Task 6 — React Query Hooks para Pedidos de Laboratorio

## Status
✅ COMPLETED

## Summary
Implementada la librería de hooks de React Query para gestión de pedidos de laboratorio en el módulo de ortodoncia.

## Details

**File created:**
- `src/hooks/use-lab-orders.ts` (74 líneas)

**Exports:**
- `useLabOrders(salonId, customerId)` — Query para obtener pedidos del paciente
- `useCreateLabOrder(salonId, customerId)` — Mutation para crear pedido
- `useMarkLabOrderReceived(salonId, customerId)` — Mutation para marcar recibido
- `useMarkLabOrderDelivered(salonId, customerId)` — Mutation para marcar entregado
- `useDeleteLabOrder(salonId, customerId)` — Mutation para borrar pedido

**Implementation pattern:**
- Sigue exactamente el patrón de `src/hooks/use-ortho-payments.ts`
- Utiliza `@tanstack/react-query` (usQuery + useMutation)
- Maneja invalidación de queries en onSuccess
- Tipado completo sin `any`
- "use client" directive presente

## Validation

**TypeScript:**
```
npx tsc --noEmit
→ 0 errors ✅
```

**Dependencies verified:**
- ✅ `@/app/(dashboard)/ortodoncia/lab-actions` — Task 5
- ✅ `@/lib/queries/lab-orders` — Task 4
- ✅ `@/lib/validations/lab-orders` — Task 2

## Commit

```
Commit:  3874218
Message: feat(ortodoncia): hooks pedidos de laboratorio
Files:   src/hooks/use-lab-orders.ts (+74)
```

## Concerns
None. Implementation matches brief exactly, all types resolve, no circular dependencies.
