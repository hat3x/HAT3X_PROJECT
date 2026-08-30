# Atlas 2D — Rentabilidad · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que Atlas diga, por cliente y por proyecto, qué queda después de lo que cuesta atenderlos. Al terminar, hay un coste de la hora que fija el propietario, una pantalla de rentabilidad por mes con el margen de contribución de cada cliente y de cada proyecto, una sola línea de estructura sin repartir y el total del negocio, un cierre de mes que congela el coste de la hora, y las fichas de cliente y proyecto enseñan su dinero del mes.

**Requisito previo:** 2A (facturas, líneas con `proyecto_id`, gastos), 2C (fichajes y `minutosDe` con tope) terminados.

**Arquitectura:** el margen es una **función pura** con céntimos enteros: entran las facturas del mes, sus líneas, los gastos, los tramos cerrados y el coste de la hora; salen las filas por cliente y por proyecto, las líneas sin repartir y el total. **No se prorratea nada** (§6.3). La capa de datos solo trae y convierte. La configuración vive en una tabla de **una fila** (`ajustes_economia`), no en el entorno (§4.8). El cierre de mes es una fila en `cierres_mes` con el coste de la hora congelado: un histórico que se mueve solo no sirve para comparar.

**Stack:** el de 2A–2C.

**Spec:** [`docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md`](../specs/2026-08-29-atlas-bloque-2-economia-design.md) — §4.8, §6.3, §8, decisiones 7 y 8, §13.

## Decisiones que este plan cierra

- **La nota abierta de §6.3 (gasto con proyecto pero sin cliente).** Lo directo **depende del eje**: para el margen *por cliente* es directo lo que tiene `cliente_id`; para el margen *por proyecto*, lo que tiene `proyecto_id`. Lo que no tiene el eje **no se reparte**: va a una línea aparte, con nombre honesto —«De proyectos sin cliente» bajo la tabla de clientes, «De clientes sin proyecto» bajo la de proyectos— además de «Estructura» (sin ninguno de los dos). Es la misma regla de §6.3, «se imputa lo que tiene contador», aplicada a cada pregunta. `esDirecto` del 2A no cambia: sigue significando «tiene algún contador», que es lo que la pantalla de gastos enseña.
- **Se trabaja con bases, no con totales.** El IVA no es ingreso ni coste (es deducible): el margen se calcula con `facturas.base`, `factura_lineas.importe` y `gastos.base`. El resumen de `/dinero` sigue con totales porque responde a caja, no a margen; la pantalla lo dice.
- **Horas: solo tramos cerrados** del mes (§6.3: «fichajes cerrados del periodo»), con el tope de `minutosDe`. Un abierto está en curso; se contará cuando se cierre.
- **Coste de la hora único** (decisión 8, §13): `ajustes_economia.coste_hora`. Por persona, cuando haya más de una.
- **Congelar = cerrar el mes.** `cierres_mes(mes, coste_hora, cerrado_en, cerrado_por)`. Un mes cerrado se calcula con su coste congelado; uno abierto, con el actual. Cerrar y reabrir son acciones del propietario, sin cron: nadie sabe mejor que él cuándo un mes está completo.
- **Datos fiscales del emisor** (razón social, CIF, dirección): columnas **nulas** en `ajustes_economia`, con formulario; 2E las exigirá. Aquí solo existen para que el usuario pueda rellenarlas cuando quiera.

## Restricciones globales

Las de 2A–2C siguen aplicando. Las propias:

- **Ningún `float` toca un importe.** Céntimos enteros en el cálculo; el coste de la hora se guarda `numeric(8,2)` y se convierte a céntimos al leer; `minutos × costeHoraCentimos / 60` se redondea **una vez**, por fila.
- **No se prorratea.** Ninguna función reparte un importe entre clientes o proyectos. Un test lo exige: la suma de márgenes por cliente + sin cliente + estructura = total del negocio, y lo mismo por proyecto.
- **Ninguna función de decisión lee el reloj ni la base.**
- **Solo el propietario** ve rentabilidad, ajustes y cierres. RLS con test de colaborador real.
- **Los cortes de mes son en Madrid**, con una sola función compartida (`limitesMesMadrid`), que sustituye a la privada de la pantalla de horas.
- Aplicar migraciones con `migration up --local`, nunca `db reset`; `npm run tipos`. Ninguna migración aplicada se edita. Todo `security definer` con sus tres `revoke` (aquí no hace falta ninguno).
- Tests sin suponer base vacía ni dejar basura; limpieza previa; `pg.end()` en `finally`. **`npx tsc --noEmit` con código 0, verificado por el controlador tras cada tarea.**
- Comentarios en español que explican por qué.

## Interfaces heredadas

`Sb`, `Ok`, `obtenerPerfil`, `Distintivo`, `formatear(centimos)`, `aCentimos`, `hoyEnMadrid`, `listarFacturas` (con `lineas[].proyectoId` e `importe`), `listarGastos(sb, {desde, hasta})` (con `base`, `clienteId`, `proyectoId`, nombres), `listarTramos(sb, {desde, hasta})`, `minutosDe(t, ahoraMs)`, `nombresDeClientes/Proyectos`, `obtenerCliente(sb, slug)` (`ClienteFicha` con `id`), `obtenerProyecto` (`ProyectoFicha` con `id`), la página `/ajustes` con su lista de entradas, `scripts/humo.mjs`.

---

## Tarea 1: La configuración y los cierres

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260831100000_economia_ajustes.sql`
- Test: `apps/atlas/src/tests/esquema/economia-ajustes.test.ts`

**Interfaces:**
- Produce: `ajustes_economia` (una fila, `id = 1`), `cierres_mes`.

- [ ] **Paso 1: la migración**

```sql
-- apps/atlas/supabase/migrations/20260831100000_economia_ajustes.sql
--
-- Dos valores que el bloque necesita y hoy no existen (§4.8): los datos
-- fiscales del emisor y el coste de la hora. Van en una tabla de UNA fila y no
-- en variables de entorno: son datos del negocio, se editan desde la interfaz,
-- y duplicarlos en el entorno crearía una segunda verdad.
create table ajustes_economia (
  -- El `check (id = 1)` es lo que hace que solo pueda haber una fila.
  id            smallint primary key check (id = 1),
  razon_social  text,
  cif           text,
  direccion     text,
  -- Decisión 8: un número que fija el propietario, no un derivado. Cero hasta
  -- que lo ponga: la rentabilidad con coste cero es solo ingresos menos
  -- gastos, y la pantalla avisa de que falta.
  coste_hora    numeric(8,2) not null default 0 check (coste_hora >= 0),
  actualizado_en timestamptz not null default now()
);
insert into ajustes_economia (id) values (1);

-- El cierre de un mes congela el coste de la hora con el que se calculó. Si no,
-- cambiarlo mañana reescribiría la rentabilidad de todos los meses pasados, y
-- un histórico que se mueve solo no sirve para comparar nada.
create table cierres_mes (
  mes         date primary key check (extract(day from mes) = 1),
  coste_hora  numeric(8,2) not null check (coste_hora >= 0),
  cerrado_en  timestamptz not null default now(),
  cerrado_por uuid references perfiles(id) on delete set null
);

grant select, insert, update, delete on ajustes_economia, cierres_mes to authenticated;
grant all privileges on ajustes_economia, cierres_mes to service_role;

alter table ajustes_economia enable row level security;
alter table cierres_mes      enable row level security;

-- Solo el propietario. Un colaborador no ve el coste de la hora ni los cierres:
-- son la mitad del margen, y el margen es del propietario (§5).
create policy ajustes_economia_propietario on ajustes_economia for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy cierres_propietario on cierres_mes for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
```

- [ ] **Paso 2: aplicar y regenerar tipos**

```bash
cd apps/atlas && npx supabase migration up --local && npm run tipos
```

- [ ] **Paso 3: el test**

```ts
// src/tests/esquema/economia-ajustes.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const CORREO_COLAB = "colab-economia-esquema@atlas.test";
const MES_PRUEBA = "2091-01-01"; // un mes que ningún otro test cierra

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idColab = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_COLAB) await admin.auth.admin.deleteUser(u.id);
  }
  await pg.query(`DELETE FROM cierres_mes WHERE mes = $1`, [MES_PRUEBA]);
  const creado = await admin.auth.admin.createUser({ email: CORREO_COLAB, password: "contrasena-de-prueba", email_confirm: true });
  if (creado.error) throw creado.error;
  idColab = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, false)`, [idColab]);
  sbColab = createClient<Database>(URL_API, ANON, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "ee-c" } });
  const { error } = await sbColab.auth.signInWithPassword({ email: CORREO_COLAB, password: "contrasena-de-prueba" });
  if (error) throw error;
});

afterAll(async () => {
  try {
    try {
      await pg.query(`DELETE FROM cierres_mes WHERE mes = $1`, [MES_PRUEBA]);
    } catch {
      /* ya no está */
    }
    if (idColab !== "") {
      try {
        await admin.auth.admin.deleteUser(idColab);
      } catch {
        /* ya no está */
      }
    }
  } finally {
    await pg.end();
  }
});

describe("ajustes_economia", () => {
  it("nace con una fila y coste cero", async () => {
    const { rows } = await pg.query(`SELECT id, coste_hora FROM ajustes_economia`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].coste_hora)).toBe(0);
  });

  it("no admite una segunda fila", async () => {
    await expect(pg.query(`INSERT INTO ajustes_economia (id) VALUES (2)`)).rejects.toThrow(/ajustes_economia_id_check/);
  });

  it("un colaborador no la ve", async () => {
    const { data } = await sbColab.from("ajustes_economia").select("coste_hora");
    expect(data).toEqual([]);
  });
});

describe("cierres_mes", () => {
  it("solo admite el día 1", async () => {
    await expect(pg.query(`INSERT INTO cierres_mes (mes, coste_hora) VALUES ('2091-01-15', 30)`)).rejects.toThrow(/cierres_mes_mes_check/);
  });

  it("un colaborador ni ve ni cierra", async () => {
    await pg.query(`INSERT INTO cierres_mes (mes, coste_hora) VALUES ($1, 30)`, [MES_PRUEBA]);
    const { data } = await sbColab.from("cierres_mes").select("mes").eq("mes", MES_PRUEBA);
    expect(data).toEqual([]);
    const { error } = await sbColab.from("cierres_mes").insert({ mes: "2091-02-01", coste_hora: 30 });
    expect(error?.message).toMatch(/row-level security/);
  });
});
```

- [ ] **Paso 4: ejecutar dos veces** — `npx vitest run src/tests/esquema/economia-ajustes.test.ts` → 5 tests.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/supabase/migrations/20260831100000_economia_ajustes.sql apps/atlas/src/tests/esquema/economia-ajustes.test.ts apps/atlas/src/types/supabase.ts
git commit -m "feat(atlas): la configuracion economica de una fila y los cierres de mes"
```

---

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

## Tarea 3: Leer lo que el margen necesita, y guardar lo que lo configura

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/ajustes-economia.ts`
- Crear: `apps/atlas/src/lib/db/cierres.ts`
- Crear: `apps/atlas/src/lib/db/rentabilidad.ts`
- Test: `apps/atlas/src/tests/db/rentabilidad.test.ts`

**Interfaces:**
- `ajustes-economia.ts`: `type AjustesEconomia = { razonSocial: string | null; cif: string | null; direccion: string | null; costeHoraCentimos: number }`, `leerAjustes(sb): Promise<AjustesEconomia>`, `validarAjustes(e: EntradaAjustes): Ok`, `escribirAjustes(sb, e: EntradaAjustes): Promise<Ok>` con `type EntradaAjustes = { razonSocial: string | null; cif: string | null; direccion: string | null; costeHoraCentimos: number }`.
- `cierres.ts`: `type Cierre = { mes: string; costeHoraCentimos: number; cerradoEn: string }`, `cierreDe(sb, mes: string): Promise<Cierre | null>` (`mes` = `AAAA-MM`), `cerrarMes(sb, mes, costeHoraCentimos, ahoraMs): Promise<Ok>` (rechaza cerrar el mes en curso o uno futuro: «no se cierra lo que no ha terminado»), `reabrirMes(sb, mes): Promise<Ok>`.
- `rentabilidad.ts`: `rentabilidadDelMes(sb, mes): Promise<{ r: Rentabilidad; costeHoraCentimos: number; cerrado: Cierre | null }>` — trae facturas emitidas con `fecha_emision` en el mes (con líneas), gastos con `fecha` en el mes, tramos **cerrados** con `inicio` en el mes (por `limitesMesMadrid`), el coste (del cierre si lo hay, si no de ajustes), y llama a `calcularMargen`.

- [ ] **Paso 1: el test**

```ts
// src/tests/db/rentabilidad.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { leerAjustes, escribirAjustes, validarAjustes } from "@/lib/db/ajustes-economia";
import { cierreDe, cerrarMes, reabrirMes } from "@/lib/db/cierres";
import { rentabilidadDelMes } from "@/lib/db/rentabilidad";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-rentabilidad@atlas.test";
const CORREO_COLAB = "colab-rentabilidad@atlas.test";
const SLUG = "rentabilidad-prueba";
// Un mes lejano que ningún otro test toca: la rentabilidad se filtra por fecha
// y el propietario ve TODO, así que el aislamiento es por mes, no por fila.
const MES = "2090-03";
const AHORA = Date.parse("2090-05-15T12:00:00Z");

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColab: ReturnType<typeof createClient<Database>>;
let idDuenyo = "";
let idColab = "";
let idCliente = "";
let idProyecto = "";
let idFactura = "";
let costeOriginal = 0;

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({ email: correo, password: "contrasena-de-prueba", email_confirm: true });
  if (creado.error) throw creado.error;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [creado.data.user.id, propietario]);
  const sb = createClient<Database>(URL_API, ANON, { auth: { persistSession: false, autoRefreshToken: false, storageKey: clave } });
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: "contrasena-de-prueba" });
  if (error) throw error;
  return { sb, id: creado.data.user.id };
}

async function limpiarDatos() {
  await pg.query(`DELETE FROM cierres_mes WHERE mes = $1`, [`${MES}-01`]);
  await pg.query(`DELETE FROM fichajes WHERE inicio >= '2090-03-01' AND inicio < '2090-04-01'`);
  await pg.query(`DELETE FROM gastos WHERE fecha >= '2090-03-01' AND fecha < '2090-04-01'`);
  await pg.query(`DELETE FROM facturas WHERE fecha_emision >= '2090-03-01' AND fecha_emision < '2090-04-01'`);
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG]);
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG]);
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await limpiarDatos();
  const { rows } = await pg.query(`SELECT coste_hora FROM ajustes_economia WHERE id = 1`);
  costeOriginal = Math.round(Number(rows[0].coste_hora) * 100);

  const d = await altaUsuario(CORREO_DUENYO, true, "rt-d");
  const c = await altaUsuario(CORREO_COLAB, false, "rt-c");
  sbDuenyo = d.sb; idDuenyo = d.id; sbColab = c.sb; idColab = c.id;

  idCliente = (await pg.query(`INSERT INTO clientes (nombre, slug) VALUES ('Cliente rentabilidad', $1) RETURNING id`, [SLUG])).rows[0].id;
  idProyecto = (await pg.query(`INSERT INTO proyectos (nombre, slug, tipo, estado) VALUES ('Proyecto rentabilidad', $1, 'web-app', 'produccion') RETURNING id`, [SLUG])).rows[0].id;

  // Una factura emitida de 350 € base (dos líneas: 290 al proyecto, 60 sin proyecto),
  // un borrador que NO debe contar, un gasto con cliente de 40 € base, un gasto
  // de estructura de 20 €, un tramo cerrado de 2 h al cliente y uno ABIERTO que no cuenta.
  idFactura = (await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado)
     VALUES ('externa','RT',1,$1,'2090-03-10',350,21,73.5,423.5,'emitida') RETURNING id`, [idCliente])).rows[0].id;
  await pg.query(`INSERT INTO factura_lineas (factura_id, orden, concepto, cantidad, precio_unitario, importe, proyecto_id) VALUES ($1,0,'Sara',1,290,290,$2), ($1,1,'Otro',1,60,60,NULL)`, [idFactura, idProyecto]);
  await pg.query(`INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision, base, iva_tipo, iva_cuota, total, estado) VALUES ('externa','RT',NULL,$1,'2090-03-11',999,21,0,999,'borrador')`, [idCliente]);
  await pg.query(`INSERT INTO gastos (fecha, concepto, base, iva, total, categoria, cliente_id) VALUES ('2090-03-05','Minutos',40,8.4,48.4,'ia',$1)`, [idCliente]);
  await pg.query(`INSERT INTO gastos (fecha, concepto, base, iva, total, categoria) VALUES ('2090-03-06','Vercel',20,4.2,24.2,'infraestructura')`);
  await pg.query(`INSERT INTO fichajes (usuario_id, cliente_id, proyecto_id, inicio, fin) VALUES ($1,$2,$3,'2090-03-07T08:00:00Z','2090-03-07T10:00:00Z')`, [idDuenyo, idCliente, idProyecto]);
  await pg.query(`INSERT INTO fichajes (usuario_id, cliente_id, inicio) VALUES ($1,$2,'2090-03-08T08:00:00Z')`, [idDuenyo, idCliente]);
});

afterAll(async () => {
  try {
    try { await limpiarDatos(); } catch { /* ya no está */ }
    try { await pg.query(`UPDATE ajustes_economia SET coste_hora = $1 WHERE id = 1`, [costeOriginal / 100]); } catch { /* ya no está */ }
    for (const id of [idDuenyo, idColab]) {
      if (id === "") continue;
      try { await pg.query(`DELETE FROM fichajes WHERE usuario_id = $1`, [id]); } catch { /* ya no está */ }
      try { await admin.auth.admin.deleteUser(id); } catch { /* ya no está */ }
    }
  } finally {
    await pg.end();
  }
});

describe("ajustes", () => {
  it("validar: el coste no puede ser negativo ni el CIF una cadena vacía disfrazada", () => {
    expect(validarAjustes({ razonSocial: null, cif: null, direccion: null, costeHoraCentimos: -1 }).ok).toBe(false);
    expect(validarAjustes({ razonSocial: "  ", cif: "", direccion: null, costeHoraCentimos: 0 })).toEqual({ ok: true });
  });

  it("el propietario fija el coste de la hora y lo relee en céntimos", async () => {
    const r = await escribirAjustes(sbDuenyo, { razonSocial: "HAT3X S.L.", cif: null, direccion: null, costeHoraCentimos: 3000 });
    expect(r).toEqual({ ok: true });
    const a = await leerAjustes(sbDuenyo);
    expect(a.costeHoraCentimos).toBe(3000);
    expect(a.razonSocial).toBe("HAT3X S.L.");
  });

  it("un colaborador no lee ni escribe", async () => {
    await expect(leerAjustes(sbColab)).rejects.toThrow(/no hay configuración|permission|row/i);
    const r = await escribirAjustes(sbColab, { razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 1 });
    expect(r.ok).toBe(false);
  });
});

describe("rentabilidadDelMes", () => {
  it("cuenta la factura emitida (no el borrador), los gastos por base y solo el tramo cerrado", async () => {
    await escribirAjustes(sbDuenyo, { razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3000 });
    const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sbDuenyo, MES);
    expect(cerrado).toBeNull();
    expect(costeHoraCentimos).toBe(3000);
    const c = r.porCliente.find((f) => f.id === idCliente)!;
    expect(c.facturadoCentimos).toBe(35000);
    expect(c.gastosCentimos).toBe(4000);
    expect(c.minutos).toBe(120);
    expect(c.horasCentimos).toBe(6000);
    expect(c.margenCentimos).toBe(25000);
    const p = r.porProyecto.find((f) => f.id === idProyecto)!;
    expect(p.facturadoCentimos).toBe(29000);
    expect(r.estructura.gastosCentimos).toBeGreaterThanOrEqual(2000);
  });

  it("un colaborador no ve nada del margen", async () => {
    await expect(rentabilidadDelMes(sbColab, MES)).rejects.toThrow();
  });
});

describe("cierres", () => {
  it("no se cierra el mes en curso ni uno futuro", async () => {
    const r = await cerrarMes(sbDuenyo, "2090-05", 3000, AHORA);
    expect(r).toEqual({ ok: false, error: "No se cierra un mes que no ha terminado." });
  });

  it("cerrar congela el coste: cambiarlo después no mueve el mes cerrado", async () => {
    expect(await cerrarMes(sbDuenyo, MES, 3000, AHORA)).toEqual({ ok: true });
    await escribirAjustes(sbDuenyo, { razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 9900 });
    const { costeHoraCentimos, cerrado } = await rentabilidadDelMes(sbDuenyo, MES);
    expect(costeHoraCentimos).toBe(3000);
    expect(cerrado?.mes).toBe(MES);
    expect(await cierreDe(sbDuenyo, MES)).not.toBeNull();
  });

  it("cerrar dos veces lo dice", async () => {
    const r = await cerrarMes(sbDuenyo, MES, 3000, AHORA);
    expect(r).toEqual({ ok: false, error: "Ese mes ya está cerrado." });
  });

  it("reabrir vuelve al coste actual", async () => {
    expect(await reabrirMes(sbDuenyo, MES)).toEqual({ ok: true });
    const { costeHoraCentimos } = await rentabilidadDelMes(sbDuenyo, MES);
    expect(costeHoraCentimos).toBe(9900);
    expect(await reabrirMes(sbDuenyo, MES)).toEqual({ ok: false, error: "Ese mes no estaba cerrado." });
  });
});
```

- [ ] **Paso 2: falla** — `npx vitest run src/tests/db/rentabilidad.test.ts`.

- [ ] **Paso 3: implementar**

```ts
// src/lib/db/ajustes-economia.ts
//
// La configuración económica: una fila (§4.8). Recibe `sb` para probarse; el
// envoltorio "use server" está en `acciones-economia.ts`.
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";

export type AjustesEconomia = {
  razonSocial: string | null;
  cif: string | null;
  direccion: string | null;
  costeHoraCentimos: number;
};

export type EntradaAjustes = AjustesEconomia;

const limpia = (s: string | null) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Puro. Una acción de servidor es un endpoint público: se valida aquí, no en el formulario. */
export function validarAjustes(e: EntradaAjustes): Ok {
  if (!Number.isInteger(e.costeHoraCentimos) || e.costeHoraCentimos < 0) {
    return { ok: false, error: "El coste de la hora tiene que ser un importe de cero o más." };
  }
  if (e.costeHoraCentimos > 99_999_999) {
    return { ok: false, error: "El coste de la hora no cabe en la base." };
  }
  return { ok: true };
}

export async function leerAjustes(sb: Sb): Promise<AjustesEconomia> {
  const { data, error } = await sb
    .from("ajustes_economia")
    .select("razon_social, cif, direccion, coste_hora")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  // RLS devuelve cero filas al colaborador. Lanzar y no devolver ceros: unos
  // ceros parecerían «no configurado» y no «no tienes permiso».
  if (!data) throw new Error("No hay configuración económica visible para este usuario.");
  return {
    razonSocial: data.razon_social,
    cif: data.cif,
    direccion: data.direccion,
    // numeric(8,2) → céntimos, una sola vez.
    costeHoraCentimos: Math.round(Number(data.coste_hora) * 100),
  };
}

export async function escribirAjustes(sb: Sb, e: EntradaAjustes): Promise<Ok> {
  const valido = validarAjustes(e);
  if (!valido.ok) return valido;
  const { data, error } = await sb
    .from("ajustes_economia")
    .update({
      razon_social: limpia(e.razonSocial),
      cif: limpia(e.cif),
      direccion: limpia(e.direccion),
      coste_hora: e.costeHoraCentimos / 100,
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", 1)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "No tienes permiso para cambiar la configuración." };
  return { ok: true };
}
```

```ts
// src/lib/db/cierres.ts
//
// Cerrar un mes congela el coste de la hora con el que se calculó (§4.8).
//
import type { Sb } from "./clientes";
import type { Ok } from "./proyectos";
import { mesDe } from "@/lib/dinero";

export type Cierre = { mes: string; costeHoraCentimos: number; cerradoEn: string };

export async function cierreDe(sb: Sb, mes: string): Promise<Cierre | null> {
  const { data, error } = await sb
    .from("cierres_mes")
    .select("mes, coste_hora, cerrado_en")
    .eq("mes", `${mes}-01`)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { mes: mesDe(data.mes), costeHoraCentimos: Math.round(Number(data.coste_hora) * 100), cerradoEn: data.cerrado_en }
    : null;
}

export async function cerrarMes(sb: Sb, mes: string, costeHoraCentimos: number, ahoraMs: number): Promise<Ok> {
  // El mes en curso no se cierra: le faltan días. Se compara por texto de mes
  // porque el instante viene por parámetro y así se prueba sin esperar.
  const mesActual = new Date(ahoraMs).toISOString().slice(0, 7);
  if (mes >= mesActual) return { ok: false, error: "No se cierra un mes que no ha terminado." };
  const {
    data: { user },
  } = await sb.auth.getUser();
  const { error } = await sb.from("cierres_mes").insert({
    mes: `${mes}-01`,
    coste_hora: costeHoraCentimos / 100,
    cerrado_por: user?.id ?? null,
  });
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, error: "Ese mes ya está cerrado." };
  return { ok: false, error: error.message };
}

export async function reabrirMes(sb: Sb, mes: string): Promise<Ok> {
  const { data, error } = await sb.from("cierres_mes").delete().eq("mes", `${mes}-01`).select("mes");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Ese mes no estaba cerrado." };
  return { ok: true };
}
```

```ts
// src/lib/db/rentabilidad.ts
//
// Trae lo que el margen necesita y lo convierte a céntimos. No decide nada:
// decide `calcularMargen`. No filtra por permisos: RLS deja fuera al
// colaborador en las cuatro tablas, y `leerAjustes` lanza si no ve la fila.
//
import type { Sb } from "./clientes";
import { listarFacturas } from "./facturas";
import { listarGastos } from "./gastos";
import { listarTramos } from "./fichajes";
import { leerAjustes } from "./ajustes-economia";
import { cierreDe, type Cierre } from "./cierres";
import { limitesMesMadrid, mesVecino } from "@/lib/dinero";
import { minutosDe } from "@/lib/horas/tramos";
import { calcularMargen, type Rentabilidad, type FacturaMes, type GastoMes, type TramoMes } from "@/lib/rentabilidad/margen";

const cent = (n: number) => Math.round(n * 100);

export async function rentabilidadDelMes(
  sb: Sb,
  mes: string
): Promise<{ r: Rentabilidad; costeHoraCentimos: number; cerrado: Cierre | null }> {
  const desdeDia = `${mes}-01`;
  const hastaDia = `${mesVecino(mes, 1)}-01`; // primer día del mes siguiente
  const rango = limitesMesMadrid(mes);

  const [ajustes, cerrado, facturas, gastos, tramos] = await Promise.all([
    leerAjustes(sb),
    cierreDe(sb, mes),
    listarFacturas(sb, {}),
    listarGastos(sb, { desde: desdeDia, hasta: hastaDia }),
    listarTramos(sb, rango),
  ]);

  // `listarFacturas` no filtra por fecha (trae las últimas 200): se filtra aquí
  // por mes de emisión y estado. Si algún día hay más de 200 en un mes,
  // ampliarla es de `facturas.ts`, no de aquí.
  const facturasMes: FacturaMes[] = facturas
    .filter((f) => f.estado === "emitida" && f.fechaEmision >= desdeDia && f.fechaEmision < hastaDia)
    .map((f) => ({
      clienteId: f.clienteId,
      clienteNombre: f.clienteNombre,
      baseCentimos: cent(f.base),
      lineas: f.lineas.map((l) => ({ proyectoId: l.proyectoId, proyectoNombre: l.proyectoNombre ?? null, importeCentimos: cent(l.importe) })),
    }));

  const gastosMes: GastoMes[] = gastos
    .filter((g) => g.fecha < hastaDia)
    .map((g) => ({ clienteId: g.clienteId, clienteNombre: g.clienteNombre, proyectoId: g.proyectoId, proyectoNombre: g.proyectoNombre, baseCentimos: cent(g.base) }));

  // Solo cerrados (§6.3). Un abierto está en curso y se contará al cerrarse.
  const tramosMes: TramoMes[] = tramos
    .filter((t) => t.fin !== null)
    .map((t) => ({ clienteId: t.clienteId, clienteNombre: t.clienteNombre, proyectoId: t.proyectoId, proyectoNombre: t.proyectoNombre, minutos: minutosDe(t, 0) }));

  const costeHoraCentimos = cerrado ? cerrado.costeHoraCentimos : ajustes.costeHoraCentimos;
  return { r: calcularMargen({ facturas: facturasMes, gastos: gastosMes, tramos: tramosMes, costeHoraCentimos }), costeHoraCentimos, cerrado };
}
```

**Notas para el implementador:** `listarGastos` con `hasta` inclusivo (`lte`) — por eso se filtra `< hastaDia` encima; mira su firma real. `LineaFactura` puede no traer `proyectoNombre`: si no lo trae, resuélvelo con `nombresDeProyectos` una vez y un `Map`, y dilo. `minutosDe(t, 0)` con `fin` no nulo no usa `ahora`.

- [ ] **Paso 4: verde, dos veces** — `npx vitest run src/tests/db/rentabilidad.test.ts`; `npx tsc --noEmit` → 0.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/lib/db/ajustes-economia.ts apps/atlas/src/lib/db/cierres.ts apps/atlas/src/lib/db/rentabilidad.ts apps/atlas/src/tests/db/rentabilidad.test.ts
git commit -m "feat(atlas): leer el margen del mes, la configuracion economica y los cierres"
```

---

## Tarea 4: Ajustes → Economía

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/acciones-economia.ts`
- Crear: `apps/atlas/src/components/ajustes/FormEconomia.tsx`
- Crear: `apps/atlas/src/app/ajustes/economia/page.tsx`
- Modificar: `apps/atlas/src/app/ajustes/page.tsx` (entrada nueva, solo propietario)
- Test: `apps/atlas/src/tests/componentes/form-economia.test.tsx`

- [ ] **Paso 1: la acción**

```ts
// src/lib/db/acciones-economia.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirAjustes, type EntradaAjustes } from "./ajustes-economia";
import { cerrarMes, reabrirMes } from "./cierres";
import type { Ok } from "./proyectos";

// Envoltorios del límite HTTP; validar y escribir es de los módulos que
// reciben `sb`. Un módulo "use server" expone TODO lo exportado.

export async function guardarAjustesEconomia(entrada: EntradaAjustes): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirAjustes(sb, entrada);
  if (!r.ok) return r;
  revalidatePath("/ajustes/economia");
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}

export async function cerrarMesAccion(mes: string, costeHoraCentimos: number): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await cerrarMes(sb, mes, costeHoraCentimos, Date.now());
  if (!r.ok) return r;
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}

export async function reabrirMesAccion(mes: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await reabrirMes(sb, mes);
  if (!r.ok) return r;
  revalidatePath("/dinero/rentabilidad");
  return { ok: true };
}
```

- [ ] **Paso 2: el test del formulario** (copia la forma de `form-gasto.test.tsx`)

```tsx
// src/tests/componentes/form-economia.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FormEconomia } from "@/components/ajustes/FormEconomia";

const acciones = vi.hoisted(() => ({ guardarAjustesEconomia: vi.fn() }));
vi.mock("@/lib/db/acciones-economia", () => acciones);

const ACTUAL = { razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3000 };

beforeEach(() => acciones.guardarAjustesEconomia.mockReset().mockResolvedValue({ ok: true }));

describe("FormEconomia", () => {
  it("enseña el coste actual en euros", () => {
    render(<FormEconomia actual={ACTUAL} />);
    expect(screen.getByLabelText(/coste de la hora/i)).toHaveValue("30,00");
  });

  it("manda céntimos, no euros, y los textos vacíos como null", async () => {
    render(<FormEconomia actual={ACTUAL} />);
    fireEvent.change(screen.getByLabelText(/coste de la hora/i), { target: { value: "32,5" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() =>
      expect(acciones.guardarAjustesEconomia).toHaveBeenCalledWith({ razonSocial: null, cif: null, direccion: null, costeHoraCentimos: 3250 })
    );
  });

  it("un coste que no es un importe no llega a la acción", async () => {
    render(<FormEconomia actual={ACTUAL} />);
    fireEvent.change(screen.getByLabelText(/coste de la hora/i), { target: { value: "treinta" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/importe/i);
    expect(acciones.guardarAjustesEconomia).not.toHaveBeenCalled();
  });
});
```

- [ ] **Paso 3: el formulario y la pantalla**

```tsx
// src/components/ajustes/FormEconomia.tsx
"use client";

import { useState } from "react";
import { guardarAjustesEconomia } from "@/lib/db/acciones-economia";
import { aCentimos } from "@/lib/dinero";
import type { AjustesEconomia } from "@/lib/db/ajustes-economia";

/**
 * El coste de la hora y los datos fiscales del emisor. El coste es un número
 * que fija el propietario (decisión 8), no un derivado: por eso es un campo y
 * no un cálculo. Los datos fiscales pueden quedar vacíos hasta que 2E los exija.
 */
export function FormEconomia({ actual }: { actual: AjustesEconomia }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    setGuardado(false);
    const coste = aCentimos(String(datos.get("costeHora") ?? ""));
    if (coste === null) return setError("El coste de la hora no es un importe.");
    const texto = (n: string) => {
      const t = String(datos.get(n) ?? "").trim();
      return t === "" ? null : t;
    };
    setEnviando(true);
    try {
      const r = await guardarAjustesEconomia({
        razonSocial: texto("razonSocial"),
        cif: texto("cif"),
        direccion: texto("direccion"),
        costeHoraCentimos: coste,
      });
      if (r.ok) setGuardado(true);
      else setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión e inténtalo otra vez.");
    } finally {
      setEnviando(false);
    }
  }

  const euros = (actual.costeHoraCentimos / 100).toFixed(2).replace(".", ",");

  return (
    <form onSubmit={alEnviar} className="cristal space-y-3 p-4">
      <label className="block text-sm">
        <span className="mb-1 block">Coste de la hora (€)</span>
        <input name="costeHora" inputMode="decimal" defaultValue={euros} aria-label="Coste de la hora" className="w-full rounded-lg px-2 py-1.5 sm:w-48" />
      </label>
      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Se aplica a los meses abiertos. Un mes cerrado conserva el coste con el que se cerró.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block">Razón social</span>
          <input name="razonSocial" defaultValue={actual.razonSocial ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">CIF</span>
          <input name="cif" defaultValue={actual.cif ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Dirección</span>
          <input name="direccion" defaultValue={actual.direccion ?? ""} className="w-full rounded-lg px-2 py-1.5" />
        </label>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
      {guardado && <p role="status" className="text-sm">Guardado.</p>}
      <button type="submit" disabled={enviando} className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
        Guardar
      </button>
    </form>
  );
}
```

```tsx
// src/app/ajustes/economia/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { leerAjustes } from "@/lib/db/ajustes-economia";
import { FormEconomia } from "@/components/ajustes/FormEconomia";

export default async function PaginaEconomia() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya negaría la fila, pero un 404 es más honesto que un error.
  if (!perfil?.esPropietario) notFound();
  const actual = await leerAjustes(sb);

  return (
    <section className="max-w-3xl space-y-4">
      <header>
        <Link href="/ajustes" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Ajustes
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Economía</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que cuesta una hora de trabajo, y quién emite las facturas. Viven aquí y no en el
          entorno porque son datos del negocio, y se cambian desde aquí.
        </p>
      </header>
      <FormEconomia actual={actual} />
    </section>
  );
}
```

En `src/app/ajustes/page.tsx`, añadir a la lista (con el icono `Coins` de lucide) una entrada `href: "/ajustes/economia"`, título «Economía», descripción «Coste de la hora y datos del emisor», **visible solo al propietario**, siguiendo cómo esa página ya filtra las entradas (`visibles`).

- [ ] **Paso 4: comprobar** — `npx vitest run src/tests/componentes/form-economia.test.tsx`, `npx tsc --noEmit` → 0.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/lib/db/acciones-economia.ts apps/atlas/src/components/ajustes/FormEconomia.tsx apps/atlas/src/app/ajustes/ apps/atlas/src/tests/componentes/form-economia.test.tsx
git commit -m "feat(atlas): ajustes de economia — el coste de la hora y el emisor"
```

---

## Tarea 5: La pantalla de rentabilidad

**Ficheros:**
- Crear: `apps/atlas/src/app/dinero/rentabilidad/page.tsx`
- Crear: `apps/atlas/src/components/dinero/BotonCierreMes.tsx`
- Modificar: `apps/atlas/src/app/dinero/page.tsx` (enlace)
- Modificar: `apps/atlas/scripts/humo.mjs` (entrada `{ ruta: "/dinero/rentabilidad", exige: ["Rentabilidad"] }`)

- [ ] **Paso 1: el botón de cierre**

```tsx
// src/components/dinero/BotonCierreMes.tsx
"use client";

import { useState } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cerrarMesAccion, reabrirMesAccion } from "@/lib/db/acciones-economia";

/**
 * Cerrar un mes congela el coste de la hora con el que se calculó. Reabrirlo
 * vuelve al coste actual. Son dos botones y no un conmutador para que cada
 * acción diga lo que hace.
 */
export function BotonCierreMes({ mes, cerrado, costeHoraCentimos }: { mes: string; cerrado: boolean; costeHoraCentimos: number }) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    setEnviando(true);
    try {
      const r = await accion();
      if (!r.ok) setError(r.error);
    } catch {
      setError("No se pudo guardar. Comprueba la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {cerrado ? (
        <button type="button" disabled={enviando} onClick={() => ejecutar(() => reabrirMesAccion(mes))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
          <LockOpen size={14} aria-hidden="true" /> Reabrir el mes
        </button>
      ) : (
        <button type="button" disabled={enviando} onClick={() => ejecutar(() => cerrarMesAccion(mes, costeHoraCentimos))} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" style={{ background: "var(--cristal-fondo-denso)" }}>
          <Lock size={14} aria-hidden="true" /> Cerrar el mes
        </button>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Paso 2: la pantalla**

```tsx
// src/app/dinero/rentabilidad/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { rentabilidadDelMes } from "@/lib/db/rentabilidad";
import { formatear, hoyEnMadrid, mesDe, mesVecino } from "@/lib/dinero";
import { formatearMinutos } from "@/lib/horas/tramos";
import type { FilaMargen, Linea } from "@/lib/rentabilidad/margen";
import { BotonCierreMes } from "@/components/dinero/BotonCierreMes";
import { Distintivo } from "@/components/ui/Distintivo";

const MES = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" });

function Tabla({ titulo, filas, eje, lineaExtra, extraNombre, estructura }: {
  titulo: string; filas: FilaMargen[]; eje: string; lineaExtra: Linea; extraNombre: string; estructura: Linea;
}) {
  const th = "px-4 py-2 font-medium";
  const td = "whitespace-nowrap px-4 py-2.5 tabular-nums text-right";
  const total = (l: Linea) => l.gastosCentimos + l.horasCentimos;
  return (
    <div className="space-y-2">
      <h2 className="pt-2 text-lg font-semibold">{titulo}</h2>
      <div className="cristal cristal-denso overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider" style={{ borderColor: "var(--cristal-borde)", color: "var(--texto-tenue)" }}>
              <th scope="col" className={th}>{eje}</th>
              <th scope="col" className={`${th} text-right`}>Facturado</th>
              <th scope="col" className={`${th} text-right`}>Gastos directos</th>
              <th scope="col" className={`${th} text-right`}>Horas</th>
              <th scope="col" className={`${th} text-right`}>Coste horas</th>
              <th scope="col" className={`${th} text-right`}>Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
            {filas.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-4 text-center" style={{ color: "var(--texto-tenue)" }}>Nada este mes.</td></tr>
            )}
            {filas.map((f) => (
              <tr key={f.id}>
                <td className="px-4 py-2.5">{f.nombre}</td>
                <td className={td}>{formatear(f.facturadoCentimos)}</td>
                <td className={td}>{formatear(f.gastosCentimos)}</td>
                <td className={td}>{formatearMinutos(f.minutos)}</td>
                <td className={td}>{formatear(f.horasCentimos)}</td>
                <td className={`${td} font-semibold`} style={f.margenCentimos < 0 ? { color: "var(--estado-caido)" } : undefined}>{formatear(f.margenCentimos)}</td>
              </tr>
            ))}
            {/* Las dos líneas de abajo NO se reparten (§6.3): repartirlas
                inventaría una precisión por cliente que el dato no tiene. */}
            {total(lineaExtra) > 0 && (
              <tr style={{ color: "var(--texto-tenue)" }}>
                <td className="px-4 py-2.5">{extraNombre}</td>
                <td className={td}>—</td>
                <td className={td}>{formatear(lineaExtra.gastosCentimos)}</td>
                <td className={td}>{formatearMinutos(lineaExtra.minutos)}</td>
                <td className={td}>{formatear(lineaExtra.horasCentimos)}</td>
                <td className={td}>−{formatear(total(lineaExtra))}</td>
              </tr>
            )}
            <tr style={{ color: "var(--texto-tenue)" }}>
              <td className="px-4 py-2.5">Estructura, sin repartir</td>
              <td className={td}>—</td>
              <td className={td}>{formatear(estructura.gastosCentimos)}</td>
              <td className={td}>{formatearMinutos(estructura.minutos)}</td>
              <td className={td}>{formatear(estructura.horasCentimos)}</td>
              <td className={td}>−{formatear(total(estructura))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function PaginaRentabilidad({ searchParams }: { searchParams: { mes?: string } }) {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) notFound();

  const hoy = hoyEnMadrid();
  const mesActual = mesDe(hoy);
  // Un `mes` que no sea AAAA-MM no rompe: se vuelve al actual.
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.mes ?? "") ? searchParams.mes! : mesActual;
  const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sb, mes);
  const esActual = mes === mesActual;

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <Link href="/dinero" className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Rentabilidad</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que queda de cada cliente después de lo que cuesta atenderlo. Con bases, sin IVA, y sin
          repartir lo que no tiene contador.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/dinero/rentabilidad?mes=${mesVecino(mes, -1)}`} className="text-sm underline opacity-80 hover:opacity-100">← anterior</Link>
        <span className="text-lg font-semibold capitalize">{MES.format(new Date(`${mes}-01T12:00:00Z`))}</span>
        {!esActual && <Link href={`/dinero/rentabilidad?mes=${mesVecino(mes, 1)}`} className="text-sm underline opacity-80 hover:opacity-100">siguiente →</Link>}
        {cerrado ? (
          <Distintivo estado="ok" texto={`Cerrado a ${formatear(cerrado.costeHoraCentimos)}/h`} />
        ) : costeHoraCentimos === 0 ? (
          <Distintivo estado="aviso" texto="Sin coste de la hora: las horas cuentan cero" />
        ) : (
          <span className="text-sm" style={{ color: "var(--texto-tenue)" }}>{formatear(costeHoraCentimos)}/h</span>
        )}
        {/* El mes en curso no se cierra: le faltan días. */}
        {!esActual && <BotonCierreMes mes={mes} cerrado={cerrado !== null} costeHoraCentimos={costeHoraCentimos} />}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Facturado (base)", r.total.facturadoCentimos],
          ["Gastos (base)", r.total.gastosCentimos],
          ["Horas", r.total.horasCentimos],
          ["Resultado del negocio", r.total.margenCentimos],
        ].map(([t, v]) => (
          <div key={String(t)} className="cristal cristal-denso p-4">
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>{t}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums" style={Number(v) < 0 && t === "Resultado del negocio" ? { color: "var(--estado-caido)" } : undefined}>{formatear(Number(v))}</div>
          </div>
        ))}
      </div>

      <Tabla titulo="Por cliente" eje="Cliente" filas={r.porCliente} lineaExtra={r.sinCliente} extraNombre="De proyectos sin cliente" estructura={r.estructura} />
      <Tabla titulo="Por proyecto" eje="Proyecto" filas={r.porProyecto} lineaExtra={r.sinProyecto} extraNombre="De clientes sin proyecto" estructura={r.estructura} />
      <p className="text-xs" style={{ color: "var(--texto-tenue)" }}>
        Lo facturado sin proyecto en las líneas no aparece en la tabla de proyectos; sí en el total.
      </p>
    </section>
  );
}
```

- [ ] **Paso 3: enlace y humo.** En `/dinero`, junto a los otros: «Ver la rentabilidad por cliente y por proyecto →» a `/dinero/rentabilidad`. En `humo.mjs`: `{ ruta: "/dinero/rentabilidad", exige: ["Rentabilidad"] }`.

- [ ] **Paso 4: comprobar** — `npx tsc --noEmit` → 0, `npx vitest run`, `npm run build` (servidor parado) con `/dinero/rentabilidad` en rutas.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/app/dinero/ apps/atlas/src/components/dinero/BotonCierreMes.tsx apps/atlas/scripts/humo.mjs
git commit -m "feat(atlas): la pantalla de rentabilidad, por cliente y por proyecto, con cierre de mes"
```

---

## Tarea 6: El dinero en las fichas, y la documentación

**Ficheros:**
- Modificar: `apps/atlas/src/lib/db/rentabilidad.ts` (añadir `margenDe`)
- Crear: `apps/atlas/src/components/dinero/ResumenMargen.tsx` (servidor, sin `"use client"`)
- Modificar: `apps/atlas/src/app/clientes/[slug]/page.tsx`, `apps/atlas/src/app/proyectos/[slug]/page.tsx`
- Modificar: `apps/atlas/MANTENIMIENTO.md`, `apps/atlas/README.md`
- Test: añadir a `apps/atlas/src/tests/db/rentabilidad.test.ts`

- [ ] **Paso 1: `margenDe`** en `rentabilidad.ts`:

```ts
/** La fila de un cliente o de un proyecto en el mes, o ceros si no aparece. */
export async function margenDe(
  sb: Sb,
  eje: { clienteId: string } | { proyectoId: string },
  mes: string
): Promise<FilaMargen & { costeHoraCentimos: number; cerrado: boolean }> {
  const { r, costeHoraCentimos, cerrado } = await rentabilidadDelMes(sb, mes);
  const filas = "clienteId" in eje ? r.porCliente : r.porProyecto;
  const id = "clienteId" in eje ? eje.clienteId : eje.proyectoId;
  const f = filas.find((x) => x.id === id) ?? { id, nombre: "", facturadoCentimos: 0, gastosCentimos: 0, minutos: 0, horasCentimos: 0, margenCentimos: 0 };
  return { ...f, costeHoraCentimos, cerrado: cerrado !== null };
}
```

Test a añadir: `margenDe(sbDuenyo, { clienteId: idCliente }, MES)` devuelve `margenCentimos` 25000 con coste 3000 (ejecútalo antes del cierre, o con el mes reabierto); un id inexistente devuelve ceros.

- [ ] **Paso 2: el componente y las fichas**

```tsx
// src/components/dinero/ResumenMargen.tsx
import Link from "next/link";
import { formatear } from "@/lib/dinero";
import { formatearMinutos } from "@/lib/horas/tramos";
import type { FilaMargen } from "@/lib/rentabilidad/margen";

/**
 * El dinero del mes en la ficha (§8): lo que se quiere tener delante justo
 * antes de llamar. Solo se monta para el propietario: quien lo renderiza ya
 * lo ha comprobado, y RLS lo garantiza igualmente.
 */
export function ResumenMargen({ fila, mes, costeHoraCentimos }: { fila: FilaMargen; mes: string; costeHoraCentimos: number }) {
  const celda = (t: string, v: string, rojo = false) => (
    <div>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>{t}</div>
      <div className="font-semibold tabular-nums" style={rojo ? { color: "var(--estado-caido)" } : undefined}>{v}</div>
    </div>
  );
  return (
    <section className="cristal p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--texto-tenue)" }}>Este mes</h2>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {celda("Facturado", formatear(fila.facturadoCentimos))}
        {celda("Gastos directos", formatear(fila.gastosCentimos))}
        {celda("Horas", `${formatearMinutos(fila.minutos)} · ${formatear(fila.horasCentimos)}`)}
        {celda("Margen", formatear(fila.margenCentimos), fila.margenCentimos < 0)}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--texto-tenue)" }}>
        {costeHoraCentimos === 0 ? "Sin coste de la hora configurado: las horas cuentan cero. " : ""}
        <Link href={`/dinero/rentabilidad?mes=${mes}`} className="underline">Ver el mes entero →</Link>
      </p>
    </section>
  );
}
```

En cada ficha, cuando `verImportes`: obtener `const mes = mesDe(hoyEnMadrid())` y `const margen = await margenDe(sb, { clienteId: cliente.id }, mes)` (o `proyectoId`), y montar `<ResumenMargen fila={margen} mes={mes} costeHoraCentimos={margen.costeHoraCentimos} />` **después de la sección de contratos**. En la de proyecto, dentro del `<aside>`. No se llama a `margenDe` si no es propietario: se ahorra la consulta y RLS lanzaría igual.

- [ ] **Paso 3: documentación**
- `README.md`: `/dinero/rentabilidad`, `/ajustes/economia`, el cierre de mes y la regla de los dos ejes (una frase).
- `MANTENIMIENTO.md`: qué hacer si «la rentabilidad no cuadra» (comprobar el coste de la hora, si el mes está cerrado con otro coste, los tramos abiertos que aún no cuentan, y que se calcula con bases, no totales); cómo reabrir un mes; que `ajustes_economia` es de una fila y su `id = 1` no se cambia.

- [ ] **Paso 4: comprobar** — `npx vitest run`, `npx tsc --noEmit` → 0, `npm run build`.

- [ ] **Paso 5: commit**

```bash
git add apps/atlas/src/lib/db/rentabilidad.ts apps/atlas/src/components/dinero/ResumenMargen.tsx "apps/atlas/src/app/clientes/[slug]/page.tsx" "apps/atlas/src/app/proyectos/[slug]/page.tsx" apps/atlas/src/tests/db/rentabilidad.test.ts apps/atlas/MANTENIMIENTO.md apps/atlas/README.md
git commit -m "feat(atlas): el dinero del mes en la ficha del cliente y del proyecto"
```

---

## Autorrevisión del plan

- **§6.3:** fórmula por cliente (T2), estructura una sola vez (T2, T5), no prorratear (T2 test de cuadre), regla de imputación por eje con la nota abierta cerrada (cabecera + T2). **§4.8:** `ajustes_economia` de una fila (T1, T3, T4); congelar al cerrar (T1 `cierres_mes`, T3, T5). **§8:** Rentabilidad dentro de Dinero (T5); ficha de cliente y de proyecto con su margen y sus horas (T6). **Decisión 8:** coste fijo (T4). **§13:** coste por persona queda fuera, `usuario_id` ya está.
- **Tipos entre tareas:** `Rentabilidad`/`FilaMargen`/`Linea` (T2) → T3, T5, T6; `AjustesEconomia`/`EntradaAjustes` (T3) → T4; `Cierre` (T3) → T5; `limitesMesMadrid`/`mesDe`/`mesVecino` (T2) → T3, T5, T6. Coinciden.
- **Sin marcadores:** las dos indicaciones abiertas (cómo resolver `proyectoNombre` de una línea si `LineaFactura` no lo trae; cuadre del redondeo del total) están explicadas con la decisión que tomar y la obligación de decirlo en el informe.
