"use client";

import { useState } from "react";
import { Clock3, Loader2, Phone, Plus, Trash2, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCustomerSearch } from "@/hooks/use-customers";
import { useAddToWaitlist, useSetWaitlistStatus, useWaitlist } from "@/hooks/use-waitlist";
import type { WaitlistEntryWithCustomer } from "@/lib/queries/waitlist";
import { waitlistEntrySchema } from "@/lib/validations/waitlist";
import type { WaitlistStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// ListaEsperaView — quién está esperando un hueco.
//
// La pantalla está pensada para el momento en que suena el teléfono y alguien
// cancela: lo primero que hay que ver es a quién llamar y su número, no un
// formulario. Por eso el teléfono va en la tabla, marcable de un toque, y no
// escondido tras un detalle.
// ---------------------------------------------------------------------------

interface ListaEsperaViewProps {
  salonId: string;
}

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  esperando: "Esperando",
  avisado: "Avisado",
  agendado: "Agendado",
  descartado: "Descartado",
};

const DIAS = ["D", "L", "M", "X", "J", "V", "S"];

/** "L X · 09:00–14:00" en pocas palabras. */
function describePreferencias(entry: WaitlistEntryWithCustomer): string {
  const dias =
    entry.weekdays.length === 0
      ? "cualquier día"
      : entry.weekdays
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DIAS[d])
          .join(" ");

  const franja =
    entry.from_time === null && entry.to_time === null
      ? "a cualquier hora"
      : `${(entry.from_time ?? "").slice(0, 5) || "…"}–${(entry.to_time ?? "").slice(0, 5) || "…"}`;

  return `${dias} · ${franja}`;
}

/** Cuánto lleva esperando, en lenguaje llano. */
function esperaDesde(createdAt: string): string {
  const dias = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "1 día";
  if (dias < 30) return `${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "1 mes" : `${meses} meses`;
}

/**
 * Alta en la lista de espera.
 *
 * Se pide lo mínimo: quién, y cuándo le viene bien. Todo lo demás se deja en
 * blanco a propósito — en esta lista, blanco significa «me da igual», y quien no
 * pone restricciones es el candidato más fácil de encajar. Un formulario que
 * exigiera rellenarlo todo produciría listas de gente imposible de colocar.
 */
function AltaDialog({
  salonId,
  open,
  onOpenChange,
}: {
  salonId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const addMutation = useAddToWaitlist(salonId);

  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<{ id: string; full_name: string } | null>(null);
  const [dias, setDias] = useState<number[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [prioridad, setPrioridad] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: resultados } = useCustomerSearch(salonId, busqueda);

  function alternarDia(dia: number): void {
    setDias((prev) => (prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]));
  }

  function guardar(): void {
    if (elegido === null) return;
    setError(null);

    const candidato = {
      customerId: elegido.id,
      weekdays: dias,
      fromTime: desde === "" ? null : desde,
      toTime: hasta === "" ? null : hasta,
      priority: prioridad ? 10 : 0,
    };

    // Mismo esquema que valida el servidor: lo que aquí pasa, allí también.
    const parsed = waitlistEntrySchema.safeParse(candidato);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }

    addMutation.mutate(parsed.data, {
      onSuccess: () => {
        onOpenChange(false);
        setBusqueda("");
        setElegido(null);
        setDias([]);
        setDesde("");
        setHasta("");
        setPrioridad(false);
      },
      onError: (err: unknown) =>
        setError(err instanceof Error ? err.message : "No se pudo apuntar."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apuntar a la lista de espera</DialogTitle>
          <DialogDescription>
            Lo que dejes en blanco significa «me da igual», y eso hace más fácil encontrarle
            hueco.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="espera-paciente">Paciente</Label>
            {elegido === null ? (
              <>
                <Input
                  id="espera-paciente"
                  placeholder="Busca por nombre o teléfono"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
                {resultados !== undefined && resultados.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-md border">
                    {resultados.slice(0, 8).map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => setElegido({ id: c.id, full_name: c.full_name })}
                        >
                          {c.full_name}
                          {c.phone !== null && (
                            <span className="ml-2 text-muted-foreground">{c.phone}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium">{elegido.full_name}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setElegido(null)}>
                  Cambiar
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Días que le vienen bien</Label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((dia) => (
                <Button
                  key={dia}
                  type="button"
                  size="sm"
                  variant={dias.includes(dia) ? "default" : "outline"}
                  onClick={() => alternarDia(dia)}
                  aria-pressed={dias.includes(dia)}
                >
                  {DIAS[dia]}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Sin marcar ninguno, le vale cualquier día.
            </p>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="espera-desde">Desde</Label>
              <Input
                id="espera-desde"
                type="time"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="espera-hasta">Hasta</Label>
              <Input
                id="espera-hasta"
                type="time"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="espera-prioridad">Con prioridad</Label>
              <p className="text-xs text-muted-foreground">
                Se le ofrece antes que al resto. Para urgencias o tratamientos a medias.
              </p>
            </div>
            <Switch id="espera-prioridad" checked={prioridad} onCheckedChange={setPrioridad} />
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={guardar}
            disabled={elegido === null || addMutation.isPending}
            className="gap-1.5"
          >
            {addMutation.isPending && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            Apuntar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ListaEsperaView({ salonId }: ListaEsperaViewProps): React.ReactElement {
  const { data: entries, isLoading } = useWaitlist(salonId);
  const statusMutation = useSetWaitlistStatus(salonId);
  const [error, setError] = useState<string | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);

  function cambiarEstado(entryId: string, status: WaitlistStatus): void {
    setError(null);
    statusMutation.mutate(
      { entryId, status },
      {
        onError: (err: unknown) =>
          setError(err instanceof Error ? err.message : "No se pudo actualizar la entrada."),
      },
    );
  }

  const vivas = (entries ?? []).filter(
    (entry) => entry.status === "esperando" || entry.status === "avisado",
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lista de espera</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Quién quiere adelantar su cita. Cuando alguien cancela, aquí está a quién llamar.
          </p>
        </div>
        <Button type="button" className="gap-1.5" onClick={() => setAltaAbierta(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Apuntar a alguien
        </Button>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : vivas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Clock3 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">No hay nadie esperando</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Cuando un paciente diga «avísame si sale algo antes», apúntalo aquí y no se perderá
              el próximo hueco que quede libre.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Cuándo le viene bien</TableHead>
                  <TableHead>Esperando</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vivas.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {entry.customer?.full_name ?? "—"}
                        {entry.priority > 0 && <Badge>Prioridad</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.customer?.phone == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <a
                          href={`tel:${entry.customer.phone}`}
                          className="flex items-center gap-1.5 text-sm hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          {entry.customer.phone}
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {describePreferencias(entry)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {esperaDesde(entry.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "avisado" ? "default" : "secondary"}>
                        {STATUS_LABELS[entry.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="gap-1.5"
                          onClick={() => cambiarEstado(entry.id, "agendado")}
                          disabled={statusMutation.isPending}
                          aria-label={`Marcar como agendado a ${entry.customer?.full_name ?? "el paciente"}`}
                        >
                          {statusMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          Ya tiene cita
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => cambiarEstado(entry.id, "descartado")}
                          disabled={statusMutation.isPending}
                          aria-label={`Quitar de la lista a ${entry.customer?.full_name ?? "el paciente"}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AltaDialog salonId={salonId} open={altaAbierta} onOpenChange={setAltaAbierta} />
    </div>
  );
}
