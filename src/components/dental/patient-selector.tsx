"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, UserRound, Users } from "lucide-react";

import { CustomerAvatar } from "@/app/(dashboard)/customers/customer-avatar";
import { useTerms } from "@/components/providers/sector-provider";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCustomers } from "@/hooks/use-customers";

// ---------------------------------------------------------------------------
// PatientSelector
// ---------------------------------------------------------------------------

interface PatientSelectorProps {
  salonId: string;
  /**
   * Ruta base a la que navegar al seleccionar un paciente: se construye como
   * `${hrefBase}?paciente=<customer_id>`. Por defecto "/odontograma" para no
   * romper el uso existente; otras vistas (p. ej. /periodontograma) pasan su
   * propia ruta.
   */
  hrefBase?: string;
  /**
   * Frase que completa "Elige el/la {paciente} para {purposeLabel}". Por
   * defecto describe el odontograma (comportamiento histórico); otras vistas
   * pueden pasar su propia frase (p. ej. "ver su periodontograma").
   */
  purposeLabel?: string;
}

/**
 * Picker de paciente reutilizable entre vistas dentales (Odontograma,
 * Periodontograma, …). Muestra la lista de clientes del salón con búsqueda en
 * tiempo real. Al seleccionar un paciente navega a `${hrefBase}?paciente=<customer_id>`
 * (por defecto /odontograma, comportamiento histórico byte-idéntico si no se
 * pasa `hrefBase`).
 *
 * Los labels ("Paciente"/"Pacientes") se toman de useTerms() para que
 * este componente sea sector-aware sin hardcodear terminología.
 */
export function PatientSelector({
  salonId,
  hrefBase = "/odontograma",
  purposeLabel = "ver su odontograma",
}: PatientSelectorProps): React.ReactElement {
  const [search, setSearch] = useState("");
  const router = useRouter();
  const terms = useTerms();

  const { data: patients, isPending, isError, error } = useCustomers(
    salonId,
    search,
  );

  function handleSelect(customerId: string) {
    router.push(`${hrefBase}?paciente=${customerId}`);
  }

  const customerLabel = terms.customer;
  const customerPluralLabel = terms.customerPlural;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground"
          >
            <Users className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-base">
              Seleccionar {customerLabel}
            </CardTitle>
            <CardDescription className="text-xs">
              Elige el/la {customerLabel.toLowerCase()} para {purposeLabel}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* Search input */}
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            placeholder={`Buscar ${customerLabel.toLowerCase()} por nombre…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={`Buscar ${customerPluralLabel.toLowerCase()}`}
          />
        </div>

        {/* Patient list */}
        <div
          role="listbox"
          aria-label={customerPluralLabel}
          className="max-h-72 overflow-y-auto rounded-lg border divide-y"
        >
          {isPending ? (
            <SkeletonRows />
          ) : isError ? (
            <div className="px-4 py-6 text-center text-sm text-destructive">
              {error instanceof Error ? error.message : "Error al cargar"}
            </div>
          ) : !patients || patients.length === 0 ? (
            <EmptyState
              search={search}
              label={customerLabel}
              labelPlural={customerPluralLabel}
            />
          ) : (
            patients.map((patient) => (
              <button
                key={patient.id}
                role="option"
                aria-selected={false}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => handleSelect(patient.id)}
              >
                <CustomerAvatar name={patient.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {patient.full_name}
                  </p>
                  {patient.email !== null ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {patient.email}
                    </p>
                  ) : patient.phone !== null ? (
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {patient.phone}
                    </p>
                  ) : null}
                </div>
                <UserRound
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground/40"
                />
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonRows(): React.ReactElement {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </>
  );
}

function EmptyState({
  search,
  label,
  labelPlural,
}: {
  search: string;
  label: string;
  labelPlural: string;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground ring-1 ring-inset ring-primary/10">
        <Users className="h-4 w-4" />
      </span>
      <p className="text-sm font-medium">
        {search.trim() === ""
          ? `Sin ${labelPlural.toLowerCase()}`
          : "Sin coincidencias"}
      </p>
      <p className="mt-1 max-w-[22ch] text-xs text-muted-foreground">
        {search.trim() === ""
          ? `Crea el primer ${label.toLowerCase()} en la sección de Pacientes.`
          : `Ningún ${label.toLowerCase()} coincide con la búsqueda.`}
      </p>
    </div>
  );
}
