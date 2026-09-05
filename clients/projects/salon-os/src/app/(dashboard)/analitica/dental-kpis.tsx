import { CalendarX, FileCheck2, PhoneCall, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import type { DentalUnscheduledWork } from "@/lib/metrics";
import {
  computeAcceptanceRate,
  computeNoShowRate,
  type AppointmentOutcomeCounts,
  type TreatmentPlanStatusCounts,
} from "@/lib/metrics/dental";

/**
 * Los indicadores que mira quien dirige una clínica (B5).
 *
 * El resto de `/analitica` cuenta lo que cuenta un comercio —facturación,
 * tickets, ticket medio— y eso a un director de clínica le dice poco. Estas
 * cuatro cifras responden sus preguntas: cuántos presupuestos cuajan, a quién
 * hay que llamar, cuánto trabajo vendido está parado y cuántos sillones se
 * quedan vacíos.
 *
 * Las definiciones —qué cuenta como aceptado, sobre qué se divide una
 * ausencia— viven en `@/lib/metrics/dental`, probadas. Aquí solo se presentan.
 */

export interface DentalKpisProps {
  planCounts: TreatmentPlanStatusCounts;
  outcomes: AppointmentOutcomeCounts;
  unscheduled: DentalUnscheduledWork;
  currency: string;
}

/**
 * Una tasa nula NO es un cero.
 *
 * "0 %" de aceptación afirma que se presentaron presupuestos y los rechazaron
 * todos. Si en realidad no se presentó ninguno, es una conclusión falsa — y de
 * las caras, porque lleva a revisar precios que nadie ha rechazado.
 */
function percent(rate: number | null): string {
  return rate === null ? "Sin datos" : `${Math.round(rate * 100)} %`;
}

export function DentalKpis({
  planCounts,
  outcomes,
  unscheduled,
  currency,
}: DentalKpisProps): React.ReactElement {
  const acceptance = computeAcceptanceRate(planCounts);
  const noShow = computeNoShowRate(outcomes);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Indicadores de clínica</h2>
        <p className="text-sm text-muted-foreground">
          Lo que no cuenta un panel de comercio: presupuestos, cartera y ausencias.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<FileCheck2 className="h-4 w-4" aria-hidden="true" />}
          title="Aceptación de presupuestos"
          value={percent(acceptance.rate)}
          detail={
            acceptance.presented === 0
              ? "Ningún presupuesto presentado en este periodo"
              : `${acceptance.accepted} aceptados de ${acceptance.presented} presentados`
          }
        />

        {/* Se separa de los rechazados a propósito: "aún no ha contestado" no
            es "dijo que no", y esta es la única cifra sobre la que se puede
            actuar hoy mismo. */}
        <Kpi
          icon={<PhoneCall className="h-4 w-4" aria-hidden="true" />}
          title="Esperando respuesta"
          value={String(acceptance.pending)}
          detail={
            acceptance.pending === 0
              ? "Nadie pendiente de contestar"
              : "Presupuestos presentados y sin contestar"
          }
        />

        <Kpi
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          title="Vendido sin agendar"
          value={formatMoney(unscheduled.valueCents, currency)}
          detail={
            unscheduled.items === 0
              ? "Todo lo aceptado tiene fecha"
              : `${unscheduled.items} tratamientos · ${unscheduled.patients} pacientes`
          }
        />

        <Kpi
          icon={<CalendarX className="h-4 w-4" aria-hidden="true" />}
          title="Ausencias"
          value={percent(noShow)}
          detail={
            noShow === null
              ? "Aún no hay citas pasadas en este periodo"
              : `${outcomes.noShow} de ${outcomes.noShow + outcomes.completed} citas atendidas`
          }
        />
      </div>
    </section>
  );
}

function Kpi({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <CardDescription className="text-xs">{detail}</CardDescription>
      </CardContent>
    </Card>
  );
}
