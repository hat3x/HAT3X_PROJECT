import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Nota de INMUTABILIDAD de los registros de facturación (sub-7).
 *
 * Comunica, de forma calmada y consistente con el sistema de diseño, que tanto las
 * facturas como las ventas/tickets son REGISTROS LEGALES: no se editan ni se
 * borran. La corrección de una factura no es un "editar", sino emitir una FACTURA
 * RECTIFICATIVA (flujo aparte, aquí solo se enuncia, no se construye).
 *
 * Es SOLO informativa: la inmutabilidad real la garantiza el motor (trigger de BD
 * que aborta UPDATE/DELETE sobre `pos_invoices`). Esta nota evita que el usuario
 * busque un botón de "editar/eliminar" que, por diseño, no existe ni debe existir.
 */
type ImmutabilityVariant = "invoice" | "sale";

interface ImmutabilityNoteProps {
  /** Ajusta el texto al contexto: libro de facturas o histórico de ventas. */
  variant: ImmutabilityVariant;
  className?: string;
}

const NOTE_COPY: Record<ImmutabilityVariant, { title: string; body: string }> = {
  invoice: {
    title: "Registro legal inalterable",
    body: "Las facturas no se editan ni se borran una vez emitidas: cada una queda encadenada (Veri*factu). Para corregir una factura se emite una factura rectificativa; nunca se modifica la original.",
  },
  sale: {
    title: "Registro de solo lectura",
    body: "Una venta cerrada es un registro contable: no se edita ni se borra. Si necesitas corregir el importe facturado, se hace emitiendo una factura rectificativa desde la factura correspondiente, no alterando este ticket.",
  },
};

export function ImmutabilityNote({
  variant,
  className,
}: ImmutabilityNoteProps): React.ReactElement {
  const copy = NOTE_COPY[variant];

  return (
    <div
      role="note"
      className={cn(
        "flex animate-fade-up items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 [animation-delay:40ms]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-accent text-primary shadow-xs"
      >
        <ShieldCheck className="h-4 w-4" />
      </span>
      <div className="space-y-0.5">
        <p className="text-sm font-semibold tracking-tight">{copy.title}</p>
        <p className="max-w-prose text-sm text-muted-foreground">{copy.body}</p>
      </div>
    </div>
  );
}
