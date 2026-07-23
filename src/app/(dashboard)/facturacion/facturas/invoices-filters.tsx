"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FROM_PARAM,
  INVOICE_TYPE_FILTER_OPTIONS,
  invoiceTypeToParam,
  LOCATION_PARAM,
  METHOD_PARAM,
  PAYMENT_METHOD_FILTER_OPTIONS,
  SEARCH_PARAM,
  TO_PARAM,
  TYPE_PARAM,
  type InvoiceFilters,
} from "@/lib/facturacion/filters";
import { cn } from "@/lib/utils";

/** Sede mínima para el selector (id + nombre). */
export interface LocationOption {
  id: string;
  name: string;
}

interface InvoicesFiltersProps {
  /** Filtros efectivos resueltos en servidor (fuente de verdad = la URL). */
  filters: InvoiceFilters;
  /** Sedes del salón para el selector de sede. */
  locations: readonly LocationOption[];
  /** Tope superior de los campos de fecha: «hoy» local del salón. */
  maxDate: string;
}

/** Valor centinela de los `<Select>` para «sin filtro» (Radix no admite value ""). */
const ALL = "all";

/** Estado local del formulario, en la MISMA forma que los parámetros de URL. */
interface FilterFormState {
  search: string;
  from: string;
  to: string;
  location: string; // id de sede | ALL
  type: string; // "f1" | "f2" | ALL
  method: string; // valor del enum | ALL
}

/** Deriva el estado del formulario desde los filtros resueltos (props). */
function stateFromFilters(filters: InvoiceFilters): FilterFormState {
  return {
    search: filters.search ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
    location: filters.locationId ?? ALL,
    type: filters.invoiceType !== null ? invoiceTypeToParam(filters.invoiceType) : ALL,
    method: filters.paymentMethod ?? ALL,
  };
}

const EMPTY_STATE: FilterFormState = {
  search: "",
  from: "",
  to: "",
  location: ALL,
  type: ALL,
  method: ALL,
};

/** Query string (solo parámetros activos) a partir del estado del formulario. */
function buildQuery(state: FilterFormState): string {
  const params = new URLSearchParams();
  const search = state.search.trim();
  if (search !== "") params.set(SEARCH_PARAM, search);
  if (state.from !== "") params.set(FROM_PARAM, state.from);
  if (state.to !== "") params.set(TO_PARAM, state.to);
  if (state.location !== ALL) params.set(LOCATION_PARAM, state.location);
  if (state.type !== ALL) params.set(TYPE_PARAM, state.type);
  if (state.method !== ALL) params.set(METHOD_PARAM, state.method);
  return params.toString();
}

/** ¿Hay algún criterio activo? (para mostrar «Limpiar»). */
function isDirty(state: FilterFormState): boolean {
  return (
    state.search.trim() !== "" ||
    state.from !== "" ||
    state.to !== "" ||
    state.location !== ALL ||
    state.type !== ALL ||
    state.method !== ALL
  );
}

/**
 * Barra de filtros del libro de facturas — control URL-driven (mismo patrón que el
 * `RangeSelector` de la analítica). Escribe los filtros en la URL y deja que el
 * Server Component vuelva a resolverlos y re-consulte lista y totales; así el estado
 * es compartible/marcable y la fuente de verdad es siempre la URL.
 *
 * Los `<Select>` (sede, tipo, método) aplican al instante; la búsqueda y el rango de
 * fechas se aplican al enviar el formulario (Enter o «Aplicar»). Todo se navega con
 * `useTransition` para no bloquear la UI mientras el servidor recalcula (`aria-busy`).
 */
export function InvoicesFilters({
  filters,
  locations,
  maxDate,
}: InvoicesFiltersProps): React.ReactElement {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fieldId = useId();

  const [state, setState] = useState<FilterFormState>(() => stateFromFilters(filters));

  // Reconciliar con la verdad de la URL tras cada navegación (y autocorregir valores
  // que el servidor haya descartado, p. ej. una sede desconocida).
  useEffect(() => {
    setState(stateFromFilters(filters));
  }, [filters]);

  function navigate(next: FilterFormState): void {
    const query = buildQuery(next);
    startTransition(() => {
      router.push(
        query === "" ? "/facturacion/facturas" : `/facturacion/facturas?${query}`,
        { scroll: false },
      );
    });
  }

  /** Cambia un `<Select>` y aplica de inmediato (arrastrando lo ya escrito). */
  function handleSelect(key: keyof FilterFormState, value: string): void {
    const next = { ...state, [key]: value };
    setState(next);
    navigate(next);
  }

  const dateInvalid = state.from !== "" && state.to !== "" && state.from > state.to;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (dateInvalid) return;
    navigate(state);
  }

  function handleClear(): void {
    setState(EMPTY_STATE);
    navigate(EMPTY_STATE);
  }

  const dirty = isDirty(state);

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className={cn(
        "animate-fade-up mb-4 flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/40 p-3 transition-opacity",
        isPending && "opacity-70",
      )}
    >
      {/* Fila 1 — búsqueda + selectores de dimensión */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor={`${fieldId}-search`} className="sr-only">
            Buscar por número o cliente
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${fieldId}-search`}
            type="search"
            inputMode="search"
            placeholder="Buscar por número o cliente…"
            value={state.search}
            onChange={(event) => setState((s) => ({ ...s, search: event.target.value }))}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:shrink-0">
          <FilterSelect
            label="Sede"
            allLabel="Todas las sedes"
            value={state.location}
            onValueChange={(value) => handleSelect("location", value)}
            options={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
          />
          <FilterSelect
            label="Tipo"
            allLabel="Todos los tipos"
            value={state.type}
            onValueChange={(value) => handleSelect("type", value)}
            options={INVOICE_TYPE_FILTER_OPTIONS}
          />
          <FilterSelect
            label="Método"
            allLabel="Todos los métodos"
            value={state.method}
            onValueChange={(value) => handleSelect("method", value)}
            options={PAYMENT_METHOD_FILTER_OPTIONS}
          />
        </div>
      </div>

      {/* Fila 2 — rango de fechas + acciones */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${fieldId}-from`}
            className="text-xs font-medium text-muted-foreground"
          >
            Desde
          </label>
          <Input
            id={`${fieldId}-from`}
            type="date"
            value={state.from}
            max={state.to || maxDate}
            onChange={(event) => setState((s) => ({ ...s, from: event.target.value }))}
            className="h-9 w-[9.5rem]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${fieldId}-to`}
            className="text-xs font-medium text-muted-foreground"
          >
            Hasta
          </label>
          <Input
            id={`${fieldId}-to`}
            type="date"
            value={state.to}
            min={state.from || undefined}
            max={maxDate}
            onChange={(event) => setState((s) => ({ ...s, to: event.target.value }))}
            className="h-9 w-[9.5rem]"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={dateInvalid || isPending}>
            Aplicar
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={isPending}
              className="text-muted-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Limpiar
            </Button>
          )}
          {isPending && (
            <Loader2
              className="h-4 w-4 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          )}
        </div>

        {dateInvalid && (
          <p className="w-full text-xs text-destructive" role="alert">
            La fecha «desde» debe ser anterior o igual a «hasta».
          </p>
        )}
      </div>
    </form>
  );
}

interface FilterSelectProps {
  label: string;
  /** Etiqueta de la opción «sin filtro» (valor {@link ALL}). */
  allLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}

/** Selector de filtro con opción «todo» + lista de opciones. Etiqueta accesible. */
function FilterSelect({
  label,
  allLabel,
  value,
  onValueChange,
  options,
}: FilterSelectProps): React.ReactElement {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={label}
        className={cn("h-9 lg:w-[11rem]", value !== ALL && "border-primary/40")}
      >
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
