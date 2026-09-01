### Task 7: UI — tarjeta "Laboratorio" (con ui-ux-pro-max)

**Files:**
- Create: `src/components/dental/ortho-lab-card.tsx`

**Interfaces:**
- Consumes: hooks (Task 6); `LAB_ORDER_KIND_LABELS`, `LAB_ORDER_STATUS_LABELS`, `labOrderStatus`, `LabOrderKind` (Task 1); `LabOrder` (Task 3); primitivos UI (`Button`, `Input`, `Label`, `Card*`).
- Produces: componente `OrthoLabCard` con props `{ salonId: string; customerId: string }`.

> **OBLIGATORIO:** invoca `ui-ux-pro-max` antes de escribir el componente. Mantén el cableado (hooks/acciones) y eleva la presentación al nivel de `ortho-payment-plan-card.tsx` (Fase 2). RSC boundary: NO importes `@/lib/salon`. Reutiliza el manejo de errores por-mutación con estado local (patrón de `consent-list.tsx` / la card de pago).

- [ ] **Step 1: Implementar** (referencia funcional — elevar con ui-ux-pro-max; conserva nombres de hooks/props/campos)

```tsx
// src/components/dental/ortho-lab-card.tsx
"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LAB_ORDER_KIND_LABELS,
  LAB_ORDER_STATUS_LABELS,
  labOrderStatus,
  type LabOrderKind,
} from "@/lib/dental/lab-orders";
import {
  useCreateLabOrder,
  useDeleteLabOrder,
  useLabOrders,
  useMarkLabOrderDelivered,
  useMarkLabOrderReceived,
} from "@/hooks/use-lab-orders";
import type { LabOrder } from "@/types/database";

export interface OrthoLabCardProps {
  salonId: string;
  customerId: string;
}

const KINDS: readonly LabOrderKind[] = ["modelo", "retenedor", "alineadores", "ortopedia", "otro"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrthoLabCard({ salonId, customerId }: OrthoLabCardProps): React.ReactElement {
  const ordersQuery = useLabOrders(salonId, customerId);
  const createOrder = useCreateLabOrder(salonId, customerId);
  const markReceived = useMarkLabOrderReceived(salonId, customerId);
  const markDelivered = useMarkLabOrderDelivered(salonId, customerId);
  const deleteOrder = useDeleteLabOrder(salonId, customerId);

  const [kind, setKind] = useState<LabOrderKind>("alineadores");
  const [labName, setLabName] = useState("");
  const [sentAt, setSentAt] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function submit(): void {
    setFormError(null);
    createOrder.mutate(
      { kind, labName: labName || null, sentAt, notes: notes || null },
      {
        onSuccess: () => {
          setLabName("");
          setNotes("");
        },
        onError: (e) => setFormError(e instanceof Error ? e.message : "No se pudo crear el pedido"),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Laboratorio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Nuevo pedido */}
        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lab-kind">Tipo</Label>
            <select
              id="lab-kind"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as LabOrderKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>{LAB_ORDER_KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-name">Laboratorio</Label>
            <Input id="lab-name" value={labName} onChange={(e) => setLabName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-sent">Fecha de envío</Label>
            <Input id="lab-sent" type="date" value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lab-notes">Notas</Label>
            <Input id="lab-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {formError !== null && (
            <p className="text-sm text-destructive sm:col-span-2">{formError}</p>
          )}
          <div className="sm:col-span-2">
            <Button onClick={submit} disabled={createOrder.isPending || sentAt.trim() === ""}>
              {createOrder.isPending ? "Creando…" : "Nuevo pedido"}
            </Button>
          </div>
        </div>

        {/* Lista */}
        {ordersQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (ordersQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pedidos de laboratorio.</p>
        ) : (
          <ul className="space-y-3">
            {(ordersQuery.data ?? []).map((o: LabOrder) => {
              const status = labOrderStatus({
                sentAt: o.sent_at,
                receivedAt: o.received_at,
                deliveredAt: o.delivered_at,
              });
              return (
                <li key={o.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {LAB_ORDER_KIND_LABELS[o.kind]}{o.lab_name ? ` · ${o.lab_name}` : ""}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {LAB_ORDER_STATUS_LABELS[status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                    Enviado {o.sent_at}
                    {o.received_at ? ` · Recibido ${o.received_at}` : ""}
                    {o.delivered_at ? ` · Entregado ${o.delivered_at}` : ""}
                  </p>
                  {o.notes && <p className="mt-1 whitespace-pre-wrap">{o.notes}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status === "enviado" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markReceived.isPending}
                        onClick={() => markReceived.mutate({ orderId: o.id, input: { date: todayIso() } })}
                      >
                        Marcar recibido
                      </Button>
                    )}
                    {status === "recibido" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markDelivered.isPending}
                        onClick={() => markDelivered.mutate({ orderId: o.id, input: { date: todayIso() } })}
                      >
                        Marcar entregado
                      </Button>
                    )}
                    <button
                      type="button"
                      className="text-xs text-destructive hover:underline"
                      onClick={() => deleteOrder.mutate(o.id)}
                    >
                      Borrar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → 0.
- [ ] **Step 3: Verificación visual** — `npm run dev`, `/ortodoncia`, paciente: (tras Task 8, que monta la pestaña) crear un pedido, marcar recibido → entregado, borrar.
- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortho-lab-card.tsx
git commit -m "feat(ortodoncia): UI tarjeta Laboratorio (ui-ux-pro-max)"
```

---

