// Presentación del modelo de 3 FASES de una cita (aplicación · exposición · post-exposición),
// compartida por la agenda del profesional (`EmployeeCalendar`) y la del salón
// (`AdminEmployeeCalendar`). Pinta las ventanas `occupied_range` que trae `appointment_blocks`
// TAL CUAL las calculó el servidor.
//
// Objetivo de la subtarea: hacer LEGIBLE que dos citas se solapen. En peluquería/estética,
// durante la "exposición" el cliente espera y el profesional atiende a otra persona, así que un
// solape NO es un error. Por eso:
//   · `AppointmentPhases` desglosa los tramos ocupados de UNA cita (si los tiene);
//   · `PhaseModelNote` explica el modelo una vez por pantalla, en tono informativo (no de alerta).
//
// Si una cita no tiene tramos, estos componentes no pintan nada: la cita se muestra tal cual
// (degradación pedida por la subtarea, «si no existe, mostrar las citas tal cual»). El color
// nunca es el ÚNICO portador de significado: cada tramo lleva SIEMPRE su etiqueta de texto.

import { Info } from 'lucide-react';
import type { AppointmentBlock, AppointmentPhaseKey } from '@/lib/appointment-blocks';
import { formatTimeRange } from '@/lib/employee-agenda';

// Acento cromático por fase (solo decorativo: el significado lo lleva la etiqueta de texto).
// Se usan tokens del tema para respetar modo claro/oscuro y contraste.
const PHASE_DOT_CLASS: Record<AppointmentPhaseKey, string> = {
  application: 'bg-primary',
  exposure: 'bg-muted-foreground/50',
  post_exposure: 'bg-primary/60',
  other: 'bg-muted-foreground/30',
};

/**
 * Desglose de los tramos OCUPADOS de una cita. Renderiza una lista de "chips" (uno por tramo)
 * con la etiqueta de la fase y, si el rango era parseable, su franja horaria `HH:mm – HH:mm`.
 * No pinta nada si la cita no tiene tramos (la cita se muestra tal cual en el componente padre).
 */
export function AppointmentPhases({ blocks }: { blocks: AppointmentBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tramos ocupados de la cita">
      {blocks.map((block) => {
        const range = block.occupied
          ? formatTimeRange(block.occupied.startsAt, block.occupied.endsAt)
          : null;
        // Lectura de lazarillo clara: "Aplicación, 09:00 – 09:15" (o solo la fase si no hay rango).
        const label = range ? `${block.phaseLabel}, ${range}` : block.phaseLabel;

        return (
          <li
            key={block.id}
            aria-label={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${PHASE_DOT_CLASS[block.phaseKey]}`}
              aria-hidden="true"
            />
            <span aria-hidden="true" className="font-medium text-foreground">
              {block.phaseLabel}
            </span>
            {range && (
              <span aria-hidden="true" className="text-muted-foreground">
                {range}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Nota informativa (una vez por pantalla) que explica el modelo de 3 fases y que los solapes
 * de horario son ESPERADOS, no un error. Se pinta solo cuando hay tramos que mostrar, para no
 * añadir ruido a salones que todavía no usan `appointment_blocks`.
 *
 * `role="note"` (no `alert`): es contexto, no una incidencia que exija acción.
 */
export function PhaseModelNote() {
  return (
    <p
      role="note"
      className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
    >
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>
        Cada servicio se divide en tramos (aplicación, exposición y post). Durante la exposición el
        profesional puede atender otra cita, por eso verás <span className="font-medium">horarios
        solapados</span>: es normal, no es un error.
      </span>
    </p>
  );
}
