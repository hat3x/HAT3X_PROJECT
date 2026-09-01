## Tarea 2: El margen, aislado

**Ficheros:**
- Modificar: `apps/atlas/src/lib/dinero.ts` (añadir `limitesMesMadrid`, `mesDe`, `mesVecino`)
- Modificar: `apps/atlas/src/app/dinero/horas/page.tsx` (usar `limitesMesMadrid` en vez de su `mesEnCurso` privada; borrar la privada)
- Crear: `apps/atlas/src/lib/rentabilidad/margen.ts`
- Test: `apps/atlas/src/tests/dinero.test.ts` (añadir casos), `apps/atlas/src/tests/rentabilidad/margen.test.ts`

**Interfaces:**
- Produce en `dinero.ts`:
  - `limitesMesMadrid(mes: string): { desde: string; hasta: string }` — `mes` = `AAAA-MM`; devuelve instantes ISO (medianoche de Madrid del día 1 y del día 1 siguiente, en UTC).
  - `mesDe(hoy: string): string` — `AAAA-MM-DD` → `AAAA-MM`.
  - `mesVecino(mes: string, delta: -1 | 1): string`.
- Produce en `margen.ts`:
  ```ts
  type FacturaMes = { clienteId: string; clienteNombre: string; baseCentimos: number; lineas: { proyectoId: string | null; proyectoNombre: string | null; importeCentimos: number }[] }
  type GastoMes = { clienteId: string | null; clienteNombre: string | null; proyectoId: string | null; proyectoNombre: string | null; baseCentimos: number }
  type TramoMes = { clienteId: string | null; clienteNombre: string | null; proyectoId: string | null; proyectoNombre: string | null; minutos: number }
  type FilaMargen = { id: string; nombre: string; facturadoCentimos: number; gastosCentimos: number; minutos: number; horasCentimos: number; margenCentimos: number }
  type Linea = { gastosCentimos: number; minutos: number; horasCentimos: number }
  type Rentabilidad = { porCliente: FilaMargen[]; sinCliente: Linea; porProyecto: FilaMargen[]; sinProyecto: Linea; estructura: Linea; total: { facturadoCentimos; gastosCentimos; minutos; horasCentimos; margenCentimos } }
  function costeDeMinutos(minutos: number, costeHoraCentimos: number): number  // Math.round(minutos * coste / 60)
  function calcularMargen(e: { facturas: FacturaMes[]; gastos: GastoMes[]; tramos: TramoMes[]; costeHoraCentimos: number }): Rentabilidad
  ```

- [ ] **Paso 1: tests que fallan**

```ts
// añadir a src/tests/dinero.test.ts
import { limitesMesMadrid, mesDe, mesVecino } from "@/lib/dinero";

describe("limitesMesMadrid", () => {
  it("agosto (CEST) empieza a las 22:00Z del 31 de julio", () => {
    expect(limitesMesMadrid("2026-08")).toEqual({ desde: "2026-07-31T22:00:00.000Z", hasta: "2026-08-31T22:00:00.000Z" });
  });
  it("enero (CET) empieza a las 23:00Z del 31 de diciembre", () => {
    expect(limitesMesMadrid("2026-01")).toEqual({ desde: "2025-12-31T23:00:00.000Z", hasta: "2026-01-31T23:00:00.000Z" });
  });
  it("octubre cambia de hora dentro del mes y cada frontera lleva su desfase", () => {
    expect(limitesMesMadrid("2026-10")).toEqual({ desde: "2026-09-30T22:00:00.000Z", hasta: "2026-10-31T23:00:00.000Z" });
  });
});

describe("mesDe y mesVecino", () => {
  it("recorta y se mueve, también en el cambio de año", () => {
    expect(mesDe("2026-08-30")).toBe("2026-08");
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
  });
});
```

```ts
// src/tests/rentabilidad/margen.test.ts
import { describe, it, expect } from "vitest";
import { calcularMargen, costeDeMinutos, type FacturaMes, type GastoMes, type TramoMes } from "@/lib/rentabilidad/margen";

const COSTE = 3000; // 30 €/h en céntimos

const fBio: FacturaMes = {
  clienteId: "c-bio", clienteNombre: "Biodental", baseCentimos: 35000,
  lineas: [
    { proyectoId: "p-sara", proyectoNombre: "Sara", importeCentimos: 29000 },
    { proyectoId: "p-kairos", proyectoNombre: "Kairos", importeCentimos: 6000 },
  ],
};
const fClub: FacturaMes = {
  clienteId: "c-club", clienteNombre: "Club", baseCentimos: 10000,
  lineas: [{ proyectoId: null, proyectoNombre: null, importeCentimos: 10000 }],
};
const gastos: GastoMes[] = [
  { clienteId: "c-bio", clienteNombre: "Biodental", proyectoId: "p-sara", proyectoNombre: "Sara", baseCentimos: 4830 },
  { clienteId: null, clienteNombre: null, proyectoId: "p-kairos", proyectoNombre: "Kairos", baseCentimos: 2500 }, // Supabase de Kairos
  { clienteId: "c-club", clienteNombre: "Club", proyectoId: null, proyectoNombre: null, baseCentimos: 940 },
  { clienteId: null, clienteNombre: null, proyectoId: null, proyectoNombre: null, baseCentimos: 2000 }, // Vercel
];
const tramos: TramoMes[] = [
  { clienteId: "c-bio", clienteNombre: "Biodental", proyectoId: "p-sara", proyectoNombre: "Sara", minutos: 120 },
  { clienteId: null, clienteNombre: null, proyectoId: "p-kairos", proyectoNombre: "Kairos", minutos: 60 },
  { clienteId: null, clienteNombre: null, proyectoId: null, proyectoNombre: null, minutos: 30 },
];

describe("costeDeMinutos", () => {
  it("redondea una sola vez, al céntimo", () => {
    expect(costeDeMinutos(60, 3000)).toBe(3000);
    expect(costeDeMinutos(1, 3000)).toBe(50);
    expect(costeDeMinutos(7, 3333)).toBe(389); // 388,85 → 389
    expect(costeDeMinutos(0, 3000)).toBe(0);
  });
});

describe("calcularMargen", () => {
  const r = calcularMargen({ facturas: [fBio, fClub], gastos, tramos, costeHoraCentimos: COSTE });

  it("por cliente: facturado − gastos con su cliente − horas con su cliente", () => {
    const bio = r.porCliente.find((f) => f.id === "c-bio")!;
    expect(bio).toEqual({ id: "c-bio", nombre: "Biodental", facturadoCentimos: 35000, gastosCentimos: 4830, minutos: 120, horasCentimos: 6000, margenCentimos: 24170 });
    const club = r.porCliente.find((f) => f.id === "c-club")!;
    expect(club.margenCentimos).toBe(10000 - 940);
  });

  it("lo que tiene proyecto pero no cliente va a «sin cliente», sin repartir", () => {
    expect(r.sinCliente).toEqual({ gastosCentimos: 2500, minutos: 60, horasCentimos: 3000 });
  });

  it("por proyecto: el facturado sale de las líneas, y el Supabase de Kairos sí es directo aquí", () => {
    const kairos = r.porProyecto.find((f) => f.id === "p-kairos")!;
    expect(kairos).toEqual({ id: "p-kairos", nombre: "Kairos", facturadoCentimos: 6000, gastosCentimos: 2500, minutos: 60, horasCentimos: 3000, margenCentimos: 500 });
    const sara = r.porProyecto.find((f) => f.id === "p-sara")!;
    expect(sara.facturadoCentimos).toBe(29000);
  });

  it("lo que tiene cliente pero no proyecto va a «sin proyecto»", () => {
    expect(r.sinProyecto.gastosCentimos).toBe(940);
    // y la línea de factura sin proyecto es facturado sin proyecto
    expect(r.porProyecto.find((f) => f.id === "sin-proyecto")).toBeUndefined();
    expect(r.total.facturadoCentimos - r.porProyecto.reduce((t, f) => t + f.facturadoCentimos, 0)).toBe(10000);
  });

  it("la estructura es lo que no tiene ningún contador, una sola vez", () => {
    expect(r.estructura).toEqual({ gastosCentimos: 2000, minutos: 30, horasCentimos: 1500 });
  });

  it("los dos ejes cuadran con el total del negocio", () => {
    const total = r.total;
    expect(total.facturadoCentimos).toBe(45000);
    expect(total.gastosCentimos).toBe(4830 + 2500 + 940 + 2000);
    expect(total.minutos).toBe(210);
    expect(total.horasCentimos).toBe(10500);
    expect(total.margenCentimos).toBe(45000 - 10270 - 10500);
    const sumaClientes = r.porCliente.reduce((t, f) => t + f.margenCentimos, 0);
    expect(sumaClientes - r.sinCliente.gastosCentimos - r.sinCliente.horasCentimos - r.estructura.gastosCentimos - r.estructura.horasCentimos).toBe(total.margenCentimos);
    const sumaProyectos = r.porProyecto.reduce((t, f) => t + f.margenCentimos, 0);
    const facturadoSinProyecto = 10000;
    expect(sumaProyectos + facturadoSinProyecto - r.sinProyecto.gastosCentimos - r.sinProyecto.horasCentimos - r.estructura.gastosCentimos - r.estructura.horasCentimos).toBe(total.margenCentimos);
  });

  it("ordena de más a menos margen", () => {
    expect(r.porCliente.map((f) => f.id)).toEqual(["c-bio", "c-club"]);
  });

  it("con coste cero, las horas cuentan cero pero los minutos se ven", () => {
    const sin = calcularMargen({ facturas: [fBio], gastos: [], tramos, costeHoraCentimos: 0 });
    expect(sin.porCliente[0]?.horasCentimos).toBe(0);
    expect(sin.porCliente[0]?.minutos).toBe(120);
  });

  it("un cliente con gastos u horas pero sin factura aparece con facturado cero", () => {
    const solo = calcularMargen({ facturas: [], gastos: [gastos[0]!], tramos: [], costeHoraCentimos: COSTE });
    expect(solo.porCliente).toEqual([{ id: "c-bio", nombre: "Biodental", facturadoCentimos: 0, gastosCentimos: 4830, minutos: 0, horasCentimos: 0, margenCentimos: -4830 }]);
  });
});
```

- [ ] **Paso 2: comprobar que fallan** — `npx vitest run src/tests/dinero.test.ts src/tests/rentabilidad/`.

- [ ] **Paso 3: implementar**

En `src/lib/dinero.ts`, añadir (y usarlo desde `horas/page.tsx` borrando su `mesEnCurso`):

```ts
/**
 * El mes `AAAA-MM` como instantes ISO: la medianoche de Madrid del día 1 y la
 * del día 1 siguiente, en UTC. Se calcula el desfase en CADA frontera porque
 * en marzo y octubre cambia dentro del mes. Es la única función que corta
 * meses: horas y rentabilidad la comparten para no cuadrar distinto.
 */
export function limitesMesMadrid(mes: string): { desde: string; hasta: string } {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  const PARTES = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const desfase = (d: Date) => {
    const p = PARTES.formatToParts(d);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    // `hour12:false` puede dar «24» a medianoche en algunos motores.
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute")) - d.getTime();
  };
  const ini = new Date(Date.UTC(a, m - 1, 1));
  const fin = new Date(Date.UTC(a, m, 1));
  return {
    desde: new Date(ini.getTime() - desfase(ini)).toISOString(),
    hasta: new Date(fin.getTime() - desfase(fin)).toISOString(),
  };
}

export function mesDe(hoy: string): string {
  return hoy.slice(0, 7);
}

export function mesVecino(mes: string, delta: -1 | 1): string {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) + delta;
  const d = new Date(Date.UTC(a, m - 1, 1));
  return d.toISOString().slice(0, 7);
}
```

```ts
// src/lib/rentabilidad/margen.ts
//
// El margen de contribución (§6.3). Pura: entran céntimos, salen céntimos.
//
// No se prorratea NADA. Hay dos preguntas y cada una tiene su eje:
//   ¿me interesa este cliente?  → lo que ingresa menos lo que desaparecería
//                                 si lo dejara: lo que tiene SU contador.
//   ¿vive el negocio?           → la suma de márgenes menos la estructura
//                                 entera, una sola vez.
// Lo directo depende del eje: por cliente cuenta lo que tiene cliente_id, por
// proyecto lo que tiene proyecto_id. Lo que no tiene el eje va a una línea
// aparte con nombre honesto, nunca repartido: repartir inventa precisión.
//

export type FacturaMes = {
  clienteId: string;
  clienteNombre: string;
  /** Base, sin IVA: el IVA no es ingreso. */
  baseCentimos: number;
  lineas: { proyectoId: string | null; proyectoNombre: string | null; importeCentimos: number }[];
};

export type GastoMes = {
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  /** Base, sin IVA: el IVA es deducible, no coste. */
  baseCentimos: number;
};

export type TramoMes = {
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  minutos: number;
};

export type Linea = { gastosCentimos: number; minutos: number; horasCentimos: number };

export type FilaMargen = {
  id: string;
  nombre: string;
  facturadoCentimos: number;
  gastosCentimos: number;
  minutos: number;
  horasCentimos: number;
  margenCentimos: number;
};

export type Rentabilidad = {
  porCliente: FilaMargen[];
  /** Con proyecto pero sin cliente. No se reparte. */
  sinCliente: Linea;
  porProyecto: FilaMargen[];
  /** Con cliente pero sin proyecto. No se reparte. */
  sinProyecto: Linea;
  /** Sin ningún contador. Una sola vez. */
  estructura: Linea;
  total: { facturadoCentimos: number; gastosCentimos: number; minutos: number; horasCentimos: number; margenCentimos: number };
};

/** Se redondea UNA vez, aquí, por fila: sumar redondeos parciales acumula error. */
export function costeDeMinutos(minutos: number, costeHoraCentimos: number): number {
  return Math.round((minutos * costeHoraCentimos) / 60);
}

type Acumulado = { nombre: string; facturado: number; gastos: number; minutos: number };

function fila(id: string, a: Acumulado, coste: number): FilaMargen {
  const horasCentimos = costeDeMinutos(a.minutos, coste);
  return {
    id,
    nombre: a.nombre,
    facturadoCentimos: a.facturado,
    gastosCentimos: a.gastos,
    minutos: a.minutos,
    horasCentimos,
    margenCentimos: a.facturado - a.gastos - horasCentimos,
  };
}

function linea(gastos: number, minutos: number, coste: number): Linea {
  return { gastosCentimos: gastos, minutos, horasCentimos: costeDeMinutos(minutos, coste) };
}

export function calcularMargen(e: {
  facturas: FacturaMes[];
  gastos: GastoMes[];
  tramos: TramoMes[];
  costeHoraCentimos: number;
}): Rentabilidad {
  const coste = e.costeHoraCentimos;
  const clientes = new Map<string, Acumulado>();
  const proyectos = new Map<string, Acumulado>();
  const toma = (m: Map<string, Acumulado>, id: string, nombre: string | null) => {
    const a = m.get(id) ?? { nombre: nombre ?? "Sin nombre", facturado: 0, gastos: 0, minutos: 0 };
    m.set(id, a);
    return a;
  };

  let sinClienteG = 0, sinClienteMin = 0;
  let sinProyectoG = 0, sinProyectoMin = 0;
  let estructuraG = 0, estructuraMin = 0;
  let facturadoTotal = 0, gastosTotal = 0, minutosTotal = 0;

  for (const f of e.facturas) {
    toma(clientes, f.clienteId, f.clienteNombre).facturado += f.baseCentimos;
    facturadoTotal += f.baseCentimos;
    // El proyecto vive en la LÍNEA (2A): una factura puede mezclar dos.
    for (const l of f.lineas) {
      if (l.proyectoId !== null) toma(proyectos, l.proyectoId, l.proyectoNombre).facturado += l.importeCentimos;
    }
  }

  for (const g of e.gastos) {
    gastosTotal += g.baseCentimos;
    if (g.clienteId !== null) toma(clientes, g.clienteId, g.clienteNombre).gastos += g.baseCentimos;
    else if (g.proyectoId !== null) sinClienteG += g.baseCentimos;
    else estructuraG += g.baseCentimos;
    if (g.proyectoId !== null) toma(proyectos, g.proyectoId, g.proyectoNombre).gastos += g.baseCentimos;
    else if (g.clienteId !== null) sinProyectoG += g.baseCentimos;
  }

  for (const t of e.tramos) {
    minutosTotal += t.minutos;
    if (t.clienteId !== null) toma(clientes, t.clienteId, t.clienteNombre).minutos += t.minutos;
    else if (t.proyectoId !== null) sinClienteMin += t.minutos;
    else estructuraMin += t.minutos;
    if (t.proyectoId !== null) toma(proyectos, t.proyectoId, t.proyectoNombre).minutos += t.minutos;
    else if (t.clienteId !== null) sinProyectoMin += t.minutos;
  }

  const ordenar = (m: Map<string, Acumulado>) =>
    [...m.entries()].map(([id, a]) => fila(id, a, coste)).sort((x, y) => y.margenCentimos - x.margenCentimos);

  // El total se calcula sobre los totales, no sumando filas: así el test de
  // cuadre comprueba de verdad que ningún eje pierde ni duplica nada.
  const horasTotal = costeDeMinutos(minutosTotal, coste);

  return {
    porCliente: ordenar(clientes),
    sinCliente: linea(sinClienteG, sinClienteMin, coste),
    porProyecto: ordenar(proyectos),
    sinProyecto: linea(sinProyectoG, sinProyectoMin, coste),
    estructura: linea(estructuraG, estructuraMin, coste),
    total: {
      facturadoCentimos: facturadoTotal,
      gastosCentimos: gastosTotal,
      minutos: minutosTotal,
      horasCentimos: horasTotal,
      margenCentimos: facturadoTotal - gastosTotal - horasTotal,
    },
  };
}
```

**Nota de cuadre:** `horasTotal` redondea la suma de minutos, y las filas redondean cada una; con minutos enteros y coste en céntimos la diferencia máxima es de un céntimo por fila. El test de cuadre usa minutos múltiplos de 60 a propósito. Si el implementador prefiere que `total.horasCentimos` sea la suma de las filas + líneas (cuadre exacto siempre), que lo haga y lo diga: es igual de honesto, y la pantalla lo mostrará cuadrado.

- [ ] **Paso 4: verde** — `npx vitest run src/tests/dinero.test.ts src/tests/rentabilidad/ src/tests/horas/`, `npx tsc --noEmit` → 0.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/lib/dinero.ts apps/atlas/src/lib/rentabilidad/ apps/atlas/src/app/dinero/horas/page.tsx apps/atlas/src/tests/dinero.test.ts apps/atlas/src/tests/rentabilidad/
git commit -m "feat(atlas): el margen de contribucion, puro y sin prorratear"
```

---

