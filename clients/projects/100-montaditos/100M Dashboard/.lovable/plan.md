

# Plan: nuevo flujo Pendiente → Caja → Cocina + arreglar realtime

## Diagnóstico de los 3 bugs

1. **Pedidos llegan duplicados a caja y cocina**: el cliente (proyecto `100 Montaditos OrderFlow`, `ClientApp.tsx` línea 84) inserta con `estado: 'recibido'`, y la cocina ya muestra ese estado. Hay que crear un estado previo `pendiente` que solo vea caja.

2. **Botón "Comenzar" en cocina no mueve el pedido**: la policy RLS `"Staff can update pedidos"` exige `has_role_for_local(uid, 'cocina', local_id)`. Esa función exige que el rol coincida con el `local_id` del pedido. Si los usuarios de prueba (`cocina@test.com`, `caja@test.com`) se crearon en `user_roles` **sin `local_id`** (NULL), el UPDATE pasa silenciosamente sin afectar filas → la UI no cambia. Hay que relajar la policy para que un rol global (sin local) también pueda actualizar.

3. **Cliente no ve cambios de estado**: `pedidos` sí está en `supabase_realtime`, pero falta `REPLICA IDENTITY FULL` para que los UPDATE emitan el payload completo. Sin eso, `payload.new.estado` puede llegar incompleto.

## Cambios a aplicar

### A) Base de datos (1 migración SQL)
- Añadir valor `'pendiente'` al enum `order_status` (antes de `recibido`).
- Cambiar el `DEFAULT` de `pedidos.estado` a `'pendiente'`.
- `ALTER TABLE pedidos REPLICA IDENTITY FULL` y `pedido_items` igual.
- Reemplazar la policy de UPDATE para aceptar también roles **sin local_id asignado** (rol global cocina/caja/admin):
  ```sql
  USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() 
               AND role IN ('caja','cocina') 
               AND (local_id IS NULL OR local_id = pedidos.local_id))
  )
  ```
- Añadir `pedido_items` a la publicación realtime (para que detalles también se sincronicen).

### B) App de staff (este proyecto)
- **`src/lib/supabase.ts`**: añadir `'pendiente'` al tipo `EstadoPedido`.
- **`src/pages/Caja.tsx`**:
  - Mostrar arriba de la tabla un panel destacado "Pendientes de comenzar" con cards grandes de pedidos `pendiente`, cada uno con botón **"Comenzar pedido"** que hace `UPDATE estado = 'recibido'`.
  - El filtro de estado incluye `pendiente`.
  - Stats: contar `pendiente` aparte como "Pendientes en caja".
- **`src/pages/Cocina.tsx`**:
  - El query carga solo `['recibido','preparando','listo']` (ya lo hace) — al añadir `pendiente` al enum, NO aparecerán en cocina hasta que caja los pase a `recibido`. ✓
  - Verificar que el botón "Comenzar" (recibido → preparando) funcione tras arreglar la policy RLS.

### C) App del cliente (proyecto `100 Montaditos OrderFlow`)
- **`src/pages/ClientApp.tsx` línea 84**: cambiar `estado: 'recibido'` → `estado: 'pendiente'`.
- **`src/components/client/OrderTracking.tsx`**: añadir `pendiente` a `STATUS_CONFIG` con label "Pago confirmado · esperando caja" y step 0; renumerar `recibido` → step 1, `preparando` → step 2, `listo` → step 3. Estado inicial `useState<OrderStatus>('pendiente')`.
- Actualizar `src/integrations/supabase/types.ts` regenerándolo (o añadir manualmente `'pendiente'` al union de `order_status`).

## Flujo final

```text
Cliente paga (Stripe)
       │
       ▼
   pendiente  ──► aparece SOLO en Caja (panel "Pendientes de comenzar")
       │
       │ caja pulsa "Comenzar pedido" tras tickar en TPV
       ▼
   recibido   ──► aparece en Cocina (columna Recibido). Cliente ve "Pedido Recibido"
       │
       ▼
   preparando ──► Cocina lo mueve. Cliente ve "En Preparación"
       │
       ▼
   listo      ──► Cocina lo marca. Cliente ve "Listo para Recoger" + confeti
       │
       ▼
   entregado  ──► Caja lo marca al entregar
```

## Lo que necesito de ti
Aprobar el plan. Una vez aprobado:
1. Aplicaré la migración SQL en este proyecto (que apunta al mismo Supabase).
2. Modificaré los archivos del staff (Caja, Cocina, supabase.ts).
3. Para los cambios del **cliente** (`ClientApp.tsx`, `OrderTracking.tsx`, `types.ts`) tendrás que abrir el otro proyecto y pedirme allí que los aplique (o me confirmas si quieres que te dé los diffs exactos para pegar tú).

