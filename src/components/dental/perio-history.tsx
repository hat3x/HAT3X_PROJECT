"use client";

import { History } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { PerioExam } from "@/types/database";

// ---------------------------------------------------------------------------
// PerioHistory — lista de exploraciones periodontales de un paciente
// ---------------------------------------------------------------------------

export interface PerioHistoryProps {
  exams: readonly PerioExam[];
  onSelect: (examId: string) => void;
  selectedId?: string;
}

/**
 * Lista las exploraciones periodontales de un paciente, más recientes
 * primero (se reordena aquí por `created_at` por defensa: no asume el orden
 * del caller, aunque `fetchPerioExams` ya las trae ordenadas). Cada fila es
 * un botón real (accesible por teclado) que llama `onSelect(examId)`.
 */
export function PerioHistory({
  exams,
  onSelect,
  selectedId,
}: PerioHistoryProps): React.ReactElement {
  const sorted = [...exams].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <History className="h-4 w-4" />
          </span>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Historial de exploraciones
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Sin exploraciones registradas todavía.
          </p>
        ) : (
          <ul className="divide-y">
            {sorted.map((exam) => {
              const isSelected = selectedId === exam.id;
              return (
                <li key={exam.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(exam.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={[
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                      isSelected ? "bg-accent/60 font-medium" : "",
                    ].join(" ")}
                  >
                    <span>{formatDateTime(exam.created_at)}</span>
                    <Badge
                      variant={exam.signed ? "default" : "outline"}
                      className="shrink-0 text-[10px]"
                    >
                      {exam.signed ? "Firmada" : "Borrador"}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Tendencia simple opcional: solo un recuento, no inventa datos clínicos
            que este componente no recibe (PD/CAL viven en perio_site, no en PerioExam). */}
        {sorted.length >= 2 && (
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            {sorted.length} exploraciones · {sorted.filter((e) => e.signed).length} firmadas
          </p>
        )}
      </CardContent>
    </Card>
  );
}
