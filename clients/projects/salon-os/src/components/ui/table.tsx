import * as React from "react";

import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * Nombre accesible de la región desplazable. Si se indica, el contenedor pasa a
   * ser una región enfocable por teclado (`role="region"`, `tabIndex={0}`) para
   * poder desplazar la tabla en horizontal en móvil SIN ratón (WCAG 2.1.1): un
   * usuario de teclado la enfoca con Tab y desplaza con las flechas. Sin él, se
   * mantiene el contenedor simple con scroll táctil/ratón.
   *
   * Empareja con un `<TableCaption className="sr-only">` para que la tabla tenga
   * también un nombre para lectores de pantalla.
   */
  scrollRegionLabel?: string;
  /** Clases extra para el contenedor desplazable (no para el `<table>`). */
  containerClassName?: string;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, scrollRegionLabel, containerClassName, ...props }, ref) => {
    const scrollable = scrollRegionLabel !== undefined;
    return (
      <div
        className={cn(
          "relative w-full overflow-x-auto",
          // Región enfocable: heredamos el radio del contenedor y mostramos el
          // anillo de foco de marca por dentro para que se vea sobre el borde.
          scrollable &&
            "rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          containerClassName,
        )}
        {...(scrollable
          ? { role: "region", "aria-label": scrollRegionLabel, tabIndex: 0 }
          : {})}
      >
        <table
          ref={ref}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      // Pie de tabla para totales: borde superior marcado, tinte sutil y cifras en
      // seminegrita. La última fila no lleva borde para cerrar limpio.
      "border-t border-border bg-muted/40 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      // Hover con leve tinte de marca y transición de 150ms; borde de fila fino.
      "border-b border-border/60 transition-colors duration-150 ease-apple-out hover:bg-accent/40 data-[state=selected]:bg-accent/60",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      // Cabecera con jerarquía sutil: versalitas y tracking ligero, sin gritar.
      "h-11 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-3 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  // `caption-bottom` en `<table>` la coloca al pie cuando es visible; casi siempre
  // se usa con `sr-only` para dar un nombre accesible a la tabla sin ruido visual.
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
};
