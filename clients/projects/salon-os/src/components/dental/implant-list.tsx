import { AlertTriangle, Phone } from "lucide-react";

import type { ImplantRow } from "@/lib/queries/implants";
import { cn } from "@/lib/utils";

/**
 * Los implantes de un paciente — y, en modo alerta, a quién afecta un lote.
 *
 * La misma lista responde a las dos preguntas del Reglamento (UE) 2017/745. En
 * la segunda, lo que se hace después de mirarla es LLAMAR, así que con
 * `showCustomer` el teléfono aparece marcable: obligar a abrir la ficha de cada
 * paciente convierte diez minutos de trabajo en una tarde.
 *
 * El lote se muestra SIEMPRE, incluso cuando falta. "Sin lote" no es un hueco
 * en blanco: significa que ese implante no aparecerá en ninguna búsqueda y que
 * alguien tendrá que ir a buscar la caja original. Conviene saberlo hoy y no el
 * día de la alerta.
 */

export interface ImplantListProps {
  implants: ImplantRow[];
  /** Modo alerta: añade paciente y teléfono a cada fila. */
  showCustomer?: boolean;
}

function medidas(i: ImplantRow): string | null {
  const d = i.diameter_mm === null ? null : `Ø ${String(i.diameter_mm).replace(".", ",")} mm`;
  const l = i.length_mm === null ? null : `${String(i.length_mm).replace(".", ",")} mm`;
  const partes = [d, l].filter((x): x is string => x !== null);
  return partes.length === 0 ? null : partes.join(" · ");
}

export function ImplantList({ implants, showCustomer = false }: ImplantListProps): React.ReactElement {
  if (implants.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay implantes registrados.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {implants.map((i) => {
        const m = medidas(i);
        return (
          <li
            key={i.id}
            data-testid={`implante-${i.id}`}
            className="flex flex-col gap-1 rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums">Diente {i.fdi_code}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  i.lot === null
                    ? "bg-destructive/10 text-destructive"
                    : "bg-accent text-accent-foreground",
                )}
              >
                {i.lot === null ? (
                  <>
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Sin lote
                  </>
                ) : (
                  <>Lote {i.lot}</>
                )}
              </span>
            </div>

            <p className="text-sm">
              {i.brand ?? "Marca sin indicar"}
              {i.ref === null ? "" : ` · ${i.ref}`}
              {m === null ? "" : ` · ${m}`}
            </p>

            <p className="text-xs text-muted-foreground">
              Colocado el {new Date(i.placed_at).toLocaleDateString("es-ES")}
              {i.gtin === null ? "" : ` · GTIN ${i.gtin}`}
            </p>

            {showCustomer && i.customer != null ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{i.customer.full_name ?? "Paciente"}</span>
                {i.customer.phone === null ? (
                  <span className="text-xs text-muted-foreground">Sin teléfono</span>
                ) : (
                  <a
                    href={`tel:${i.customer.phone}`}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {i.customer.phone}
                  </a>
                )}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
