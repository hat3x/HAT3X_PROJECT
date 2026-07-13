"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { ExceptionsEditor } from "@/app/(dashboard)/ajustes/horarios/exceptions-editor";
import { ScheduleEditor } from "@/app/(dashboard)/ajustes/horarios/schedule-editor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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

/**
 * Vista de horarios de /ajustes.
 *
 * Selecciona un profesional y edita, para él, su horario semanal recurrente y
 * sus excepciones puntuales (días libres u horario especial). El horario de
 * cada profesional es independiente, por eso todo se scopea por el profesional
 * elegido en el selector superior.
 */
export function HorariosView({
  salonId,
}: HorariosViewProps): React.ReactElement {
  const { data: professionals, isPending, isError, error } = useProfessionals(
    salonId,
    "",
  );
  const [selectedId, setSelectedId] = useState("");

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
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Horarios</h2>
        <p className="text-sm text-muted-foreground">
          Define el horario semanal de cada profesional y sus excepciones
          puntuales.
        </p>
      </div>

      {isPending ? (
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
        <div className="rounded-md border py-12 text-center">
          <CalendarClock className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aún no hay personal. Da de alta profesionales en Ajustes → Personal
            para configurar sus horarios.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
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
      )}
    </div>
  );
}
