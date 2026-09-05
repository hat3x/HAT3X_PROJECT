import { describe, expect, it } from "vitest";

import { layoutLanes } from "@/lib/agenda/lanes";

/**
 * `layoutLanes` reparte en carriles (columnas dentro de un día) las citas que
 * se solapan, para que la vista Semana las muestre lado a lado en vez de unas
 * encima de otras (que es lo que recortaba las tarjetas). Es una función pura
 * de geometría de intervalos: sin fechas ni IO. Devuelve, para cada elemento y
 * en su MISMO orden de entrada, `{ lane, lanes }` (índice de carril 0-based +
 * nº total de carriles de su grupo de solape → ancho = 1/lanes).
 */
describe("layoutLanes", () => {
  it("no coloca nada para una lista vacía", () => {
    expect(layoutLanes([])).toEqual([]);
  });

  it("una sola cita ocupa el ancho completo (un carril)", () => {
    expect(layoutLanes([{ startMin: 600, endMin: 630 }])).toEqual([{ lane: 0, lanes: 1 }]);
  });

  it("dos citas consecutivas (adyacentes, sin solape) comparten carril a ancho completo", () => {
    // 10:00–10:30 seguida de 10:30–11:00: fin == inicio NO es solape.
    const result = layoutLanes([
      { startMin: 600, endMin: 630 },
      { startMin: 630, endMin: 660 },
    ]);
    expect(result).toEqual([
      { lane: 0, lanes: 1 },
      { lane: 0, lanes: 1 },
    ]);
  });

  it("dos citas solapadas se parten en dos carriles (mitad y mitad)", () => {
    const result = layoutLanes([
      { startMin: 600, endMin: 630 },
      { startMin: 615, endMin: 645 },
    ]);
    expect(result).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 },
    ]);
  });

  it("preserva el orden de entrada aunque no venga ordenado por hora", () => {
    // Se pasa la más tardía primero: el resultado sigue alineado por índice.
    const result = layoutLanes([
      { startMin: 615, endMin: 645 },
      { startMin: 600, endMin: 630 },
    ]);
    expect(result).toEqual([
      { lane: 1, lanes: 2 },
      { lane: 0, lanes: 2 },
    ]);
  });

  it("reutiliza un carril libre dentro del mismo grupo de solape", () => {
    // A[10:00–11:00] solapa con B[10:10–10:20] y con C[10:30–10:50];
    // B y C NO se solapan entre sí → C reutiliza el carril de B.
    // Grupo entero = 2 carriles.
    const result = layoutLanes([
      { startMin: 600, endMin: 660 }, // A
      { startMin: 610, endMin: 620 }, // B
      { startMin: 630, endMin: 650 }, // C
    ]);
    expect(result).toEqual([
      { lane: 0, lanes: 2 }, // A
      { lane: 1, lanes: 2 }, // B
      { lane: 1, lanes: 2 }, // C (reutiliza carril de B)
    ]);
  });

  it("tres citas totalmente simultáneas usan tres carriles", () => {
    const result = layoutLanes([
      { startMin: 600, endMin: 660 },
      { startMin: 600, endMin: 660 },
      { startMin: 600, endMin: 660 },
    ]);
    expect(result).toEqual([
      { lane: 0, lanes: 3 },
      { lane: 1, lanes: 3 },
      { lane: 2, lanes: 3 },
    ]);
  });

  it("separa grupos de solape independientes (cada uno con su recuento de carriles)", () => {
    // Grupo 1 (mañana): dos solapadas → 2 carriles.
    // Grupo 2 (tarde): una sola → 1 carril. No deben contaminarse.
    const result = layoutLanes([
      { startMin: 540, endMin: 600 }, // 09:00–10:00  grupo 1
      { startMin: 570, endMin: 630 }, // 09:30–10:30  grupo 1
      { startMin: 960, endMin: 990 }, // 16:00–16:30  grupo 2
    ]);
    expect(result).toEqual([
      { lane: 0, lanes: 2 },
      { lane: 1, lanes: 2 },
      { lane: 0, lanes: 1 },
    ]);
  });

  it("encadena el solape transitivo en un único grupo (A–B, B–C, A∦C)", () => {
    // A[10:00–10:40] solapa B[10:30–11:10] solapa C[11:00–11:40];
    // A y C no se tocan, pero la cadena los une en un grupo de 2 carriles.
    const result = layoutLanes([
      { startMin: 600, endMin: 640 }, // A
      { startMin: 630, endMin: 670 }, // B
      { startMin: 660, endMin: 700 }, // C
    ]);
    expect(result).toEqual([
      { lane: 0, lanes: 2 }, // A
      { lane: 1, lanes: 2 }, // B
      { lane: 0, lanes: 2 }, // C (reutiliza carril de A, ya libre a las 10:40)
    ]);
  });
});
