import { ChevronRight } from "lucide-react";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/*
 * Tabla de datos alternativa a una gráfica (sub-13, accesibilidad).
 * ----------------------------------------------------------------
 * Cada gráfica de `/analitica` es un SVG (recharts) que un lector de pantalla no
 * puede recorrer. Para no dejar la información SOLO en la forma/el color, cada
 * gráfica ofrece esta alternativa: una tabla HTML semántica con los mismos datos.
 *
 * Va dentro de un `<details>` (disclosure nativo, accesible por teclado sin JS):
 * plegada por defecto para no recargar la vista, pero SIEMPRE en el DOM, así que
 * está disponible para TODO el mundo —lectores de pantalla, teclado y ratón—.
 * La primera columna es cabecera de fila (`<th scope="row">`) y el resto celdas;
 * la tabla lleva `<caption>` oculto que le da nombre y es una región desplazable
 * enfocable (scroll horizontal en móvil).
 */

export interface ChartDataColumn {
  key: string;
  header: string;
  /** Columna de importes/conteos: se alinea a la derecha con cifras tabulares. */
  numeric?: boolean;
}

export interface ChartDataRow {
  key: string;
  /** Celdas ya formateadas como texto, en el mismo orden que `columns`. */
  cells: React.ReactNode[];
}

interface ChartDataTableProps {
  /** Nombre accesible de la tabla: `<caption>` (oculto) + etiqueta de la región. */
  caption: string;
  /** Texto del disclosure que abre/cierra la tabla. */
  label?: string;
  columns: ChartDataColumn[];
  rows: ChartDataRow[];
}

/**
 * Disclosure «Ver tabla de datos» con la tabla semántica de una gráfica. Devuelve
 * `null` sin filas (la gráfica ya muestra su propio estado vacío). Estilado con los
 * tokens premium (bordes `border/70`, `ease-apple-out`, anillo de foco de marca).
 */
export function ChartDataTable({
  caption,
  label = "Ver tabla de datos",
  columns,
  rows,
}: ChartDataTableProps): React.ReactElement | null {
  if (rows.length === 0) return null;

  return (
    <details className="group mt-5 border-t border-border/60 pt-4">
      <summary
        className={cn(
          "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground",
          "transition-colors duration-150 ease-apple-out hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronRight
          className="h-4 w-4 shrink-0 transition-transform duration-200 ease-apple-out group-open:rotate-90"
          aria-hidden="true"
        />
        {label}
      </summary>

      <div className="mt-3 overflow-hidden rounded-lg border border-border/60">
        <Table scrollRegionLabel={caption}>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  scope="col"
                  className={cn(col.numeric && "text-right")}
                >
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                {row.cells.map((cell, index) => {
                  const col = columns[index];
                  const cellKey = col?.key ?? `col-${index}`;
                  // Primera columna = cabecera de fila: identifica la fila (periodo,
                  // método…) para los lectores de pantalla. Se re-estila como celda
                  // normal (sin versalitas ni tinte apagado de las cabeceras).
                  if (index === 0) {
                    return (
                      <TableHead
                        key={cellKey}
                        scope="row"
                        className="whitespace-nowrap text-sm font-medium normal-case tracking-normal text-foreground"
                      >
                        {cell}
                      </TableHead>
                    );
                  }
                  return (
                    <TableCell
                      key={cellKey}
                      className={cn(col?.numeric && "text-right tabular-nums")}
                    >
                      {cell}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}
