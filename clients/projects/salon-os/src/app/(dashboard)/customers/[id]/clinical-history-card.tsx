"use client";

import { useMemo, useState } from "react";
import { History, Paperclip, MessageSquare, Stethoscope, StickyNote } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClinicalHistory } from "@/hooks/use-clinical-history";
import { formatDate, formatMoney } from "@/lib/format";
import type { ClinicalHistoryEntry } from "@/lib/queries/clinical-history";

type Filter = "todo" | ClinicalHistoryEntry["category"];

const CATEGORY_META: Record<
  ClinicalHistoryEntry["category"],
  { label: string; icon: typeof Stethoscope; className: string }
> = {
  clinica: {
    label: "Clínica",
    icon: Stethoscope,
    className: "bg-primary/10 text-primary",
  },
  nota: {
    label: "Nota",
    icon: StickyNote,
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  comunicacion: {
    label: "Comunicación",
    icon: MessageSquare,
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  otro: {
    label: "Documento",
    icon: Paperclip,
    className: "bg-muted text-muted-foreground",
  },
};

const PAGE_STEP = 40;

interface ClinicalHistoryCardProps {
  salonId: string;
  customerId: string;
}

export function ClinicalHistoryCard({
  salonId,
  customerId,
}: ClinicalHistoryCardProps): React.ReactElement {
  const query = useClinicalHistory(salonId, customerId);
  const [filter, setFilter] = useState<Filter>("todo");
  const [visible, setVisible] = useState(PAGE_STEP);

  const counts = useMemo(() => {
    const c = { todo: 0, clinica: 0, nota: 0, comunicacion: 0, otro: 0 };
    for (const e of query.data ?? []) {
      c.todo += 1;
      c[e.category] += 1;
    }
    return c;
  }, [query.data]);

  const filtered = useMemo(() => {
    const all = query.data ?? [];
    return filter === "todo" ? all : all.filter((e) => e.category === filter);
  }, [query.data, filter]);

  const shown = filtered.slice(0, visible);

  const chips: { key: Filter; label: string }[] = [
    { key: "todo", label: `Todo (${counts.todo})` },
    { key: "clinica", label: `Clínica (${counts.clinica})` },
    { key: "nota", label: `Notas (${counts.nota})` },
    { key: "comunicacion", label: `Comunicaciones (${counts.comunicacion})` },
    { key: "otro", label: `Documentos (${counts.otro})` },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" aria-hidden="true" />
          Historial clínico
        </CardTitle>
        <CardDescription>
          Evolutivo del paciente: consultas, tratamientos, notas y comunicaciones,
          del más reciente al más antiguo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="space-y-6 border-l pl-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            {query.error instanceof Error
              ? query.error.message
              : "Error al cargar el historial"}
          </p>
        ) : counts.todo === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
              <History className="h-5 w-5" />
            </span>
            <p className="font-medium">Sin historial todavía</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Las actuaciones y notas del paciente aparecerán aquí.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => {
                    setFilter(chip.key);
                    setVisible(PAGE_STEP);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    filter === chip.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <ol className="relative space-y-5 border-l border-border pl-6">
              {shown.map((entry) => {
                const meta = CATEGORY_META[entry.category];
                const Icon = meta.icon;
                return (
                  <li key={entry.id} className="relative">
                    <span className="absolute -left-[1.72rem] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
                      >
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {meta.label}
                      </span>
                      {entry.kind !== null && entry.kind !== "" ? (
                        <span className="text-sm font-medium">{entry.kind}</span>
                      ) : null}
                      {entry.fdi_tooth !== null ? (
                        <Badge variant="secondary" className="text-xs">
                          Diente {entry.fdi_tooth}
                        </Badge>
                      ) : null}
                      {entry.amount_cents !== null && entry.amount_cents > 0 ? (
                        <span className="ml-auto text-sm font-semibold tabular-nums">
                          {formatMoney(entry.amount_cents, "EUR")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(entry.occurred_on)}
                      {entry.professional !== null && entry.professional !== ""
                        ? ` · ${entry.professional}`
                        : ""}
                    </p>
                    {entry.note !== null && entry.note !== "" ? (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                        {entry.note}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {visible < filtered.length ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisible((v) => v + PAGE_STEP)}
                >
                  Mostrar más ({filtered.length - visible} restantes)
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
