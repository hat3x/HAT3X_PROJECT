"use client";

import { useMemo } from "react";
import { CalendarX2, Clock, TriangleAlert, User } from "lucide-react";

import { AppointmentStatusBadge } from "@/components/appointments/appointment-status";
import { Skeleton } from "@/components/ui/skeleton";
import { buildMobileAgenda, formatHourLabel } from "@/lib/agenda/mobile-day";
import { formatTimeInZone } from "@/lib/booking/timezone";
import type { AppointmentWithDetails } from "@/lib/queries/appointments";
import { cn } from "@/lib/utils";

/**
 * La agenda del día en el móvil.
 *
 * Sustituye a la parrilla por profesional en pantalla estrecha, donde aquella
 * no era incómoda sino ilegible: las citas salían como manchas de color sin
 * texto, las columnas se cortaban a media palabra y la hora se solapaba con el
 * nombre. La causa es estructural —una rejilla de N columnas pide ~200 px por
 * columna y la altura de la tarjeta la marca la duración, así que un cuarto de
 * hora mide 20 px—, y por eso no se arregla afinando: se cambia de forma.
 *
 * La lista responde a otra pregunta. La parrilla contesta "¿qué huecos
 * quedan?"; esta contesta "¿qué toca ahora?", que es lo que se mira de pie, con
 * el teléfono en una mano. Cada fila lleva lo que en las capturas no se leía:
 * hora, quién viene, qué se le hace, cuánto dura y con quién.
 *
 * Toda la fila es el área de toque —no un botón pequeño dentro de ella—, para
 * que se abra al primer intento y con el pulgar.
 */

export interface AgendaMobileDayProps {
  appointments: AppointmentWithDetails[];
  timezone: string;
  isLoading: boolean;
  isError: boolean;
  onSelectAppointment: (appointment: AppointmentWithDetails) => void;
}

export function AgendaMobileDay({
  appointments,
  timezone,
  isLoading,
  isError,
  onSelectAppointment,
}: AgendaMobileDayProps): React.ReactElement {
  const groups = useMemo(
    () => buildMobileAgenda(appointments, timezone),
    [appointments, timezone],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // Un error NO puede parecerse a un día libre: alguien daría por vacía una
  // agenda llena y se marcharía del salón.
  if (isError) {
    return (
      <Estado
        icon={<TriangleAlert className="h-5 w-5" aria-hidden="true" />}
        titulo="No se pudo cargar la agenda"
        detalle="Comprueba la conexión y vuelve a intentarlo."
        tono="error"
      />
    );
  }

  if (groups.length === 0) {
    return (
      <Estado
        icon={<CalendarX2 className="h-5 w-5" aria-hidden="true" />}
        titulo="No hay citas este día"
        detalle="El día está libre. Puedes crear una cita desde el botón de arriba."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 px-3 pb-24 pt-2">
      {groups.map((group) => (
        <section key={group.hourMin} className="flex flex-col gap-2">
          <header className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-semibold tabular-nums text-muted-foreground">
              {formatHourLabel(group.hourMin)}
            </h3>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {group.entries.length} {group.entries.length === 1 ? "cita" : "citas"}
            </span>
          </header>

          <ul className="flex flex-col gap-2">
            {group.entries.map((entry) => {
              const { appointment: a } = entry;
              const cancelada = a.status === "cancelled";
              const color = a.professional?.color ?? "hsl(var(--muted-foreground))";
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAppointment(a)}
                    className={cn(
                      // min-h-16 ≈ 64 px: por encima del mínimo táctil cómodo,
                      // que es donde fallaba la parrilla con sus tarjetas de
                      // 20 px para una cita de cuarto de hora.
                      "flex min-h-16 w-full items-stretch gap-3 overflow-hidden rounded-xl border bg-card p-3 text-left",
                      "transition-transform duration-100 active:scale-[0.99]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      cancelada && "opacity-60",
                    )}
                  >
                    <span
                      className="w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />

                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[13px] font-semibold tabular-nums">
                          {formatTimeInZone(a.starts_at, timezone)}–
                          {formatTimeInZone(a.ends_at, timezone)}
                        </span>
                        <AppointmentStatusBadge
                          status={a.status}
                          className="px-1.5 py-0 text-[10px] leading-[16px]"
                        />
                      </span>

                      {/* El nombre no se trunca a media palabra: si no cabe en
                          una línea, baja a la siguiente. Saber quién viene es
                          justo lo que se venía a mirar. */}
                      <span
                        className={cn(
                          "text-[15px] font-semibold leading-tight",
                          cancelada && "line-through",
                        )}
                      >
                        {a.customer?.full_name ?? "Cliente"}
                      </span>

                      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-tight text-muted-foreground">
                        <span className="truncate">{a.service?.name ?? "Servicio"}</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {entry.durationMin} min
                        </span>
                      </span>

                      <span className="inline-flex items-center gap-1 text-[12.5px] font-medium leading-tight">
                        <User className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
                        {a.professional?.full_name ?? "Sin asignar"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Estado({
  icon,
  titulo,
  detalle,
  tono,
}: {
  icon: React.ReactNode;
  titulo: string;
  detalle: string;
  tono?: "error";
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full",
          tono === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-accent text-accent-foreground",
        )}
      >
        {icon}
      </span>
      <p className="font-medium">{titulo}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{detalle}</p>
    </div>
  );
}
