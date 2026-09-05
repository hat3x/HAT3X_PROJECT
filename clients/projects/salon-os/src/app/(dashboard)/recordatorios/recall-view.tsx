"use client";

import { useState } from "react";
import { BellRing, Phone, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePatientsDueForRecall, useSendRecallReminder } from "@/hooks/use-recall";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RecallViewProps {
  salonId: string;
}

interface ReminderResult {
  customerId: string;
  message: string;
  isError: boolean;
}

const MONTHS_OPTIONS = [6, 12] as const;

export function RecallView({ salonId }: RecallViewProps): React.ReactElement {
  const [monthsSince, setMonthsSince] = useState<number>(MONTHS_OPTIONS[0]);
  const [lastResult, setLastResult] = useState<ReminderResult | null>(null);
  const [search, setSearch] = useState("");

  const {
    data: patients,
    isPending,
    isError,
    error,
  } = usePatientsDueForRecall(salonId, monthsSince);
  const sendMutation = useSendRecallReminder(salonId);

  function handleSend(customerId: string): void {
    setLastResult(null);
    sendMutation.mutate(customerId, {
      onSuccess: (result) => {
        setLastResult(
          result.ok
            ? { customerId, message: result.data.message, isError: false }
            : { customerId, message: result.error, isError: true },
        );
      },
      onError: (err) => {
        setLastResult({
          customerId,
          message: err instanceof Error ? err.message : "Error al enviar el recordatorio",
          isError: true,
        });
      },
    });
  }

  const hasResults = !isPending && !isError && !!patients && patients.length > 0;

  const query = search.trim().toLowerCase();
  const filtered = (patients ?? []).filter(
    (p) =>
      query === "" ||
      p.fullName.toLowerCase().includes(query) ||
      (p.phone ?? "").toLowerCase().includes(query),
  );

  return (
    <main className="container py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Recordatorios</h1>
          <p className="text-muted-foreground">
            Clientes pendientes de revisión
            {hasResults ? (
              <span className="ml-2 text-foreground/70">
                · {patients.length} {patients.length === 1 ? "cliente" : "clientes"}
              </span>
            ) : null}
          </p>
        </div>

        {/* Selector de meses sin venir */}
        <div
          className="inline-flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm"
          role="group"
          aria-label="Meses sin venir"
        >
          {MONTHS_OPTIONS.map((months) => (
            <button
              key={months}
              type="button"
              onClick={() => setMonthsSince(months)}
              aria-pressed={monthsSince === months}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 ease-apple-out",
                monthsSince === months
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              +{months} meses
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 max-w-sm animate-fade-up [animation-delay:80ms]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre o teléfono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar cliente"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 shadow-sm animate-fade-up [animation-delay:120ms]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Última visita</TableHead>
              <TableHead className="pr-4 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="pl-4">
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell className="pr-4">
                    <Skeleton className="ml-auto h-8 w-44" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-14 text-center">
                  <p className="text-sm text-destructive">
                    {error instanceof Error ? error.message : "Error al cargar"}
                  </p>
                </TableCell>
              </TableRow>
            ) : !patients || patients.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="mx-auto flex max-w-xs flex-col items-center text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
                      <Users className="h-6 w-6" />
                    </span>
                    <p className="font-medium">Sin pendientes de revisión</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ningún cliente lleva más de {monthsSince} meses sin visitar.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-14 text-center">
                  <p className="text-sm text-muted-foreground">
                    Sin coincidencias para «{search.trim()}».
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((patient) => {
                const isSending =
                  sendMutation.isPending && sendMutation.variables === patient.customerId;
                const rowResult =
                  lastResult?.customerId === patient.customerId ? lastResult : null;

                return (
                  <TableRow key={patient.customerId}>
                    <TableCell className="pl-4 font-medium">{patient.fullName}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        {patient.phone}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {patient.lastVisitAt ? formatDate(patient.lastVisitAt) : "Nunca"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSending}
                          onClick={() => handleSend(patient.customerId)}
                        >
                          <BellRing className="h-3.5 w-3.5 sm:mr-2" />
                          <span className="hidden sm:inline">
                            {isSending ? "Enviando…" : "Enviar recordatorio de revisión"}
                          </span>
                          <span className="sr-only sm:hidden">Enviar recordatorio</span>
                        </Button>
                        {rowResult && (
                          <p
                            className={cn(
                              "text-xs",
                              rowResult.isError ? "text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {rowResult.message}
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
