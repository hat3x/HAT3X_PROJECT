"use client";

import {
  AlertTriangle,
  Download,
  FileJson,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { invoiceExportHref } from "@/lib/facturacion/filters";
import { cn } from "@/lib/utils";

interface InvoicesExportProps {
  /** Periodo filtrado en pantalla (fuente de verdad = la URL). `null` = sin límite. */
  from: string | null;
  to: string | null;
  /**
   * ¿Hay filtros activos que NO acotan el libro fiscal (sede/tipo/método/búsqueda)?
   * Si los hay, la descarga cubre TODO el periodo igualmente: se avisa para no
   * inducir a pensar que el archivo respeta lo que se ve filtrado en la tabla.
   */
  hasNonPeriodFilters: boolean;
}

/**
 * `YYYY-MM-DD` → `DD/MM/YYYY` operando sobre el texto (sin `Date`): así el periodo
 * se muestra tal cual, sin que la zona horaria del navegador desplace un día.
 */
function formatIsoEs(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

/** Frase legible del alcance temporal de la descarga según el periodo filtrado. */
function scopeLabel(from: string | null, to: string | null): string {
  if (from !== null && to !== null) {
    return `Del ${formatIsoEs(from)} al ${formatIsoEs(to)}`;
  }
  if (from !== null) return `Desde el ${formatIsoEs(from)}`;
  if (to !== null) return `Hasta el ${formatIsoEs(to)}`;
  return "Todo el histórico (sin límite de fechas)";
}

/**
 * Diálogo de EXPORTACIÓN del libro registro (sub-8).
 *
 * Reutiliza `GET /api/facturacion/export` para descargar las facturas del PERIODO
 * filtrado (el rango de fechas de la vista viaja como `from`/`to`). El diálogo hace
 * dos trabajos de UX que el simple botón anterior no hacía:
 *
 *   1. Deja CLARO el formato: qué es el CSV (libro registro AEAT, una fila por tipo
 *      de IVA, `;` y UTF-8 para Excel) frente al JSON (datos completos con huellas).
 *   2. Deja CLARO el alcance: muestra el periodo exacto que se descargará y avisa,
 *      cuando hay filtros no-fiscales activos, de que el libro es completo por
 *      periodo (sede/tipo/método/búsqueda solo ordenan la tabla, no el archivo).
 *
 * El acceso ya está guardado en el layout (owner/manager), igual que el propio Route
 * Handler; por eso aquí no hay condición de rol.
 */
export function InvoicesExport({
  from,
  to,
  hasNonPeriodFilters,
}: InvoicesExportProps): React.ReactElement {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Exportar
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar para la gestoría</DialogTitle>
          <DialogDescription>
            Descarga el libro registro de facturas expedidas, listo para tu gestoría
            o para la AEAT. Elige el formato: el archivo empieza a bajar al pulsarlo.
          </DialogDescription>
        </DialogHeader>

        {/* Alcance temporal exacto de la descarga */}
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2.5">
          <p className="text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
            Periodo a exportar
          </p>
          <p className="mt-0.5 text-sm font-semibold tracking-tight text-foreground">
            {scopeLabel(from, to)}
          </p>
        </div>

        {/* Aviso honesto: los filtros no-fiscales no recortan el libro */}
        {hasNonPeriodFilters ? (
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5"
          >
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <p className="text-xs leading-relaxed text-foreground/85">
              El libro fiscal debe ser completo, así que se exportarán{" "}
              <strong className="font-semibold">todas</strong> las facturas del
              periodo. Los filtros de sede, tipo, método y búsqueda solo afectan a la
              tabla en pantalla, no a este archivo.
            </p>
          </div>
        ) : null}

        {/* Formatos disponibles — el CSV es el que espera la gestoría */}
        <div className="grid gap-2">
          <ExportFormatLink
            href={invoiceExportHref(from, to, "csv")}
            icon={FileSpreadsheet}
            title="CSV para la gestoría"
            recommended
            description="Libro de facturas: una fila por tipo de IVA, separador «;» y UTF-8. Se abre en Excel con acentos y columnas correctas."
          />
          <ExportFormatLink
            href={invoiceExportHref(from, to, "json")}
            icon={FileJson}
            title="JSON estructurado"
            description="Datos completos con el desglose de IVA. Para integrar con software de la gestoría."
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ExportFormatLinkProps {
  /** URL del Route Handler con el periodo y el formato ya resueltos. */
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Resalta el formato preferido (CSV) con un distintivo. */
  recommended?: boolean;
}

/**
 * Opción de formato como enlace de descarga real (`<a download>`): accesible por
 * teclado y sin JS para disparar la bajada — el `content-disposition: attachment`
 * del servidor hace el trabajo. Se envuelve en `DialogClose` para que, al elegir un
 * formato, el diálogo se cierre y la descarga arranque a la vez.
 */
function ExportFormatLink({
  href,
  icon: Icon,
  title,
  description,
  recommended = false,
}: ExportFormatLinkProps): React.ReactElement {
  return (
    <DialogClose asChild>
      <a
        href={href}
        download
        className={cn(
          "group flex items-start gap-3 rounded-lg border border-border/70 bg-[var(--glass-panel)] backdrop-blur-xl backdrop-saturate-150 p-3 text-left",
          "transition-all duration-200 ease-apple-out",
          "hover:border-ring/40 hover:bg-accent active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-accent text-primary shadow-xs"
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {recommended ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
                Recomendado
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        </span>
        <Download
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
          aria-hidden="true"
        />
      </a>
    </DialogClose>
  );
}
