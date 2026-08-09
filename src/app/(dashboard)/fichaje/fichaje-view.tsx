"use client";

import { useMemo, useState } from "react";
import { Clock, Download, LogIn, LogOut, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useClockIn,
  useClockOut,
  useMyOpenEntry,
  useTimeClockReport,
} from "@/hooks/use-time-clock";
import type { TimeClockEntry } from "@/lib/queries/time-clock";

interface FichajeViewProps {
  salonId: string;
  userId: string;
  canManage: boolean;
  timezone: string;
  initialOpen: TimeClockEntry | null;
}

// ── Helpers de fecha/hora en la zona del salón ───────────────────────────────
function ymdInZone(d: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function timeInZone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
function dateInZone(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "short",
  }).format(new Date(iso));
}
function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function startOfWeekYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lunes=0
  return addDaysYmd(ymd, -wd);
}
/** Minutos trabajados entre dos ISO (o hasta ahora si sigue abierto). */
function minutesOf(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(clockIn).getTime()) / 60000));
}
function fmtDur(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function FichajeView({
  salonId,
  userId,
  canManage,
  timezone,
  initialOpen,
}: FichajeViewProps): React.ReactElement {
  const openQuery = useMyOpenEntry(salonId, userId, initialOpen);
  const clockInMut = useClockIn(salonId);
  const clockOutMut = useClockOut(salonId);
  const isIn = Boolean(openQuery.data);
  const pending = clockInMut.isPending || clockOutMut.isPending;

  return (
    <main className="container max-w-4xl py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Fichaje</h1>
        <p className="mt-1 text-muted-foreground">Control horario del personal</p>
      </div>

      {/* Tarjeta de fichar (todos) */}
      <Card className="mb-8">
        <CardContent className="flex flex-col items-center gap-5 py-8 text-center">
          <span
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full",
              isIn ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
            )}
          >
            <Clock className="h-7 w-7" />
          </span>
          <div>
            <p className="text-lg font-semibold">
              {isIn ? "Estás fichado" : "No estás fichado"}
            </p>
            {isIn && openQuery.data ? (
              <p className="text-sm text-muted-foreground">
                Entrada a las {timeInZone(openQuery.data.clockIn, timezone)} ·{" "}
                {fmtDur(minutesOf(openQuery.data.clockIn, null))} trabajadas
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ficha tu entrada cuando empieces la jornada.
              </p>
            )}
          </div>
          {isIn ? (
            <Button
              size="lg"
              variant="outline"
              disabled={pending}
              onClick={() => clockOutMut.mutate()}
              className="min-w-48"
            >
              <LogOut className="mr-2 h-5 w-5" />
              {clockOutMut.isPending ? "Fichando…" : "Fichar salida"}
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={pending}
              onClick={() => clockInMut.mutate()}
              className="min-w-48 shadow-brand"
            >
              <LogIn className="mr-2 h-5 w-5" />
              {clockInMut.isPending ? "Fichando…" : "Fichar entrada"}
            </Button>
          )}
          {(clockInMut.error || clockOutMut.error) && (
            <p className="text-sm text-destructive">
              {(clockInMut.error ?? clockOutMut.error) instanceof Error
                ? ((clockInMut.error ?? clockOutMut.error) as Error).message
                : "No se pudo fichar"}
            </p>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <TimeClockReport salonId={salonId} timezone={timezone} />
      ) : null}
    </main>
  );
}

// ── Informe (owner/manager) ──────────────────────────────────────────────────
type Preset = "semana" | "mes";

function TimeClockReport({
  salonId,
  timezone,
}: {
  salonId: string;
  timezone: string;
}): React.ReactElement {
  const today = ymdInZone(new Date(), timezone);
  const [preset, setPreset] = useState<Preset>("mes");

  const { from, to } = useMemo(() => {
    if (preset === "semana") return { from: startOfWeekYmd(today), to: today };
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }, [preset, today]);

  // Rango a la query: [from 00:00Z, (to+1) 00:00Z). La clínica no ficha de
  // madrugada, así que el desfase de zona en el corte de día no afecta.
  const fromISO = `${from}T00:00:00Z`;
  const toISO = `${addDaysYmd(to, 1)}T00:00:00Z`;
  const query = useTimeClockReport(salonId, fromISO, toISO);

  const entries = query.data ?? [];
  const openNow = entries.filter((e) => e.clockOut === null);

  // Totales por empleado.
  const perEmployee = useMemo(() => {
    const map = new Map<string, { name: string; minutes: number; sessions: number }>();
    for (const e of entries) {
      const key = e.userId ?? e.name;
      const cur = map.get(key) ?? { name: e.name, minutes: 0, sessions: 0 };
      cur.minutes += minutesOf(e.clockIn, e.clockOut);
      cur.sessions += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes);
  }, [entries]);

  function exportCsv(): void {
    const rows = [
      ["Empleado", "Fecha", "Entrada", "Salida", "Horas"],
      ...entries.map((e) => [
        e.name,
        dateInZone(e.clockIn, timezone),
        timeInZone(e.clockIn, timezone),
        e.clockOut ? timeInZone(e.clockOut, timezone) : "—",
        fmtDur(minutesOf(e.clockIn, e.clockOut)),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fichajes_${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      {/* Quién está dentro ahora */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Dentro ahora
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <Skeleton className="h-8 w-64" />
          ) : openNow.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie está fichado en este momento.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {openNow.map((e) => (
                <span
                  key={e.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {e.name} · desde {timeInZone(e.clockIn, timezone)}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informe de horas */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Horas trabajadas</CardTitle>
            <CardDescription>
              {preset === "semana" ? "Esta semana" : "Este mes"} · del {from} al {to}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border bg-card p-1">
              {(["semana", "mes"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    preset === p
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {p === "semana" ? "Semana" : "Mes"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Exportar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : query.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {(query.error as Error).message}
            </p>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Sin fichajes en este periodo.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Resumen por empleado */}
              <div className="grid gap-2 sm:grid-cols-2">
                {perEmployee.map((emp) => (
                  <div
                    key={emp.name}
                    className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5"
                  >
                    <span className="text-sm font-medium">{emp.name}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {fmtDur(emp.minutes)}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        ({emp.sessions})
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Detalle */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Empleado</th>
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium">Entrada</th>
                      <th className="py-2 pr-3 font-medium">Salida</th>
                      <th className="py-2 text-right font-medium">Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{e.name}</td>
                        <td className="py-2 pr-3 capitalize text-muted-foreground">
                          {dateInZone(e.clockIn, timezone)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{timeInZone(e.clockIn, timezone)}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {e.clockOut ? (
                            timeInZone(e.clockOut, timezone)
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">dentro</span>
                          )}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          {fmtDur(minutesOf(e.clockIn, e.clockOut))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
