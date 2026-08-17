"use client";

import { useState, type FormEvent } from "react";
import { CalendarOff, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateException,
  useDeleteException,
  useScheduleExceptions,
} from "@/hooks/use-schedules";
import { exceptionSchema, type ExceptionInput } from "@/lib/validations/schedule";
import type { ScheduleException } from "@/types/database";

interface ExceptionsEditorProps {
  salonId: string;
  professionalId: string;
}

/** `HH:MM:SS` → `HH:MM`; `null` → cadena vacía. */
function toTimeInput(value: string | null): string {
  return value === null ? "" : value.slice(0, 5);
}

/** `YYYY-MM-DD` → `DD/MM/YYYY` para mostrar. */
function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

/**
 * Editor de excepciones de horario de un profesional: días libres u horario
 * especial para una fecha concreta. Lista las excepciones y permite añadir y
 * eliminar. La regla `end_time > start_time` del horario especial se valida en
 * el esquema Zod (cliente y servidor).
 */
export function ExceptionsEditor({
  salonId,
  professionalId,
}: ExceptionsEditorProps): React.ReactElement {
  const { data, isPending, isError, error } = useScheduleExceptions(
    salonId,
    professionalId,
  );
  const deleteMutation = useDeleteException(salonId, professionalId);
  const [createOpen, setCreateOpen] = useState(false);

  const deleteError =
    deleteMutation.error instanceof Error ? deleteMutation.error.message : null;

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva excepción
          </Button>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nueva excepción</DialogTitle>
              <DialogDescription>
                Marca un día libre o define un horario especial para una fecha
                concreta.
              </DialogDescription>
            </DialogHeader>
            <ExceptionForm
              salonId={salonId}
              professionalId={professionalId}
              onCancel={() => setCreateOpen(false)}
              onCreated={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {deleteError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden sm:table-cell">Detalle</TableHead>
              <TableHead className="w-[1%]">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-destructive">
                  {error instanceof Error
                    ? error.message
                    : "Error al cargar las excepciones"}
                </TableCell>
              </TableRow>
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <CalendarOff className="h-6 w-6" />
                  </span>
                  <p className="text-sm text-muted-foreground">
                    Sin excepciones. El profesional sigue su horario semanal.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              data.map((exception) => (
                <ExceptionRow
                  key={exception.id}
                  exception={exception}
                  deleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables === exception.id
                  }
                  onDelete={() => deleteMutation.mutate(exception.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface ExceptionRowProps {
  exception: ScheduleException;
  deleting: boolean;
  onDelete: () => void;
}

/** Fila de la tabla de excepciones. */
function ExceptionRow({
  exception,
  deleting,
  onDelete,
}: ExceptionRowProps): React.ReactElement {
  const isDayOff = !exception.is_available;
  return (
    <TableRow>
      <TableCell className="font-medium tabular-nums">
        {formatDate(exception.exception_date)}
      </TableCell>
      <TableCell>
        <Badge variant={isDayOff ? "outline" : "secondary"}>
          {isDayOff ? "Día libre" : "Horario especial"}
        </Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {isDayOff
          ? (exception.reason ?? "—")
          : `${toTimeInput(exception.start_time)}–${toTimeInput(
              exception.end_time,
            )}${exception.reason !== null ? ` · ${exception.reason}` : ""}`}
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Eliminar excepción del ${formatDate(
              exception.exception_date,
            )}`}
            disabled={deleting}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface ExceptionFormProps {
  salonId: string;
  professionalId: string;
  onCancel: () => void;
  onCreated: () => void;
}

/** Formulario de alta de una excepción de horario. */
function ExceptionForm({
  salonId,
  professionalId,
  onCancel,
  onCreated,
}: ExceptionFormProps): React.ReactElement {
  const createMutation = useCreateException(salonId, professionalId);

  const [date, setDate] = useState("");
  const [available, setAvailable] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("14:00");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const input: ExceptionInput = {
      professional_id: professionalId,
      exception_date: date,
      is_available: available,
      start_time: available ? startTime : undefined,
      end_time: available ? endTime : undefined,
      reason,
    };

    const parsed = exceptionSchema.safeParse(input);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Datos no válidos");
      return;
    }

    setFormError(null);
    createMutation.mutate(input, { onSuccess: onCreated });
  }

  const mutationError =
    createMutation.error instanceof Error ? createMutation.error.message : null;

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 pt-1">
      <div className="grid gap-2">
        <Label htmlFor="exception_date">Fecha *</Label>
        <Input
          id="exception_date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="exception_type">Tipo *</Label>
        <Select
          value={available ? "special" : "off"}
          onValueChange={(value) => setAvailable(value === "special")}
        >
          <SelectTrigger id="exception_type" aria-label="Tipo de excepción">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Día libre (no disponible)</SelectItem>
            <SelectItem value="special">Horario especial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {available ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="exception_start">Inicio *</Label>
            <Input
              id="exception_start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exception_end">Fin *</Label>
            <Input
              id="exception_end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="exception_reason">Motivo</Label>
        <Input
          id="exception_reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Vacaciones, formación, festivo…"
        />
      </div>

      {formError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : mutationError !== null ? (
        <p role="alert" className="text-sm text-destructive">
          {mutationError}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Guardando…" : "Añadir excepción"}
        </Button>
      </DialogFooter>
    </form>
  );
}
