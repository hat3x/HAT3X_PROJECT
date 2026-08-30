"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Clock } from "lucide-react";

import { ExceptionsEditor } from "@/app/(dashboard)/ajustes/horarios/exceptions-editor";
import { SalonScheduleEditor } from "@/app/(dashboard)/ajustes/horarios/salon-schedule-editor";
import { SalonExceptionsEditor } from "./salon-exceptions-editor";
import { ScheduleEditor } from "@/app/(dashboard)/ajustes/horarios/schedule-editor";
import { SectionHeader } from "@/app/(dashboard)/ajustes/section-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PillTabs } from "@/components/ui/pill-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfessionals } from "@/hooks/use-professionals";

interface HorariosViewProps {
  salonId: string;
}

const HORARIO_TABS = [
  { id: "clinica", label: "Horario de la clínica" },
  { id: "profesional", label: "Horarios por profesional" },
] as const;

/**
 * Vista de horarios de /ajustes.
 *
 * Selecciona un profesional y edita, para él, su horario semanal recurrente y
 * sus excepciones puntuales (días libres u horario especial). El horario de
 * cada profesional es independiente, por eso todo se scopea por el profesional
 * elegido en el selector superior.
 */
/** Hoy en local `YYYY-MM-DD`: una excepción pasada ya no cambia ninguna agenda. */
function hoyLocal(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function HorariosView({
  salonId,
}: HorariosViewProps): React.ReactElement {
  const { data: professionals, isPending, isError, error } = useProfessionals(
    salonId,
    "",
  );
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<string>("clinica");

  // Selecciona el primer profesional en cuanto llega la lista (o si el
  // seleccionado deja de existir, p. ej. tras eliminarlo en otra pestaña).
  useEffect(() => {
    if (professionals === undefined || professionals.length === 0) {
      return;
    }
    const stillExists = professionals.some((p) => p.id === selectedId);
    if (!stillExists) {
      setSelectedId(professionals[0]!.id);
    }
  }, [professionals, selectedId]);

  return (
    <div>
      <SectionHeader
        icon={Clock}
        title="Horarios"
        description="Define el horario de apertura de la clínica y el horario semanal de cada profesional."
      />

      <PillTabs
        tabs={HORARIO_TABS}
        active={tab}
        onChange={setTab}
        ariaLabel="Tipos de horario"
        className="mb-6"
      />

      {tab === "clinica" ? (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="text-lg">Horario de la clínica</CardTitle>
            <CardDescription>
              Horario de apertura del negocio. La recepcionista solo ofrece citas
              dentro de estas horas; se combina con el horario de cada profesional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalonScheduleEditor salonId={salonId} />
          </CardContent>
        </Card>
      ) : null}

      {/* Días sueltos. Va justo debajo del horario semanal porque es donde se
          busca cuando el semanal no encaja: "esta tarde concreta sí abrimos".
          Antes, ese caso obligaba a abrir todos los martes del año. */}
      {tab === "clinica" ? (
        <Card className="mt-4 animate-fade-up">
          <CardHeader>
            <CardTitle className="text-lg">Días sueltos</CardTitle>
            <CardDescription>
              Excepciones para una fecha concreta: abrir un turno extra o cerrar por vacaciones.
              Vale tanto para la agenda como para la recepcionista.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SalonExceptionsEditor salonId={salonId} today={hoyLocal()} />
          </CardContent>
        </Card>
      ) : null}

      {tab === "profesional" ? (
        isPending ? (
          <div className="grid gap-4">
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Error al cargar el personal"}
          </p>
        ) : !professionals || professionals.length === 0 ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 px-6 py-14 text-center shadow-xs">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarClock className="h-6 w-6" />
            </span>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Aún no hay personal. Da de alta profesionales en Ajustes → Personal
              para configurar sus horarios.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 animate-fade-up">
            <div className="grid max-w-sm gap-2">
              <Label htmlFor="professional">Profesional</Label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger id="professional" aria-label="Profesional">
                  <SelectValue placeholder="Selecciona un profesional" />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((professional) => (
                    <SelectItem key={professional.id} value={professional.id}>
                      {professional.full_name}
                      {professional.active ? "" : " (inactivo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedId !== "" ? (
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Horario semanal</CardTitle>
                    <CardDescription>
                      Tramos recurrentes por día. Añade varios tramos en un mismo
                      día para cubrir turno de mañana y tarde.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScheduleEditor
                      key={selectedId}
                      salonId={salonId}
                      professionalId={selectedId}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Excepciones</CardTitle>
                    <CardDescription>
                      Días libres u horario especial para fechas concretas, que
                      prevalecen sobre el horario semanal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ExceptionsEditor
                      key={selectedId}
                      salonId={salonId}
                      professionalId={selectedId}
                    />
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
