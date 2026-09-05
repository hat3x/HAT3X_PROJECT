/**
 * ChartDataTable — alternativa accesible a una gráfica (sub-13, accesibilidad).
 *
 * Cada gráfica de `/analitica` es un SVG (recharts) irrecorrible por un lector de
 * pantalla; para no dejar el dato SOLO en la forma/el color, cada una ofrece esta
 * tabla HTML semántica con las mismas cifras. Este test fija el CONTRATO de
 * accesibilidad del componente —lo que un usuario de lector de pantalla o de
 * teclado percibe— para que no se degrade en silencio:
 *
 *   · sin filas NO renderiza nada (la gráfica ya pinta su propio estado vacío);
 *   · la tabla tiene NOMBRE accesible (su `<caption>` oculto);
 *   · la primera columna es cabecera de FILA (`scope="row"`) y el resto cabeceras
 *     de COLUMNA (`scope="col"`), de modo que cada celda se anuncia con su fila y
 *     su columna;
 *   · el contenedor es una REGIÓN enfocable por teclado (WCAG 2.1.1): así se puede
 *     desplazar en horizontal en móvil SIN ratón.
 *
 * Componente presentacional PURO: se renderiza con columnas/filas sintéticas. El
 * disclosure `<details>` se abre con el teclado/ratón antes de inspeccionar la
 * tabla, igual que haría una persona usuaria.
 */
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import {
  ChartDataTable,
  type ChartDataColumn,
  type ChartDataRow,
} from "@/app/(dashboard)/analitica/chart-data-table";

afterEach(() => {
  cleanup();
});

const CAPTION = "Detalle de la tendencia de ventas por mes.";

const COLUMNS: ChartDataColumn[] = [
  { key: "period", header: "Periodo" },
  { key: "revenue", header: "Facturación", numeric: true },
  { key: "tickets", header: "Tickets", numeric: true },
];

const ROWS: ChartDataRow[] = [
  { key: "2026-01", cells: ["Enero 2026", "1.234,00 €", "42"] },
  { key: "2026-02", cells: ["Febrero 2026", "2.500,00 €", "51"] },
];

/** Renderiza la tabla y abre el disclosure «Ver tabla de datos» (como una persona). */
async function renderOpen(): Promise<void> {
  render(
    createElement(ChartDataTable, { caption: CAPTION, columns: COLUMNS, rows: ROWS }),
  );
  await userEvent.click(screen.getByText("Ver tabla de datos"));
}

describe("ChartDataTable · sin datos no compite con el estado vacío de la gráfica", () => {
  it("con la lista de filas vacía no renderiza nada", () => {
    const { container } = render(
      createElement(ChartDataTable, { caption: CAPTION, columns: COLUMNS, rows: [] }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ChartDataTable · tabla semántica como alternativa a la gráfica", () => {
  it("la tabla tiene nombre accesible por su caption", async () => {
    await renderOpen();
    // El `<caption>` (oculto) da nombre a la tabla para los lectores de pantalla.
    expect(screen.getByRole("table", { name: CAPTION })).toBeInTheDocument();
  });

  it("expone cabeceras de COLUMNA (scope=col) para cada métrica", async () => {
    await renderOpen();
    expect(screen.getByRole("columnheader", { name: "Periodo" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Facturación" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tickets" })).toBeInTheDocument();
  });

  it("la primera celda de cada fila es cabecera de FILA (scope=row)", async () => {
    await renderOpen();
    // `scope="row"` ⇒ role `rowheader`: identifica la fila (el periodo) al leer la
    // celda, de modo que «1.234,00 €» se anuncia junto a «Enero 2026».
    expect(screen.getByRole("rowheader", { name: "Enero 2026" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Febrero 2026" })).toBeInTheDocument();
    // El resto son celdas normales.
    expect(screen.getByRole("cell", { name: "1.234,00 €" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "42" })).toBeInTheDocument();
  });
});

describe("ChartDataTable · desplazable con teclado en móvil (WCAG 2.1.1)", () => {
  it("el contenedor es una región enfocable con nombre accesible", async () => {
    await renderOpen();
    // El `scrollRegionLabel` convierte el contenedor en `role="region"` enfocable
    // (`tabIndex=0`): un usuario de teclado lo enfoca con Tab y desplaza con flechas.
    const region = screen.getByRole("region", { name: CAPTION });
    expect(region).toHaveAttribute("tabindex", "0");
  });
});
