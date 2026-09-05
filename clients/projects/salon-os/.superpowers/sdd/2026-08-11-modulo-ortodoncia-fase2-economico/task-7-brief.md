### Task 7: UI — tarjeta "Plan de pago" (con ui-ux-pro-max) + montaje en /ortodoncia

**Files:**
- Create: `src/components/dental/ortho-payment-plan-card.tsx`
- Modify: `src/components/dental/ortodoncia-view.tsx` (montar el card como último bloque)

**Interfaces:**
- Consumes: hooks (Task 6); `computeInstallmentSchedule`, `computePlanBalance`, `isOverdue`, `ORTHO_PAYMENT_METHOD_LABELS`, `OrthoPaymentMethod` (Task 1); `formatMoney` (`@/lib/format`); `OrthoInstallment`, `OrthoPaymentPlan` (Task 3); UI `Button`,`Input`,`Label`,`Card`,`CardContent`,`CardHeader`,`CardTitle`.
- Produces: componente `OrthoPaymentPlanCard` con props `{ salonId: string; customerId: string }`.

> **OBLIGATORIO:** invoca la skill `ui-ux-pro-max` ANTES de escribir el componente y aplica sus pautas (jerarquía, estados, microinteracciones, responsive). El bloque de abajo es la **referencia de cableado** (hooks, acciones, datos, estados) — MANTÉN esa lógica intacta y eleva la capa visual con la skill. Enseña el resultado en dev server (Step 3) para validar que "se ve bien".

- [ ] **Step 1: Implementar el card** (referencia funcional — elevar visualmente con ui-ux-pro-max)

```tsx
// src/components/dental/ortho-payment-plan-card.tsx
"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeInstallmentSchedule,
  computePlanBalance,
  isOverdue,
  ORTHO_PAYMENT_METHOD_LABELS,
  type OrthoPaymentMethod,
} from "@/lib/dental/ortho-payments";
import { formatMoney } from "@/lib/format";
import {
  useCancelOrthoPaymentPlan,
  useCreateOrthoPaymentPlan,
  useOrthoPaymentPlan,
  usePayInstallment,
  useUnpayInstallment,
} from "@/hooks/use-ortho-payments";
import type { OrthoInstallment, OrthoPaymentPlan } from "@/types/database";

export interface OrthoPaymentPlanCardProps {
  salonId: string;
  customerId: string;
}

function eurosToCents(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OrthoPaymentPlanCard({
  salonId,
  customerId,
}: OrthoPaymentPlanCardProps): React.ReactElement {
  const planQuery = useOrthoPaymentPlan(salonId, customerId);
  const createPlan = useCreateOrthoPaymentPlan(salonId, customerId);
  const payMut = usePayInstallment(salonId, customerId);
  const unpayMut = useUnpayInstallment(salonId, customerId);
  const cancelMut = useCancelOrthoPaymentPlan(salonId, customerId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de pago</CardTitle>
      </CardHeader>
      <CardContent>
        {planQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : planQuery.data ? (
          <ActivePlan
            plan={planQuery.data.plan}
            installments={planQuery.data.installments}
            onPay={(installmentId, method) => payMut.mutate({ installmentId, input: { method } })}
            onUnpay={(id) => unpayMut.mutate(id)}
            onCancel={(planId) => cancelMut.mutate(planId)}
            mutating={payMut.isPending || unpayMut.isPending || cancelMut.isPending}
          />
        ) : (
          <NewPlanForm
            onCreate={(input) => createPlan.mutate(input)}
            creating={createPlan.isPending}
            error={createPlan.isError ? (createPlan.error as Error).message : null}
          />
        )}
      </CardContent>
    </Card>
  );
}

function NewPlanForm({
  onCreate,
  creating,
  error,
}: {
  onCreate: (input: {
    totalCents: number;
    downPaymentCents: number;
    installmentCount: number;
    dayOfMonth: number;
    startDate: string;
    notes: string | null;
  }) => void;
  creating: boolean;
  error: string | null;
}): React.ReactElement {
  const [total, setTotal] = useState("");
  const [down, setDown] = useState("");
  const [count, setCount] = useState("");
  const [day, setDay] = useState("1");
  const [start, setStart] = useState(todayIso());

  const preview = useMemo(() => {
    const totalCents = eurosToCents(total);
    const downPaymentCents = eurosToCents(down);
    const installmentCount = Number(count);
    const dayOfMonth = Number(day);
    if (
      totalCents <= 0 ||
      !Number.isInteger(installmentCount) ||
      installmentCount < 1 ||
      totalCents - downPaymentCents < installmentCount
    ) {
      return null;
    }
    return computeInstallmentSchedule({
      totalCents,
      downPaymentCents,
      installmentCount,
      dayOfMonth,
      startDate: start,
    });
  }, [total, down, count, day, start]);

  function submit(): void {
    onCreate({
      totalCents: eurosToCents(total),
      downPaymentCents: eurosToCents(down),
      installmentCount: Number(count),
      dayOfMonth: Number(day),
      startDate: start,
      notes: null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="total">Total (€)</Label>
          <Input id="total" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="down">Entrada (€)</Label>
          <Input id="down" inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="count">Nº de cuotas</Label>
          <Input id="count" type="number" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="day">Día de cobro</Label>
          <Input id="day" type="number" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="start">Fecha de inicio</Label>
          <Input id="start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      </div>

      {preview && (
        <p className="text-sm text-muted-foreground">
          {preview[0]?.seq === 0 ? `Entrada ${formatMoney(preview[0].amountCents, "EUR")} + ` : ""}
          {Number(count)} cuotas de {formatMoney(preview[preview.length - 1].amountCents, "EUR")} aprox.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={submit} disabled={creating || preview === null}>
        {creating ? "Creando…" : "Crear plan de pago"}
      </Button>
    </div>
  );
}

function ActivePlan({
  plan,
  installments,
  onPay,
  onUnpay,
  onCancel,
  mutating,
}: {
  plan: OrthoPaymentPlan;
  installments: readonly OrthoInstallment[];
  onPay: (installmentId: string, method: OrthoPaymentMethod) => void;
  onUnpay: (installmentId: string) => void;
  onCancel: (planId: string) => void;
  mutating: boolean;
}): React.ReactElement {
  const today = todayIso();
  const balance = useMemo(
    () =>
      computePlanBalance(
        installments.map((i) => ({
          status: i.status,
          dueDate: i.due_date,
          amountCents: i.amount_cents,
          paidAmountCents: i.paid_amount_cents,
        })),
        today,
      ),
    [installments, today],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>Total: <strong>{formatMoney(plan.total_cents, plan.currency)}</strong></span>
        <span>Pagado: <strong>{formatMoney(balance.paidCents, plan.currency)}</strong></span>
        <span>Pendiente: <strong>{formatMoney(balance.pendingCents, plan.currency)}</strong></span>
        {balance.overdueCount > 0 && (
          <span className="font-medium text-destructive">
            {balance.overdueCount} cuota(s) vencida(s)
          </span>
        )}
      </div>

      <ul className="divide-y rounded-lg border">
        {installments.map((i) => {
          const overdue = isOverdue({ status: i.status, dueDate: i.due_date }, today);
          return (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="tabular-nums">
                {i.seq === 0 ? "Entrada" : `Cuota ${i.seq}`} · {i.due_date} ·{" "}
                {formatMoney(i.amount_cents, plan.currency)}
              </span>
              <span className="flex items-center gap-2">
                {i.status === "pagada" ? (
                  <>
                    <span className="text-emerald-600">Pagada</span>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:underline"
                      disabled={mutating}
                      onClick={() => onUnpay(i.id)}
                    >
                      Deshacer
                    </button>
                  </>
                ) : (
                  <>
                    <span className={overdue ? "text-destructive" : "text-muted-foreground"}>
                      {overdue ? "Vencida" : "Pendiente"}
                    </span>
                    <Button size="sm" disabled={mutating} onClick={() => onPay(i.id, "efectivo")}>
                      Cobrar
                    </Button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={mutating}
          onClick={() => onCancel(plan.id)}
        >
          Cancelar plan
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Métodos de cobro: {Object.values(ORTHO_PAYMENT_METHOD_LABELS).join(" · ")}. (El botón "Cobrar"
        usa efectivo por defecto en esta referencia; en la versión pulida con ui-ux-pro-max, ofrece un
        selector de método antes de confirmar.)
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Montar el card en `ortodoncia-view.tsx`**

Importar `OrthoPaymentPlanCard` y renderizarlo como último bloque, tras el de "Consentimiento de ortodoncia" (dentro del `<div className="space-y-6">` que envuelve la vista):

```tsx
import { OrthoPaymentPlanCard } from "@/components/dental/ortho-payment-plan-card";
// ...
      {/* Plan de pago */}
      <OrthoPaymentPlanCard salonId={salonId} customerId={customerId} />
```

- [ ] **Step 3: Typecheck + verificación visual**

Run: `npx tsc --noEmit` → 0 errores.
Run: `npm run dev`, ir a `/ortodoncia`, elegir un paciente de Biodental. Crear un plan (p. ej. 3000 total, 600 entrada, 24 cuotas, día 5), comprobar el calendario, cobrar una cuota, deshacerla, ver saldo/morosidad. Confirmar que "se ve bien" (resultado de ui-ux-pro-max).

- [ ] **Step 4: Commit**

```bash
git add src/components/dental/ortho-payment-plan-card.tsx src/components/dental/ortodoncia-view.tsx
git commit -m "feat(ortodoncia): UI plan de pago (ui-ux-pro-max) en /ortodoncia"
```

---

