# Atlas 2A — El libro · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que el dinero de HAT3X viva en un solo sitio. Al terminar, Atlas registra facturas y gastos imputados a cliente y proyecto, materializa solo los recibos fijos de cada mes y los periodos de cada contrato, y `apps/jarvis/src/lib/finance.ts` queda jubilado.

**Requisito previo:** el bloque 1 completo — planes [`1A`](./2026-08-15-atlas-1a-cimientos.md), [`1A-2`](./2026-08-15-atlas-1a2-gestion.md), [`1B`](./2026-08-15-atlas-1b-vigilancia.md) y [`1C`](./2026-08-16-atlas-1c-alertas.md), con sus verificaciones en verde.

**Arquitectura:** cinco tablas nuevas que cuelgan de `clientes` y `proyectos`. La aritmética del dinero es una función pura sobre céntimos enteros, probada sin base. La capa de datos sigue el reparto del bloque 1: `lib/db/<dominio>.ts` recibe `sb` y se prueba contra Postgres; `lib/db/acciones-<dominio>.ts` es el envoltorio `"use server"` que resuelve el cliente y revalida. Lo recurrente —recibos fijos y periodos de contrato— lo materializa `pg_cron`, con el planificador que ya está montado.

**Stack:** el del bloque 1. Next.js 14 App Router, Supabase (Postgres + RLS + pg_cron), TypeScript estricto, Vitest, Tailwind.

**Spec:** [`docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md`](../specs/2026-08-29-atlas-bloque-2-economia-design.md) — secciones §3.1 (plan 2A), §4.1 a §4.5, §5, §9 y §10.

## Restricciones globales

Las del bloque 1 siguen aplicando. Las propias de este plan:

- **Ningún `float` toca un importe.** Todo cálculo va en **céntimos enteros** y solo se convierte a euros para enseñarlo. En la base, `numeric(12,2)`, que es exacto. Un céntimo de redondeo en una factura firmada no se corrige editando (spec §9).
- **Toda tabla nueva necesita su `GRANT` explícito** para `authenticated` y para `service_role`, en la misma migración que la crea. Los `grant` generales de `20260815100300_rls.sql` solo alcanzaron a las tablas que existían entonces.
- **Todo lo económico es del propietario.** RLS con `atlas_es_propietario()`, y un test que lo comprueba **con un colaborador real** en vez de suponerlo.
- **Una factura emitida no se edita.** En 2A no se emite nada —solo se registran facturas externas—, pero el modelo ya lo prevé: `estado` y la cadena de huellas existen desde ahora, con una restricción que impide que una factura externa tenga huella. El disparador de inalterabilidad llega en 2E.
- **Fechas como hechos, no estados.** `cobrada_en` es una fecha nula mientras no se cobre, no un valor de `estado`. Es como el bloque 1 modela `abierta_en` y `cerrada_en`.
- **Aplicar las migraciones con `npx supabase migration up --local`, NO con `db reset`.** No hay `seed.sql`: un reset borra los datos dados de alta a mano.
- **`fileParallelism: false`** ya está puesto; ningún aserto debe suponer una base vacía. Los tests limpian lo suyo.
- **`npm run build` antes de dar nada por terminado**, y con el servidor de desarrollo parado: comparten `.next`.

## Interfaces heredadas

Del esquema del bloque 1: `clientes`, `proyectos`, `contratos`, `perfiles`, `permisos`.
**`clientes` ya trae `razon_social`, `cif` y `direccion`**, así que los datos fiscales del cliente NO hay que crearlos: el plan 2E los usará tal cual. Lo que falta es la identidad fiscal del emisor, y esa es de 2E.
De la capa de datos: `type Sb` y `type Ok` (`{ ok: true } | { ok: false; error: string }`), `obtenerPerfil(sb)`, `clienteServidor()`.
De RLS: `atlas_es_propietario()`, `atlas_ve_proyecto(p)`, `atlas_edita_proyecto(p)`.
De la interfaz: `Distintivo`, las clases `cristal` y `cristal-denso`, los tokens `--texto-tenue` y `--cristal-borde`.

---

## Tarea 1: El dinero en céntimos

**La pieza que evita el fallo más caro del bloque.** `0.1 + 0.2` no da `0.3`, y el 21 % de una base cualquiera produce céntimos de más o de menos según por dónde caiga. Lógica pura: sin base, sin red, sin reloj.

**Ficheros:**
- Crear: `apps/atlas/src/lib/dinero.ts`
- Test: `apps/atlas/src/tests/dinero.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `function aCentimos(texto: string | number): number | null`
  - `function formatear(centimos: number): string`
  - `function desglosar(baseCentimos: number, tipoIva: number): { base: number; cuota: number; total: number }`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/dinero.test.ts
import { describe, it, expect } from "vitest";
import { aCentimos, formatear, desglosar } from "@/lib/dinero";

describe("a céntimos", () => {
  it("acepta enteros y decimales", () => {
    expect(aCentimos("350")).toBe(35000);
    expect(aCentimos("350.90")).toBe(35090);
    expect(aCentimos(290)).toBe(29000);
  });

  // El teclado español pone coma. Rechazarla sería una trampa para el usuario.
  it("acepta la coma decimal", () => {
    expect(aCentimos("350,90")).toBe(35090);
  });

  // La razón de existir de todo el módulo.
  it("0,1 + 0,2 da exactamente 0,3", () => {
    expect(aCentimos("0.1")! + aCentimos("0.2")!).toBe(aCentimos("0.3"));
  });

  it("corta a dos decimales sin arrastrar el tercero", () => {
    expect(aCentimos("1.005")).toBe(101); // medio céntimo sube
    expect(aCentimos("1.004")).toBe(100);
  });

  // Devuelve null, no NaN ni 0: un importe vacío y un importe de cero euros
  // son cosas distintas, y confundirlos escribe ceros silenciosos en la base.
  it("lo que no es un importe da null", () => {
    expect(aCentimos("")).toBeNull();
    expect(aCentimos("pepe")).toBeNull();
    expect(aCentimos("-5")).toBeNull();
  });
});

describe("formatear", () => {
  it("enseña euros con dos decimales", () => {
    // Intl mete un espacio estrecho e irrompible antes del €; se normaliza
    // para que el aserto no dependa de ese carácter invisible.
    expect(formatear(35090).replace(/ | /g, " ")).toBe("350,90 €");
    expect(formatear(0).replace(/ | /g, " ")).toBe("0,00 €");
  });
});

describe("desglosar", () => {
  it("el 21 % de 290,00 son 60,90 y el total 350,90", () => {
    expect(desglosar(29000, 21)).toEqual({ base: 29000, cuota: 6090, total: 35090 });
  });

  // 1450 × 21 / 100 = 304,5 céntimos exactos. Que suba o baje no puede quedar
  // al azar de la implementación: se fija aquí, al alza.
  it("el medio céntimo sube", () => {
    expect(desglosar(1450, 21).cuota).toBe(305);
  });

  it("el total es siempre base más cuota, sin recalcular", () => {
    const d = desglosar(12345, 21);
    expect(d.total).toBe(d.base + d.cuota);
  });

  it("con IVA cero la cuota es cero", () => {
    expect(desglosar(29000, 0)).toEqual({ base: 29000, cuota: 0, total: 29000 });
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `cd apps/atlas && npx vitest run src/tests/dinero.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/dinero"».

- [ ] **Paso 3: escribir la implementación mínima**

```ts
// src/lib/dinero.ts
//
// El dinero, en céntimos enteros.
//
// JavaScript no sabe sumar dinero: `0.1 + 0.2` no da `0.3`. En una pantalla eso
// es feo; en una factura firmada y encadenada es un descuadre que ya no se
// puede corregir editando. Así que ningún importe se representa como float en
// ningún punto del cálculo, y solo se convierte a euros para enseñarlo.
//

const EUROS = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

/**
 * Texto de un formulario → céntimos.
 *
 * Devuelve `null` y no `0` cuando no hay importe: un campo vacío y un importe
 * de cero euros son cosas distintas, y confundirlos escribe ceros silenciosos.
 */
export function aCentimos(texto: string | number): number | null {
  const limpio = String(texto).trim().replace(",", ".");
  if (limpio === "") return null;

  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0) return null;

  // El redondeo va sobre el valor ya escalado: `1.005 * 100` da
  // 100.49999999999999, y redondear eso a secas perdería el céntimo que sí
  // corresponde. El `toFixed(4)` recorta el ruido antes de decidir.
  return Math.round(Number((n * 100).toFixed(4)));
}

export function formatear(centimos: number): string {
  return EUROS.format(centimos / 100);
}

/**
 * Base y tipo → base, cuota y total, los tres en céntimos.
 *
 * `base * tipoIva` son dos enteros pequeños: el producto es exacto en punto
 * flotante mucho antes de acercarse a `Number.MAX_SAFE_INTEGER`, así que la
 * única decisión real es el redondeo, y es al alza en el medio céntimo.
 */
export function desglosar(
  baseCentimos: number,
  tipoIva: number
): { base: number; cuota: number; total: number } {
  const cuota = Math.round((baseCentimos * tipoIva) / 100);
  return { base: baseCentimos, cuota, total: baseCentimos + cuota };
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/dinero.test.ts`
Esperado: PASA, 11 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/lib/dinero.ts apps/atlas/src/tests/dinero.test.ts
git commit -m "feat(atlas): el dinero se cuenta en centimos enteros"
```

---

## Tarea 2: El esquema

**Las cinco tablas del libro.** Una migración, con sus permisos y sus políticas. Nada de esto es visible todavía: lo que se comprueba es que las reglas de la base son las que dicen ser.

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260829100000_economia.sql`
- Test: `apps/atlas/src/tests/esquema/economia.test.ts`

**Interfaces:**
- Consume: `clientes`, `proyectos`, `contratos`, `perfiles`, `atlas_es_propietario()`.
- Produce: las tablas `gastos_recurrentes`, `gastos`, `facturas`, `factura_lineas` y `periodos_contrato`.

- [ ] **Paso 1: escribir la migración**

```sql
-- apps/atlas/supabase/migrations/20260829100000_economia.sql
--
-- El libro: dónde vive el dinero de HAT3X.
--
-- Hasta ahora lo económico estaba en cuatro sitios que no se hablaban:
-- `contratos.cuota_mensual` aquí, `hat3x_transactions` en jarvis, un
-- `fichaje.json` local, y HTML escrito a mano por cliente. Esto es el sitio
-- único.
--
-- Todo lo de aquí es del propietario. No es un dato de proyecto que un editor
-- pueda tocar: es el negocio.
--

-- ---------- lo fijo de cada mes ----------
--
-- Va primero porque `gastos` la referencia. Vercel, Supabase, Twilio, Retell:
-- doce recibos iguales al año que nadie va a teclear a mano doce veces. Se dan
-- de alta una vez y un `pg_cron` mensual los materializa.
create table gastos_recurrentes (
  id           uuid primary key default gen_random_uuid(),
  concepto     text not null,
  proveedor    text,
  base         numeric(12,2) not null check (base >= 0),
  iva          numeric(12,2) not null default 0 check (iva >= 0),
  categoria    text not null,
  -- Imputación. Ambos nulos = gasto de estructura, que NO se reparte.
  cliente_id   uuid references clientes(id)  on delete set null,
  proyecto_id  uuid references proyectos(id) on delete set null,
  -- Tope 28 a propósito: el 29, 30 y 31 no existen todos los meses, y un
  -- recibo que se salta febrero es un agujero que nadie va a notar.
  dia_del_mes  int not null default 1 check (dia_del_mes between 1 and 28),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now()
);

-- ---------- lo que sale ----------
create table gastos (
  id            uuid primary key default gen_random_uuid(),
  fecha         date not null,
  concepto      text not null,
  proveedor     text,
  base          numeric(12,2) not null check (base >= 0),
  iva           numeric(12,2) not null default 0 check (iva >= 0),
  total         numeric(12,2) not null check (total >= 0),
  categoria     text not null,
  cliente_id    uuid references clientes(id)  on delete set null,
  proyecto_id   uuid references proyectos(id) on delete set null,
  -- De qué alta recurrente salió, si salió de alguna. Sirve para no
  -- materializar dos veces el mismo mes.
  recurrente_id uuid references gastos_recurrentes(id) on delete set null,
  notas         text,
  creado_en     timestamptz not null default now()
);
create index gastos_por_fecha on gastos(fecha desc);
create index gastos_por_cliente on gastos(cliente_id) where cliente_id is not null;

-- ---------- lo que entra ----------
create table facturas (
  id                uuid primary key default gen_random_uuid(),
  -- 'externa' = la emitiste tú por otra vía y Atlas solo la registra.
  -- 'atlas'   = la emite Atlas, desde el plan 2E. Solo esas van en la cadena.
  origen            text not null check (origen in ('externa','atlas')),
  serie             text not null,
  -- Nulo mientras es borrador. Se asigna al emitir, bajo bloqueo (plan 2E).
  numero            int,
  -- `restrict` y no `cascade`: borrar un cliente con facturas tiene que fallar
  -- y decirlo. Es un registro fiscal, no un dato de trabajo.
  cliente_id        uuid not null references clientes(id) on delete restrict,
  fecha_emision     date not null,
  fecha_vencimiento date,
  -- Congelados al emitir, nunca derivados al leer: un tipo de IVA que cambie no
  -- puede reescribir el pasado.
  base              numeric(12,2) not null check (base >= 0),
  iva_tipo          numeric(4,2)  not null default 21 check (iva_tipo >= 0),
  iva_cuota         numeric(12,2) not null check (iva_cuota >= 0),
  total             numeric(12,2) not null check (total >= 0),
  estado            text not null default 'borrador'
                    check (estado in ('borrador','emitida','anulada')),
  -- Nulo mientras no se cobra. Es un hecho con fecha, no un estado: el ciclo
  -- fiscal y el cobro son dos dimensiones, y mezclarlas crea preguntas
  -- imposibles («¿una anulada cobrada?»).
  cobrada_en        date,
  -- La cadena del régimen no VERI*FACTU. Se rellena en 2E.
  huella            text,
  huella_anterior   text,
  firma             text,
  rectifica_a       uuid references facturas(id) on delete restrict,
  notas             text,
  creado_en         timestamptz not null default now(),
  unique (serie, numero),
  -- Una factura ajena NUNCA puede llevar cadena. Sin esto, un error de código
  -- en 2E podría encadenar una factura que Atlas no emitió, y eso es
  -- exactamente lo que la cadena existe para impedir.
  constraint solo_atlas_encadena check (
    origen = 'atlas' or (huella is null and huella_anterior is null and firma is null)
  ),
  constraint vencimiento_no_anterior check (
    fecha_vencimiento is null or fecha_vencimiento >= fecha_emision
  )
);
create index facturas_por_fecha on facturas(fecha_emision desc);
-- Las que hay que perseguir, que es la consulta de 2B.
create index facturas_sin_cobrar on facturas(fecha_vencimiento)
  where cobrada_en is null and estado <> 'anulada';

create table factura_lineas (
  id               uuid primary key default gen_random_uuid(),
  factura_id       uuid not null references facturas(id) on delete cascade,
  orden            int not null default 0,
  concepto         text not null,
  descripcion      text,
  cantidad         numeric(10,2) not null default 1 check (cantidad > 0),
  precio_unitario  numeric(12,2) not null check (precio_unitario >= 0),
  importe          numeric(12,2) not null check (importe >= 0),
  -- El proyecto va AQUÍ y no en la factura. El presupuesto real de Biodental
  -- ya tiene dos proyectos en un solo documento —«Sara» y «Kairos»—, así que
  -- con el proyecto en la cabecera la rentabilidad por proyecto sería falsa
  -- desde el primer cliente.
  proyecto_id      uuid references proyectos(id) on delete set null
);
create index factura_lineas_por_factura on factura_lineas(factura_id);

-- ---------- lo que se espera cobrar ----------
--
-- Materializa cada mes de cada contrato activo. Sin esto, «¿qué llevo sin
-- facturar?» habría que deducirlo al vuelo cada vez, y esa deducción es la que
-- falla en silencio: lo que no está registrado no se puede echar de menos.
create table periodos_contrato (
  id                uuid primary key default gen_random_uuid(),
  contrato_id       uuid not null references contratos(id) on delete cascade,
  periodo           date not null,           -- primer día del mes
  importe_esperado  numeric(12,2) not null,  -- congelado al materializar
  factura_id        uuid references facturas(id) on delete set null,
  creado_en         timestamptz not null default now(),
  unique (contrato_id, periodo)
);
create index periodos_sin_facturar on periodos_contrato(periodo)
  where factura_id is null;

-- ---------- permisos ----------
--
-- Los `grant` generales de `20260815100300_rls.sql` solo alcanzaron a las
-- tablas que existían entonces. Una tabla nueva empieza sin permisos.
grant select, insert, update, delete
  on gastos_recurrentes, gastos, facturas, factura_lineas, periodos_contrato
  to authenticated;
grant all privileges
  on gastos_recurrentes, gastos, facturas, factura_lineas, periodos_contrato
  to service_role;

alter table gastos_recurrentes enable row level security;
alter table gastos             enable row level security;
alter table facturas           enable row level security;
alter table factura_lineas     enable row level security;
alter table periodos_contrato  enable row level security;

-- ---------- políticas ----------
--
-- Todo del propietario, lectura y escritura. Un editor gestiona los servicios
-- de sus proyectos, pero no ve lo que se cobra por ellos.
create policy gastos_recurrentes_todo on gastos_recurrentes for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy gastos_todo on gastos for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy facturas_todo on facturas for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy factura_lineas_todo on factura_lineas for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
create policy periodos_todo on periodos_contrato for all to authenticated
  using (atlas_es_propietario()) with check (atlas_es_propietario());
```

- [ ] **Paso 2: aplicar la migración y regenerar los tipos**

```bash
cd apps/atlas
npx supabase migration up --local
npm run tipos
```

Esperado: la migración se aplica sin error y `src/types/supabase.ts` contiene `facturas`, `gastos`, `factura_lineas`, `gastos_recurrentes` y `periodos_contrato`.

- [ ] **Paso 3: escribir el test del esquema**

```ts
// src/tests/esquema/economia.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let idCliente = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  const { rows } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Prueba Economía','prueba-economia')
     RETURNING id`
  );
  idCliente = rows[0].id;
});

afterAll(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  await pg.end();
});

async function factura(campos: Record<string, unknown> = {}) {
  const base: Record<string, unknown> = {
    origen: "externa",
    serie: "X",
    numero: Math.floor(Math.random() * 1_000_000),
    cliente_id: idCliente,
    fecha_emision: "2026-08-29",
    base: 290,
    iva_cuota: 60.9,
    total: 350.9,
    ...campos,
  };
  const cols = Object.keys(base);
  const vals = cols.map((_, i) => `$${i + 1}`);
  return pg.query(
    `INSERT INTO facturas (${cols.join(",")}) VALUES (${vals.join(",")}) RETURNING id`,
    Object.values(base)
  );
}

describe("esquema de economía", () => {
  it("una factura externa no puede llevar cadena", async () => {
    await expect(factura({ huella: "abc" })).rejects.toThrow(/solo_atlas_encadena/);
  });

  it("una de Atlas sí puede", async () => {
    const { rows } = await factura({ origen: "atlas", huella: "abc" });
    expect(rows[0].id).toBeTruthy();
  });

  it("el vencimiento no puede ser anterior a la emisión", async () => {
    await expect(
      factura({ fecha_emision: "2026-08-29", fecha_vencimiento: "2026-08-01" })
    ).rejects.toThrow(/vencimiento_no_anterior/);
  });

  it("no se repite serie y número", async () => {
    await factura({ serie: "DUP", numero: 1 });
    await expect(factura({ serie: "DUP", numero: 1 })).rejects.toThrow(/duplicate key/);
  });

  // Un registro fiscal tiene que sobrevivir a que se borre el cliente. Si esto
  // cayera en cascada, un borrado de mantenimiento se llevaría la contabilidad.
  it("borrar un cliente con facturas falla", async () => {
    await factura();
    await expect(
      pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente])
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("un recurrente no puede caer el día 31", async () => {
    await expect(
      pg.query(
        `INSERT INTO gastos_recurrentes (concepto, base, categoria, dia_del_mes)
         VALUES ('Prueba', 10, 'otro', 31)`
      )
    ).rejects.toThrow(/dia_del_mes/);
  });
});
```

- [ ] **Paso 4: ejecutar el test**

Ejecutar: `npx vitest run src/tests/esquema/economia.test.ts`
Esperado: PASA, 6 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260829100000_economia.sql \
        apps/atlas/src/tests/esquema/economia.test.ts \
        apps/atlas/src/types/supabase.ts
git commit -m "feat(atlas): el esquema del libro, con sus reglas en la base"
```

---

## Tarea 3: Facturas — leer

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/facturas.ts`
- Test: `apps/atlas/src/tests/db/facturas.test.ts`

**Interfaces:**
- Consume: `Sb`, el esquema (tarea 2).
- Produce:
  - `type LineaFactura = { id: string; orden: number; concepto: string; descripcion: string | null; cantidad: number; precioUnitario: number; importe: number; proyectoId: string | null }`
  - `type Factura = { id: string; origen: "externa" | "atlas"; serie: string; numero: number | null; clienteId: string; clienteNombre: string; fechaEmision: string; fechaVencimiento: string | null; base: number; ivaTipo: number; ivaCuota: number; total: number; estado: "borrador" | "emitida" | "anulada"; cobradaEn: string | null; lineas: LineaFactura[] }`
  - `function listarFacturas(sb: Sb, filtros: { clienteId?: string; sinCobrar?: boolean }): Promise<Factura[]>`
  - `function obtenerFactura(sb: Sb, id: string): Promise<Factura | null>`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/facturas.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { listarFacturas, obtenerFactura } from "@/lib/db/facturas";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];
let idCliente = "";
let idFactura = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  usuarios.push(creado.data.user.id);
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [
    creado.data.user.id,
    propietario,
  ]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: clave },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: correo,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
  return sb;
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  sbDuenyo = await altaUsuario("duenyo-facturas@atlas.test", true, "df");
  sbColaborador = await altaUsuario("colab-facturas@atlas.test", false, "cf");

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Biodental Prueba','biodental-prueba')
     RETURNING id`
  );
  idCliente = c.id;

  const { rows: [f] } = await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           fecha_vencimiento, base, iva_cuota, total)
     VALUES ('externa','BIO',1,$1,'2026-08-04','2026-09-04',350,73.5,423.5)
     RETURNING id`,
    [idCliente]
  );
  idFactura = f.id;

  await pg.query(
    `INSERT INTO factura_lineas (factura_id, orden, concepto, precio_unitario, importe)
     VALUES ($1,0,'Recepcionista IA Sara',290,290),
            ($1,1,'App de gestión Kairos',60,60)`,
    [idFactura]
  );

  // Una cobrada, para poder filtrar.
  await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           base, iva_cuota, total, cobrada_en)
     VALUES ('externa','BIO',2,$1,'2026-07-04',350,73.5,423.5,'2026-07-20')`,
    [idCliente]
  );
});

afterAll(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("listar facturas", () => {
  it("trae las del cliente, la más reciente primero", async () => {
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(fs).toHaveLength(2);
    expect(fs[0]!.numero).toBe(1);
    expect(fs[0]!.clienteNombre).toBe("Biodental Prueba");
  });

  it("trae las líneas, en orden", async () => {
    const [f] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(f!.lineas.map((l) => l.concepto)).toEqual([
      "Recepcionista IA Sara",
      "App de gestión Kairos",
    ]);
  });

  it("filtra las que faltan por cobrar", async () => {
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente, sinCobrar: true });
    expect(fs).toHaveLength(1);
    expect(fs[0]!.numero).toBe(1);
  });

  // No filtra la consulta: de eso se encarga RLS, y se comprueba en vez de
  // suponerse.
  it("un colaborador no ve ninguna factura", async () => {
    expect(await listarFacturas(sbColaborador, {})).toEqual([]);
  });
});

describe("obtener una factura", () => {
  it("la trae con sus líneas", async () => {
    const f = await obtenerFactura(sbDuenyo, idFactura);
    expect(f!.total).toBe(423.5);
    expect(f!.lineas).toHaveLength(2);
  });

  it("un id que no existe da null, no revienta", async () => {
    const f = await obtenerFactura(sbDuenyo, "00000000-0000-0000-0000-000000000000");
    expect(f).toBeNull();
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/db/facturas.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/facturas"».

- [ ] **Paso 3: escribir la implementación**

```ts
// src/lib/db/facturas.ts
import type { Sb } from "./clientes";

export type LineaFactura = {
  id: string;
  orden: number;
  concepto: string;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  importe: number;
  proyectoId: string | null;
};

export type Factura = {
  id: string;
  origen: "externa" | "atlas";
  serie: string;
  numero: number | null;
  clienteId: string;
  clienteNombre: string;
  /** ISO AAAA-MM-DD */
  fechaEmision: string;
  fechaVencimiento: string | null;
  base: number;
  ivaTipo: number;
  ivaCuota: number;
  total: number;
  estado: "borrador" | "emitida" | "anulada";
  cobradaEn: string | null;
  lineas: LineaFactura[];
};

const CAMPOS = `
  id, origen, serie, numero, cliente_id, fecha_emision, fecha_vencimiento,
  base, iva_tipo, iva_cuota, total, estado, cobrada_en,
  clientes!inner(nombre),
  factura_lineas(id, orden, concepto, descripcion, cantidad, precio_unitario,
                 importe, proyecto_id)
`;

type Fila = {
  id: string;
  origen: string;
  serie: string;
  numero: number | null;
  cliente_id: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  base: number;
  iva_tipo: number;
  iva_cuota: number;
  total: number;
  estado: string;
  cobrada_en: string | null;
  clientes: { nombre: string } | { nombre: string }[];
  factura_lineas: {
    id: string;
    orden: number;
    concepto: string;
    descripcion: string | null;
    cantidad: number;
    precio_unitario: number;
    importe: number;
    proyecto_id: string | null;
  }[];
};

function aFactura(f: Fila): Factura {
  // PostgREST devuelve el join como objeto o como array según la cardinalidad
  // que infiera. Normalizarlo aquí evita repetir el ternario en cada consumidor.
  const cliente = Array.isArray(f.clientes) ? f.clientes[0]! : f.clientes;
  return {
    id: f.id,
    origen: f.origen as Factura["origen"],
    serie: f.serie,
    numero: f.numero,
    clienteId: f.cliente_id,
    clienteNombre: cliente.nombre,
    fechaEmision: f.fecha_emision,
    fechaVencimiento: f.fecha_vencimiento,
    base: Number(f.base),
    ivaTipo: Number(f.iva_tipo),
    ivaCuota: Number(f.iva_cuota),
    total: Number(f.total),
    estado: f.estado as Factura["estado"],
    cobradaEn: f.cobrada_en,
    lineas: [...f.factura_lineas]
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({
        id: l.id,
        orden: l.orden,
        concepto: l.concepto,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        precioUnitario: Number(l.precio_unitario),
        importe: Number(l.importe),
        proyectoId: l.proyecto_id,
      })),
  };
}

/**
 * El historial. **No filtra por permisos**: de eso se encarga RLS, y hay un
 * test que lo comprueba con un colaborador en vez de suponerlo.
 */
export async function listarFacturas(
  sb: Sb,
  filtros: { clienteId?: string; sinCobrar?: boolean }
): Promise<Factura[]> {
  let consulta = sb
    .from("facturas")
    .select(CAMPOS)
    .order("fecha_emision", { ascending: false })
    .limit(200);

  if (filtros.clienteId) consulta = consulta.eq("cliente_id", filtros.clienteId);
  if (filtros.sinCobrar) {
    consulta = consulta.is("cobrada_en", null).neq("estado", "anulada");
  }

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map((f) => aFactura(f as unknown as Fila));
}

export async function obtenerFactura(sb: Sb, id: string): Promise<Factura | null> {
  const { data, error } = await sb
    .from("facturas")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? aFactura(data as unknown as Fila) : null;
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/db/facturas.test.ts`
Esperado: PASA, 6 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/lib/db/facturas.ts apps/atlas/src/tests/db/facturas.test.ts
git commit -m "feat(atlas): leer facturas, con RLS comprobado y no supuesto"
```

---

## Tarea 4: Facturas — escribir

**Ficheros:**
- Modificar: `apps/atlas/src/lib/db/facturas.ts`
- Crear: `apps/atlas/src/lib/db/acciones-facturas.ts`
- Test: `apps/atlas/src/tests/db/acciones-facturas.test.ts`

**Interfaces:**
- Consume: `Sb`, `Ok` (de `./proyectos`), `obtenerPerfil` (de `./perfil`), `desglosar` (tarea 1), `listarFacturas` (tarea 3).
- Produce:
  - `type EntradaLinea = { concepto: string; descripcion?: string | null; cantidad: number; precioUnitarioCentimos: number; proyectoId?: string | null }`
  - `type EntradaFactura = { clienteId: string; serie: string; numero: number; fechaEmision: string; fechaVencimiento?: string | null; ivaTipo: number; lineas: EntradaLinea[]; notas?: string | null }`
  - `function registrarFacturaExterna(sb: Sb, entrada: EntradaFactura): Promise<Ok>`
  - `function marcarCobrada(sb: Sb, id: string, fecha: string | null): Promise<Ok>`
  - En `acciones-facturas.ts`: `guardarFacturaExterna(entrada: EntradaFactura): Promise<Ok>` y `cambiarCobro(id: string, fecha: string | null): Promise<Ok>`.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/acciones-facturas.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  registrarFacturaExterna,
  marcarCobrada,
  listarFacturas,
  type EntradaFactura,
} from "@/lib/db/facturas";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];
let idCliente = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  usuarios.push(creado.data.user.id);
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [
    creado.data.user.id,
    propietario,
  ]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: clave },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: correo,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
  return sb;
}

function entrada(parcial: Partial<EntradaFactura> = {}): EntradaFactura {
  return {
    clienteId: idCliente,
    serie: "BIO",
    numero: 10,
    fechaEmision: "2026-08-04",
    fechaVencimiento: "2026-09-04",
    ivaTipo: 21,
    lineas: [
      { concepto: "Recepcionista IA Sara", cantidad: 1, precioUnitarioCentimos: 29000 },
      { concepto: "App de gestión Kairos", cantidad: 1, precioUnitarioCentimos: 6000 },
    ],
    ...parcial,
  };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  sbDuenyo = await altaUsuario("duenyo-escribir-fra@atlas.test", true, "def");
  sbColaborador = await altaUsuario("colab-escribir-fra@atlas.test", false, "cef");
  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Escribir Prueba','escribir-prueba')
     RETURNING id`
  );
  idCliente = c.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("registrar una factura externa", () => {
  it("guarda la factura y sus líneas, con los totales calculados", async () => {
    expect(await registrarFacturaExterna(sbDuenyo, entrada())).toEqual({ ok: true });

    const [f] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(f!.base).toBe(350);
    expect(f!.ivaCuota).toBe(73.5);
    expect(f!.total).toBe(423.5);
    expect(f!.lineas).toHaveLength(2);
    expect(f!.origen).toBe("externa");
  });

  // Lo que se registra es una factura que YA existe fuera: nace emitida, no
  // borrador. Un borrador es algo que aún no se ha mandado a nadie.
  it("nace emitida, no borrador", async () => {
    await registrarFacturaExterna(sbDuenyo, entrada());
    const [f] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(f!.estado).toBe("emitida");
  });

  it("sin líneas no se guarda", async () => {
    const r = await registrarFacturaExterna(sbDuenyo, entrada({ lineas: [] }));
    expect(r).toEqual({ ok: false, error: "Una factura necesita al menos una línea." });
  });

  it("un número repetido en la misma serie se explica, no revienta", async () => {
    await registrarFacturaExterna(sbDuenyo, entrada());
    const r = await registrarFacturaExterna(sbDuenyo, entrada());
    expect(r).toEqual({
      ok: false,
      error: "Ya hay una factura con ese número en la serie BIO.",
    });
  });

  // El mensaje claro en vez del 42501 seco que devolvería RLS.
  it("un colaborador no puede registrar facturas", async () => {
    const r = await registrarFacturaExterna(sbColaborador, entrada());
    expect(r).toEqual({
      ok: false,
      error: "Solo el propietario puede gestionar facturas.",
    });
  });

  // Si la cabecera se guardara y las líneas fallaran, quedaría una factura de
  // 0 € que parece real. Se comprueba que no queda rastro.
  it("si fallan las líneas no queda la cabecera suelta", async () => {
    const r = await registrarFacturaExterna(
      sbDuenyo,
      entrada({
        lineas: [
          {
            concepto: "Mala",
            cantidad: 1,
            precioUnitarioCentimos: 1000,
            proyectoId: "00000000-0000-0000-0000-000000000000",
          },
        ],
      })
    );
    expect(r.ok).toBe(false);
    expect(await listarFacturas(sbDuenyo, { clienteId: idCliente })).toEqual([]);
  });
});

describe("marcar cobrada", () => {
  it("pone y quita la fecha de cobro", async () => {
    await registrarFacturaExterna(sbDuenyo, entrada());
    const [f] = await listarFacturas(sbDuenyo, { clienteId: idCliente });

    expect(await marcarCobrada(sbDuenyo, f!.id, "2026-09-01")).toEqual({ ok: true });
    let [tras] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(tras!.cobradaEn).toBe("2026-09-01");

    expect(await marcarCobrada(sbDuenyo, f!.id, null)).toEqual({ ok: true });
    [tras] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(tras!.cobradaEn).toBeNull();
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/db/acciones-facturas.test.ts`
Esperado: FALLA con «registrarFacturaExterna is not a function».

- [ ] **Paso 3: añadir la escritura a `facturas.ts`**

Añadir estos imports al principio del fichero, junto al de `Sb`:

```ts
import { obtenerPerfil } from "./perfil";
import { desglosar } from "@/lib/dinero";
import type { Ok } from "./proyectos";
```

Y este bloque al final:

```ts
export type EntradaLinea = {
  concepto: string;
  descripcion?: string | null;
  cantidad: number;
  /** Céntimos enteros. Nunca euros en float. */
  precioUnitarioCentimos: number;
  proyectoId?: string | null;
};

export type EntradaFactura = {
  clienteId: string;
  serie: string;
  numero: number;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  ivaTipo: number;
  lineas: EntradaLinea[];
  notas?: string | null;
};

/** Céntimos → el `numeric(12,2)` que espera Postgres. */
function aEuros(centimos: number): number {
  return centimos / 100;
}

/**
 * Registra una factura emitida FUERA de Atlas.
 *
 * `origen = 'externa'` y sin cadena de huellas: registrar una factura ajena es
 * contabilidad, no emisión. La emisión propia llega en el plan 2E.
 *
 * Nace `emitida` y no `borrador`: es una factura que ya existe y que alguien ya
 * recibió. Un borrador es algo que todavía no se ha mandado.
 */
export async function registrarFacturaExterna(
  sb: Sb,
  entrada: EntradaFactura
): Promise<Ok> {
  if (entrada.lineas.length === 0) {
    return { ok: false, error: "Una factura necesita al menos una línea." };
  }

  // RLS lo impediría igual, pero así el mensaje es claro en vez de un 42501.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar facturas." };
  }

  const lineas = entrada.lineas.map((l, i) => ({
    orden: i,
    concepto: l.concepto,
    descripcion: l.descripcion ?? null,
    cantidad: l.cantidad,
    precio_unitario: aEuros(l.precioUnitarioCentimos),
    importe: aEuros(Math.round(l.precioUnitarioCentimos * l.cantidad)),
    proyecto_id: l.proyectoId ?? null,
  }));

  const baseCentimos = entrada.lineas.reduce(
    (suma, l) => suma + Math.round(l.precioUnitarioCentimos * l.cantidad),
    0
  );
  const d = desglosar(baseCentimos, entrada.ivaTipo);

  const { data, error } = await sb
    .from("facturas")
    .insert({
      origen: "externa",
      serie: entrada.serie,
      numero: entrada.numero,
      cliente_id: entrada.clienteId,
      fecha_emision: entrada.fechaEmision,
      fecha_vencimiento: entrada.fechaVencimiento ?? null,
      base: aEuros(d.base),
      iva_tipo: entrada.ivaTipo,
      iva_cuota: aEuros(d.cuota),
      total: aEuros(d.total),
      estado: "emitida",
      notas: entrada.notas ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          error: `Ya hay una factura con ese número en la serie ${entrada.serie}.`,
        }
      : { ok: false, error: error.message };
  }

  const { error: eLineas } = await sb
    .from("factura_lineas")
    .insert(lineas.map((l) => ({ ...l, factura_id: data.id })));

  if (eLineas) {
    // PostgREST no da transacciones entre dos llamadas, así que la cabecera se
    // retira a mano. Sin esto quedaría una factura de 0 € que parece real y que
    // descuadraría cualquier suma del periodo.
    await sb.from("facturas").delete().eq("id", data.id);
    return { ok: false, error: eLineas.message };
  }

  return { ok: true };
}

/** `fecha = null` deshace el cobro. */
export async function marcarCobrada(
  sb: Sb,
  id: string,
  fecha: string | null
): Promise<Ok> {
  const { error } = await sb.from("facturas").update({ cobrada_en: fecha }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Paso 4: escribir el envoltorio de servidor**

```ts
// src/lib/db/acciones-facturas.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  registrarFacturaExterna,
  marcarCobrada,
  type EntradaFactura,
} from "./facturas";
import type { Ok } from "./proyectos";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol y escribir es cosa de
// `facturas.ts`, que sí se puede probar contra la base porque recibe `sb`.
//
// El reparto no es estético: un módulo "use server" expone TODAS sus funciones
// exportadas como endpoints invocables desde el navegador.
//

export async function guardarFacturaExterna(entrada: EntradaFactura): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await registrarFacturaExterna(sb, entrada);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  revalidatePath("/clientes");
  return { ok: true };
}

export async function cambiarCobro(id: string, fecha: string | null): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await marcarCobrada(sb, id, fecha);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  return { ok: true };
}
```

- [ ] **Paso 5: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/db/acciones-facturas.test.ts`
Esperado: PASA, 7 tests.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/src/lib/db/facturas.ts \
        apps/atlas/src/lib/db/acciones-facturas.ts \
        apps/atlas/src/tests/db/acciones-facturas.test.ts
git commit -m "feat(atlas): registrar facturas emitidas fuera, con sus lineas"
```

---

## Tarea 5: Gastos

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/gastos.ts`
- Crear: `apps/atlas/src/lib/db/acciones-gastos.ts`
- Test: `apps/atlas/src/tests/db/gastos.test.ts`

**Interfaces:**
- Consume: `Sb`, `Ok`, `obtenerPerfil`.
- Produce:
  - `const CATEGORIAS = ["infraestructura","ia","telefonia","herramientas","marketing","gestoria","otro"] as const`
  - `type Categoria = (typeof CATEGORIAS)[number]`
  - `type Gasto = { id: string; fecha: string; concepto: string; proveedor: string | null; base: number; iva: number; total: number; categoria: string; clienteId: string | null; clienteNombre: string | null; proyectoId: string | null; esDirecto: boolean }`
  - `type EntradaGasto = { fecha: string; concepto: string; proveedor?: string | null; baseCentimos: number; ivaCentimos: number; categoria: Categoria; clienteId?: string | null; proyectoId?: string | null; notas?: string | null }`
  - `function listarGastos(sb: Sb, filtros: { desde?: string; hasta?: string; clienteId?: string }): Promise<Gasto[]>`
  - `function escribirGasto(sb: Sb, entrada: EntradaGasto): Promise<Ok>`
  - `function borrarGasto(sb: Sb, id: string): Promise<Ok>`
  - En `acciones-gastos.ts`: `guardarGasto(entrada: EntradaGasto): Promise<Ok>` y `eliminarGasto(id: string): Promise<Ok>`.

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/gastos.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { listarGastos, escribirGasto, borrarGasto, type EntradaGasto } from "@/lib/db/gastos";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];
let idCliente = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  usuarios.push(creado.data.user.id);
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,$2)`, [
    creado.data.user.id,
    propietario,
  ]);
  const sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: clave },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: correo,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
  return sb;
}

function entrada(parcial: Partial<EntradaGasto> = {}): EntradaGasto {
  return {
    fecha: "2026-08-15",
    concepto: "Vercel Pro",
    proveedor: "Vercel",
    baseCentimos: 2000,
    ivaCentimos: 420,
    categoria: "infraestructura",
    ...parcial,
  };
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  sbDuenyo = await altaUsuario("duenyo-gastos@atlas.test", true, "dg");
  sbColaborador = await altaUsuario("colab-gastos@atlas.test", false, "cg");
  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Gastos Prueba','gastos-prueba')
     RETURNING id`
  );
  idCliente = c.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM gastos`);
});

afterAll(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("escribir gastos", () => {
  it("guarda con el total sumado de base e IVA", async () => {
    expect(await escribirGasto(sbDuenyo, entrada())).toEqual({ ok: true });
    const [g] = await listarGastos(sbDuenyo, {});
    expect(g!.base).toBe(20);
    expect(g!.iva).toBe(4.2);
    expect(g!.total).toBe(24.2);
  });

  // Es la distinción que sostiene la rentabilidad: lo que tiene contador se
  // imputa, lo demás es estructura y NO se reparte entre clientes.
  it("sin cliente ni proyecto es gasto de estructura", async () => {
    await escribirGasto(sbDuenyo, entrada());
    const [g] = await listarGastos(sbDuenyo, {});
    expect(g!.esDirecto).toBe(false);
  });

  it("con cliente es gasto directo", async () => {
    await escribirGasto(sbDuenyo, entrada({ clienteId: idCliente, concepto: "Twilio" }));
    const [g] = await listarGastos(sbDuenyo, {});
    expect(g!.esDirecto).toBe(true);
    expect(g!.clienteNombre).toBe("Gastos Prueba");
  });

  it("una categoría inventada se rechaza", async () => {
    const r = await escribirGasto(sbDuenyo, entrada({ categoria: "chuches" as never }));
    expect(r).toEqual({ ok: false, error: "«chuches» no es una categoría de gasto." });
  });

  it("un concepto vacío se rechaza", async () => {
    const r = await escribirGasto(sbDuenyo, entrada({ concepto: "   " }));
    expect(r).toEqual({ ok: false, error: "El gasto necesita un concepto." });
  });

  it("un colaborador no puede escribir gastos", async () => {
    const r = await escribirGasto(sbColaborador, entrada());
    expect(r).toEqual({ ok: false, error: "Solo el propietario puede gestionar gastos." });
  });
});

describe("listar gastos", () => {
  it("filtra por rango de fechas", async () => {
    await escribirGasto(sbDuenyo, entrada({ fecha: "2026-07-15" }));
    await escribirGasto(sbDuenyo, entrada({ fecha: "2026-08-15" }));

    const agosto = await listarGastos(sbDuenyo, {
      desde: "2026-08-01",
      hasta: "2026-08-31",
    });
    expect(agosto).toHaveLength(1);
    expect(agosto[0]!.fecha).toBe("2026-08-15");
  });

  it("un colaborador no ve ninguno", async () => {
    await escribirGasto(sbDuenyo, entrada());
    expect(await listarGastos(sbColaborador, {})).toEqual([]);
  });
});

describe("borrar gastos", () => {
  it("lo quita", async () => {
    await escribirGasto(sbDuenyo, entrada());
    const [g] = await listarGastos(sbDuenyo, {});
    expect(await borrarGasto(sbDuenyo, g!.id)).toEqual({ ok: true });
    expect(await listarGastos(sbDuenyo, {})).toEqual([]);
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/db/gastos.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/gastos"».

- [ ] **Paso 3: escribir la implementación**

```ts
// src/lib/db/gastos.ts
import type { Sb } from "./clientes";
import { obtenerPerfil } from "./perfil";
import type { Ok } from "./proyectos";

/**
 * Las categorías de partida. Se pueden ampliar, pero no a mano en cada
 * formulario: una lista copiada en dos sitios diverge, y las sumas por
 * categoría empiezan a dejarse gastos fuera sin avisar.
 */
export const CATEGORIAS = [
  "infraestructura",
  "ia",
  "telefonia",
  "herramientas",
  "marketing",
  "gestoria",
  "otro",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export type Gasto = {
  id: string;
  /** ISO AAAA-MM-DD */
  fecha: string;
  concepto: string;
  proveedor: string | null;
  base: number;
  iva: number;
  total: number;
  categoria: string;
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  /**
   * Imputado a alguien concreto. Si es falso es coste de estructura, y NO se
   * reparte entre clientes: repartirlo inventaría una precisión que no existe.
   */
  esDirecto: boolean;
};

export type EntradaGasto = {
  fecha: string;
  concepto: string;
  proveedor?: string | null;
  baseCentimos: number;
  ivaCentimos: number;
  categoria: Categoria;
  clienteId?: string | null;
  proyectoId?: string | null;
  notas?: string | null;
};

function aEuros(centimos: number): number {
  return centimos / 100;
}

export async function listarGastos(
  sb: Sb,
  filtros: { desde?: string; hasta?: string; clienteId?: string }
): Promise<Gasto[]> {
  let consulta = sb
    .from("gastos")
    .select(
      `id, fecha, concepto, proveedor, base, iva, total, categoria,
       cliente_id, proyecto_id, clientes(nombre)`
    )
    .order("fecha", { ascending: false })
    .limit(500);

  if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
  if (filtros.clienteId) consulta = consulta.eq("cliente_id", filtros.clienteId);

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((g) => {
    const c = g.clientes as { nombre: string } | { nombre: string }[] | null;
    const cliente = Array.isArray(c) ? (c[0] ?? null) : c;
    return {
      id: g.id,
      fecha: g.fecha,
      concepto: g.concepto,
      proveedor: g.proveedor,
      base: Number(g.base),
      iva: Number(g.iva),
      total: Number(g.total),
      categoria: g.categoria,
      clienteId: g.cliente_id,
      clienteNombre: cliente?.nombre ?? null,
      proyectoId: g.proyecto_id,
      esDirecto: g.cliente_id !== null || g.proyecto_id !== null,
    };
  });
}

export async function escribirGasto(sb: Sb, entrada: EntradaGasto): Promise<Ok> {
  if (entrada.concepto.trim() === "") {
    return { ok: false, error: "El gasto necesita un concepto." };
  }
  if (!(CATEGORIAS as readonly string[]).includes(entrada.categoria)) {
    return { ok: false, error: `«${entrada.categoria}» no es una categoría de gasto.` };
  }

  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar gastos." };
  }

  const { error } = await sb.from("gastos").insert({
    fecha: entrada.fecha,
    concepto: entrada.concepto.trim(),
    proveedor: entrada.proveedor ?? null,
    base: aEuros(entrada.baseCentimos),
    iva: aEuros(entrada.ivaCentimos),
    total: aEuros(entrada.baseCentimos + entrada.ivaCentimos),
    categoria: entrada.categoria,
    cliente_id: entrada.clienteId ?? null,
    proyecto_id: entrada.proyectoId ?? null,
    notas: entrada.notas ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function borrarGasto(sb: Sb, id: string): Promise<Ok> {
  const { error } = await sb.from("gastos").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
```

- [ ] **Paso 4: escribir el envoltorio de servidor**

```ts
// src/lib/db/acciones-gastos.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirGasto, borrarGasto, type EntradaGasto } from "./gastos";
import type { Ok } from "./proyectos";

export async function guardarGasto(entrada: EntradaGasto): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirGasto(sb, entrada);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  return { ok: true };
}

export async function eliminarGasto(id: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await borrarGasto(sb, id);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  return { ok: true };
}
```

- [ ] **Paso 5: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/db/gastos.test.ts`
Esperado: PASA, 9 tests.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/src/lib/db/gastos.ts \
        apps/atlas/src/lib/db/acciones-gastos.ts \
        apps/atlas/src/tests/db/gastos.test.ts
git commit -m "feat(atlas): gastos, distinguiendo lo directo de la estructura"
```

---

## Tarea 6: Los recibos fijos se materializan solos

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260829110000_recurrentes.sql`
- Test: `apps/atlas/src/tests/esquema/recurrentes.test.ts`

**Interfaces:**
- Consume: `gastos_recurrentes`, `gastos` (tarea 2).
- Produce: la función SQL `atlas_materializar_recurrentes(mes date) returns int` y la tarea de cron `atlas-gastos-recurrentes`.

- [ ] **Paso 1: escribir la migración**

```sql
-- apps/atlas/supabase/migrations/20260829110000_recurrentes.sql
--
-- Los doce recibos iguales del año.
--
-- «Los gastos entran a mano» solo es sostenible si a mano se meten los raros.
-- Vercel, Supabase, Twilio y Retell son siempre lo mismo, y teclearlos doce
-- veces al año acaba en que no se teclean y el coste sale bajo.
--
-- El mes entra POR PARÁMETRO y no se lee del reloj: así se puede probar
-- cualquier mes sin esperar a que llegue, igual que hace el resto de Atlas con
-- sus funciones de decisión.
create or replace function atlas_materializar_recurrentes(mes date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  primero date := date_trunc('month', mes)::date;
  creados int := 0;
begin
  insert into gastos (fecha, concepto, proveedor, base, iva, total, categoria,
                      cliente_id, proyecto_id, recurrente_id)
  select primero + (r.dia_del_mes - 1),
         r.concepto, r.proveedor, r.base, r.iva, r.base + r.iva, r.categoria,
         r.cliente_id, r.proyecto_id, r.id
  from gastos_recurrentes r
  where r.activo
    -- Idempotente: si la pasada de este mes ya ocurrió, no duplica. Un cron
    -- que se dispara dos veces no puede doblar los gastos del mes.
    and not exists (
      select 1 from gastos g
      where g.recurrente_id = r.id
        and date_trunc('month', g.fecha) = primero
    );

  get diagnostics creados = row_count;
  return creados;
end $$;

-- El día 1 a las 6:07. Ni en punto ni a medianoche: los minutos redondos
-- concentran carga de tareas programadas en cualquier sistema.
select cron.schedule('atlas-gastos-recurrentes', '7 6 1 * *',
                     $$select atlas_materializar_recurrentes(current_date)$$);
```

- [ ] **Paso 2: aplicar la migración**

```bash
cd apps/atlas && npx supabase migration up --local
```

- [ ] **Paso 3: escribir el test**

```ts
// src/tests/esquema/recurrentes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

async function alta(concepto: string, dia = 1, activo = true) {
  const { rows } = await pg.query(
    `INSERT INTO gastos_recurrentes (concepto, base, iva, categoria, dia_del_mes, activo)
     VALUES ($1, 20, 4.2, 'infraestructura', $2, $3) RETURNING id`,
    [concepto, dia, activo]
  );
  return rows[0].id as string;
}

async function materializar(mes: string): Promise<number> {
  const { rows } = await pg.query(`SELECT atlas_materializar_recurrentes($1) AS n`, [mes]);
  return Number(rows[0].n);
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

beforeEach(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM gastos_recurrentes`);
});

afterAll(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM gastos_recurrentes`);
  await pg.end();
});

describe("materializar recurrentes", () => {
  it("crea un gasto por cada alta activa, con su total", async () => {
    await alta("Vercel");
    await alta("Supabase");

    expect(await materializar("2026-09-15")).toBe(2);

    const { rows } = await pg.query(
      `SELECT concepto, fecha::text, total FROM gastos ORDER BY concepto`
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].fecha).toBe("2026-09-01");
    expect(Number(rows[0].total)).toBe(24.2);
  });

  // Lo que impide que un cron disparado dos veces doble los gastos del mes.
  it("dos pasadas del mismo mes no duplican", async () => {
    await alta("Vercel");
    expect(await materializar("2026-09-01")).toBe(1);
    expect(await materializar("2026-09-20")).toBe(0);

    const { rows } = await pg.query(`SELECT count(*)::int AS n FROM gastos`);
    expect(rows[0].n).toBe(1);
  });

  it("meses distintos sí generan gastos distintos", async () => {
    await alta("Vercel");
    await materializar("2026-09-01");
    expect(await materializar("2026-10-01")).toBe(1);
  });

  it("las bajas no se materializan", async () => {
    await alta("Antiguo", 1, false);
    expect(await materializar("2026-09-01")).toBe(0);
  });

  it("respeta el día del mes", async () => {
    await alta("Twilio", 15);
    await materializar("2026-09-01");
    const { rows } = await pg.query(`SELECT fecha::text FROM gastos`);
    expect(rows[0].fecha).toBe("2026-09-15");
  });
});
```

- [ ] **Paso 4: ejecutar el test**

Ejecutar: `npx vitest run src/tests/esquema/recurrentes.test.ts`
Esperado: PASA, 5 tests.

- [ ] **Paso 5: comprobar que el cron quedó dado de alta**

Ejecutar:
```bash
node -e "const {Client}=require('pg');(async()=>{const pg=new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});await pg.connect();const r=await pg.query(\"select jobname, schedule from cron.job where jobname = 'atlas-gastos-recurrentes'\");console.table(r.rows);await pg.end();})();"
```
Esperado: una fila con `7 6 1 * *`.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260829110000_recurrentes.sql \
        apps/atlas/src/tests/esquema/recurrentes.test.ts
git commit -m "feat(atlas): los recibos fijos se materializan solos cada mes"
```

---

## Tarea 7: Los periodos de contrato

**La columna vertebral del plan 2B.** Sin ella, «¿qué llevo sin facturar?» hay que deducirlo al vuelo cada vez, y esa deducción es la que falla en silencio.

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260829120000_periodos.sql`
- Test: `apps/atlas/src/tests/esquema/periodos.test.ts`

**Interfaces:**
- Consume: `contratos`, `periodos_contrato` (tarea 2).
- Produce: la función SQL `atlas_materializar_periodos(mes date) returns int` y la tarea de cron `atlas-periodos-contrato`.

- [ ] **Paso 1: escribir la migración**

```sql
-- apps/atlas/supabase/migrations/20260829120000_periodos.sql
--
-- Cada mes de cada contrato activo, escrito.
--
-- Lo que no está registrado no se puede echar de menos: es la lección que dejó
-- el descubridor de tenants, donde una pasada que nunca ocurría se veía igual
-- que un sistema en calma. Aquí es lo mismo — un mes que nadie facturó no deja
-- rastro por sí solo.
--
-- El importe se CONGELA al materializar. Si se leyera de `contratos` al
-- consultar, subir la cuota reescribiría lo que se esperaba cobrar en meses
-- pasados, y el histórico dejaría de servir para comparar nada.
create or replace function atlas_materializar_periodos(mes date)
returns int
language plpgsql security definer set search_path = public as $$
declare
  primero date := date_trunc('month', mes)::date;
  creados int := 0;
begin
  insert into periodos_contrato (contrato_id, periodo, importe_esperado)
  select c.id, primero, c.cuota_mensual
  from contratos c
  where c.estado = 'activo'
    and c.cuota_mensual is not null
    -- El contrato tiene que estar vivo ese mes: ni antes del alta ni después
    -- de la baja. Sin esto se materializarían meses de clientes que ya se
    -- fueron, y 2B perseguiría cobros que nadie debe.
    and c.alta <= (primero + interval '1 month - 1 day')::date
    and (c.baja is null or c.baja >= primero)
    and not exists (
      select 1 from periodos_contrato p
      where p.contrato_id = c.id and p.periodo = primero
    );

  get diagnostics creados = row_count;
  return creados;
end $$;

select cron.schedule('atlas-periodos-contrato', '13 6 1 * *',
                     $$select atlas_materializar_periodos(current_date)$$);
```

- [ ] **Paso 2: aplicar la migración**

```bash
cd apps/atlas && npx supabase migration up --local
```

- [ ] **Paso 3: escribir el test**

```ts
// src/tests/esquema/periodos.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;
let idCliente = "";
let idProyecto = "";

async function contrato(
  alta: string,
  baja: string | null,
  estado = "activo",
  cuota: number | null = 350
) {
  const { rows } = await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta, baja, estado)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [idCliente, idProyecto, cuota, alta, baja, estado]
  );
  return rows[0].id as string;
}

async function materializar(mes: string): Promise<number> {
  const { rows } = await pg.query(`SELECT atlas_materializar_periodos($1) AS n`, [mes]);
  return Number(rows[0].n);
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Periodos Prueba','periodos-prueba')
     RETURNING id`
  );
  idCliente = c.id;
  const { rows: [p] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Periodos','periodos','interno')
     RETURNING id`
  );
  idProyecto = p.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM periodos_contrato`);
  await pg.query(`DELETE FROM contratos WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  await pg.query(`DELETE FROM periodos_contrato`);
  await pg.query(`DELETE FROM contratos WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
  await pg.end();
});

describe("materializar periodos", () => {
  it("crea el periodo con el importe congelado", async () => {
    await contrato("2026-01-01", null);
    expect(await materializar("2026-09-15")).toBe(1);

    const { rows } = await pg.query(
      `SELECT periodo::text, importe_esperado, factura_id FROM periodos_contrato`
    );
    expect(rows[0].periodo).toBe("2026-09-01");
    expect(Number(rows[0].importe_esperado)).toBe(350);
    // Nace sin factura: es justo lo que 2B irá a buscar.
    expect(rows[0].factura_id).toBeNull();
  });

  it("dos pasadas del mismo mes no duplican", async () => {
    await contrato("2026-01-01", null);
    expect(await materializar("2026-09-01")).toBe(1);
    expect(await materializar("2026-09-20")).toBe(0);
  });

  it("un contrato pausado no genera periodo", async () => {
    await contrato("2026-01-01", null, "pausado");
    expect(await materializar("2026-09-01")).toBe(0);
  });

  it("un contrato sin cuota no genera periodo", async () => {
    await contrato("2026-01-01", null, "activo", null);
    expect(await materializar("2026-09-01")).toBe(0);
  });

  // Sin esta comprobación, 2B perseguiría cobros de clientes que ya se fueron.
  it("no genera meses anteriores al alta ni posteriores a la baja", async () => {
    await contrato("2026-09-10", "2026-11-30");
    expect(await materializar("2026-08-01")).toBe(0); // antes del alta
    expect(await materializar("2026-09-01")).toBe(1); // el mes del alta sí
    expect(await materializar("2026-12-01")).toBe(0); // después de la baja
  });
});
```

- [ ] **Paso 4: ejecutar el test**

Ejecutar: `npx vitest run src/tests/esquema/periodos.test.ts`
Esperado: PASA, 5 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260829120000_periodos.sql \
        apps/atlas/src/tests/esquema/periodos.test.ts
git commit -m "feat(atlas): cada mes de cada contrato queda escrito"
```

---

## Tarea 8: La pantalla de Dinero

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/resumen-dinero.ts`
- Crear: `apps/atlas/src/app/dinero/page.tsx`
- Modificar: `apps/atlas/src/components/marco/BarraLateral.tsx`
- Modificar: `apps/atlas/scripts/humo.mjs`
- Test: `apps/atlas/src/tests/db/resumen-dinero.test.ts`

**Interfaces:**
- Consume: `Sb`, `listarFacturas` (tarea 3), `formatear` y `aCentimos` (tarea 1), `Distintivo`.
- Produce:
  - `type ResumenMes = { facturado: number; cobrado: number; pendiente: number; gastoDirecto: number; gastoEstructura: number }`
  - `function resumenDelMes(sb: Sb, mes: string): Promise<ResumenMes>`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/resumen-dinero.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { resumenDelMes } from "@/lib/db/resumen-dinero";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sb: ReturnType<typeof createClient<Database>>;
let idUsuario = "";
let idCliente = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const creado = await admin.auth.admin.createUser({
    email: "duenyo-resumen@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,true)`, [idUsuario]);

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "dr" },
  });
  await sb.auth.signInWithPassword({
    email: "duenyo-resumen@atlas.test",
    password: "contrasena-de-prueba",
  });

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Resumen Prueba','resumen-prueba')
     RETURNING id`
  );
  idCliente = c.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM gastos`);
});

afterAll(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

async function factura(numero: number, total: number, cobrada: string | null) {
  await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           base, iva_cuota, total, estado, cobrada_en)
     VALUES ('externa','R',$1,$2,'2026-08-10',$3,0,$3,'emitida',$4)`,
    [numero, idCliente, total, cobrada]
  );
}

describe("resumen del mes", () => {
  it("sin nada, todo a cero", async () => {
    expect(await resumenDelMes(sb, "2026-08-01")).toEqual({
      facturado: 0,
      cobrado: 0,
      pendiente: 0,
      gastoDirecto: 0,
      gastoEstructura: 0,
    });
  });

  it("separa lo cobrado de lo pendiente", async () => {
    await factura(1, 100, "2026-08-20");
    await factura(2, 50, null);

    const r = await resumenDelMes(sb, "2026-08-01");
    expect(r.facturado).toBe(150);
    expect(r.cobrado).toBe(100);
    expect(r.pendiente).toBe(50);
  });

  // La distinción que sostiene la rentabilidad: la estructura NO se reparte.
  it("separa el gasto directo del de estructura", async () => {
    await pg.query(
      `INSERT INTO gastos (fecha, concepto, base, iva, total, categoria, cliente_id)
       VALUES ('2026-08-05','Twilio',10,0,10,'telefonia',$1)`,
      [idCliente]
    );
    await pg.query(
      `INSERT INTO gastos (fecha, concepto, base, iva, total, categoria)
       VALUES ('2026-08-05','Vercel',20,0,20,'infraestructura')`
    );

    const r = await resumenDelMes(sb, "2026-08-01");
    expect(r.gastoDirecto).toBe(10);
    expect(r.gastoEstructura).toBe(20);
  });

  it("una anulada no cuenta como facturada", async () => {
    await factura(3, 999, null);
    await pg.query(`UPDATE facturas SET estado = 'anulada' WHERE numero = 3`);
    expect((await resumenDelMes(sb, "2026-08-01")).facturado).toBe(0);
  });

  it("no mezcla meses", async () => {
    await factura(4, 100, null);
    expect((await resumenDelMes(sb, "2026-07-01")).facturado).toBe(0);
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/db/resumen-dinero.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/resumen-dinero"».

- [ ] **Paso 3: escribir la implementación**

```ts
// src/lib/db/resumen-dinero.ts
import type { Sb } from "./clientes";

export type ResumenMes = {
  /** Todo lo emitido en el mes, anuladas aparte. */
  facturado: number;
  cobrado: number;
  pendiente: number;
  /** Imputado a un cliente o proyecto concreto. */
  gastoDirecto: number;
  /** Sin imputar. NO se reparte entre clientes (spec §6.3). */
  gastoEstructura: number;
};

/** Primer y último día del mes al que pertenece `mes`. */
function limites(mes: string): { desde: string; hasta: string } {
  const d = new Date(`${mes.slice(0, 7)}-01T00:00:00Z`);
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
}

export async function resumenDelMes(sb: Sb, mes: string): Promise<ResumenMes> {
  const { desde, hasta } = limites(mes);

  const { data: facturas, error: eF } = await sb
    .from("facturas")
    .select("total, cobrada_en")
    .gte("fecha_emision", desde)
    .lte("fecha_emision", hasta)
    .neq("estado", "anulada");
  if (eF) throw eF;

  const { data: gastos, error: eG } = await sb
    .from("gastos")
    .select("total, cliente_id, proyecto_id")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  if (eG) throw eG;

  // Se suma en céntimos y se divide al final: sumar euros en float acumula
  // error, y en una lista de cien facturas eso ya se ve en pantalla.
  const cent = (n: number) => Math.round(n * 100);
  let facturado = 0;
  let cobrado = 0;
  for (const f of facturas ?? []) {
    const t = cent(Number(f.total));
    facturado += t;
    if (f.cobrada_en !== null) cobrado += t;
  }

  let directo = 0;
  let estructura = 0;
  for (const g of gastos ?? []) {
    const t = cent(Number(g.total));
    if (g.cliente_id !== null || g.proyecto_id !== null) directo += t;
    else estructura += t;
  }

  return {
    facturado: facturado / 100,
    cobrado: cobrado / 100,
    pendiente: (facturado - cobrado) / 100,
    gastoDirecto: directo / 100,
    gastoEstructura: estructura / 100,
  };
}
```

- [ ] **Paso 4: escribir la pantalla**

```tsx
// src/app/dinero/page.tsx
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { resumenDelMes } from "@/lib/db/resumen-dinero";
import { listarFacturas } from "@/lib/db/facturas";
import { formatear, aCentimos } from "@/lib/dinero";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Madrid",
});

function Cifra({ etiqueta, euros }: { etiqueta: string; euros: number }) {
  return (
    <div className="cristal cristal-denso p-4">
      <div
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--texto-tenue)" }}
      >
        {etiqueta}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {formatear(aCentimos(euros) ?? 0)}
      </div>
    </div>
  );
}

export default async function PaginaDinero() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería listas vacías, pero un 404 es más honesto
  // que una pantalla en blanco que parece rota.
  if (!perfil?.esPropietario) notFound();

  const hoy = new Date().toISOString().slice(0, 10);
  const [resumen, facturas] = await Promise.all([
    resumenDelMes(sb, hoy),
    listarFacturas(sb, {}),
  ]);

  return (
    <section className="max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dinero</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo facturado, lo cobrado y lo que cuesta tenerlo en pie.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Facturado este mes" euros={resumen.facturado} />
        <Cifra etiqueta="Cobrado" euros={resumen.cobrado} />
        <Cifra etiqueta="Pendiente" euros={resumen.pendiente} />
        <Cifra etiqueta="Gasto directo" euros={resumen.gastoDirecto} />
      </div>

      {/* La estructura va aparte y sin repartir, a propósito: cualquier regla
          de reparto entre clientes sería una elección nuestra, no un dato. */}
      <p className="text-sm" style={{ color: "var(--texto-tenue)" }}>
        Coste de estructura del mes:{" "}
        <strong>{formatear(aCentimos(resumen.gastoEstructura) ?? 0)}</strong>. No se
        reparte entre clientes.
      </p>

      <h2 className="pt-2 text-lg font-semibold">Facturas</h2>

      {facturas.length === 0 ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Todavía no hay ninguna factura.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Aquí aparecerán las que registres, con lo que falta por cobrar.
          </p>
        </div>
      ) : (
        <div className="cristal cristal-denso overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Facturas registradas</caption>
            <thead>
              <tr
                className="border-b text-left text-xs uppercase tracking-wider"
                style={{
                  borderColor: "var(--cristal-borde)",
                  color: "var(--texto-tenue)",
                }}
              >
                <th scope="col" className="px-4 py-2 font-medium">Número</th>
                <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                <th scope="col" className="px-4 py-2 font-medium">Emitida</th>
                <th scope="col" className="px-4 py-2 font-medium">Total</th>
                <th scope="col" className="px-4 py-2 font-medium">Cobro</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {f.serie}-{f.numero ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">{f.clienteNombre}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {FECHA.format(new Date(f.fechaEmision))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                    {formatear(aCentimos(f.total) ?? 0)}
                  </td>
                  <td className="px-4 py-2.5">
                    {f.cobradaEn ? (
                      <Distintivo estado="ok" texto="Cobrada" />
                    ) : (
                      <Distintivo estado="aviso" texto="Pendiente" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Paso 5: añadir la entrada en la barra lateral**

En `src/components/marco/BarraLateral.tsx`, cambiar el import de iconos y el array `ENTRADAS`:

```tsx
import { LayoutGrid, Boxes, Users, BellRing, Settings, Wallet } from "lucide-react";

const ENTRADAS = [
  { href: "/", etiqueta: "Resumen", Icono: LayoutGrid },
  { href: "/proyectos", etiqueta: "Proyectos", Icono: Boxes },
  { href: "/clientes", etiqueta: "Clientes", Icono: Users },
  { href: "/alertas", etiqueta: "Alertas", Icono: BellRing },
  { href: "/dinero", etiqueta: "Dinero", Icono: Wallet },
  { href: "/ajustes", etiqueta: "Ajustes", Icono: Settings },
] as const;
```

- [ ] **Paso 6: añadir la ruta a la prueba de humo**

En `scripts/humo.mjs`, dentro del array `PANTALLAS`, tras la línea de `/alertas`:

```js
    // `exige` con contenido y no vacío: la pantalla se pinta desde tablas que
    // al principio estarán vacías, y un 200 con el cuerpo en blanco sería
    // indistinguible de una que funciona.
    { ruta: "/dinero", exige: ["Dinero", "Coste de estructura"] },
```

- [ ] **Paso 7: comprobar**

```bash
npx vitest run src/tests/db/resumen-dinero.test.ts
npx tsc --noEmit
```
Esperado: los 5 tests pasan y `tsc` limpio.

- [ ] **Paso 8: comprometer**

```bash
git add apps/atlas/src/lib/db/resumen-dinero.ts \
        apps/atlas/src/tests/db/resumen-dinero.test.ts \
        apps/atlas/src/app/dinero/page.tsx \
        apps/atlas/src/components/marco/BarraLateral.tsx \
        apps/atlas/scripts/humo.mjs
git commit -m "feat(atlas): la pantalla de Dinero, con la estructura sin repartir"
```

---

## Tarea 9: Dar de alta gastos y facturas desde la pantalla

**Ficheros:**
- Crear: `apps/atlas/src/components/dinero/FormGasto.tsx`
- Crear: `apps/atlas/src/components/dinero/FormFacturaExterna.tsx`
- Modificar: `apps/atlas/src/app/dinero/page.tsx`
- Test: `apps/atlas/src/tests/componentes/form-gasto.test.tsx`

**Interfaces:**
- Consume: `guardarGasto` (tarea 5), `guardarFacturaExterna` (tarea 4), `CATEGORIAS` y `Categoria` (tarea 5), `aCentimos` (tarea 1).
- Produce: `FormGasto({ clientes })` y `FormFacturaExterna({ clientes, proyectos })`, ambos componentes cliente.

- [ ] **Paso 1: escribir el test que falla**

```tsx
// src/tests/componentes/form-gasto.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormGasto } from "@/components/dinero/FormGasto";

// Los parámetros se declaran aunque no se usen: sin ellos `vi.fn` infiere una
// función de cero argumentos y `toHaveBeenCalledWith` deja de compilar.
const guardar = vi.fn(async (_e: unknown) => ({ ok: true }) as const);
vi.mock("@/lib/db/acciones-gastos", () => ({
  guardarGasto: (e: unknown) => guardar(e),
}));

const CLIENTES = [{ id: "c1", nombre: "Biodental" }];

beforeEach(() => guardar.mockClear());

describe("formulario de gasto", () => {
  it("manda los importes en céntimos, no en euros", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto"), "Vercel Pro");
    await u.type(screen.getByLabelText("Base"), "20,00");
    await u.type(screen.getByLabelText("IVA"), "4,20");
    await u.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).toHaveBeenCalledWith(
      expect.objectContaining({ baseCentimos: 2000, ivaCentimos: 420 })
    );
  });

  it("sin concepto no llama a guardar", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("El gasto necesita un concepto.");
  });

  it("un importe que no se entiende se explica", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto"), "Algo");
    await u.type(screen.getByLabelText("Base"), "pepe");
    await u.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("La base no es un importe.");
  });

  // Sin cliente es estructura, y eso NO es un error: es el caso más común.
  it("sin cliente se guarda igual, como estructura", async () => {
    render(<FormGasto clientes={CLIENTES} />);
    const u = userEvent.setup();

    await u.type(screen.getByLabelText("Concepto"), "Vercel");
    await u.type(screen.getByLabelText("Base"), "20");
    await u.click(screen.getByRole("button", { name: "Guardar gasto" }));

    expect(guardar).toHaveBeenCalledWith(expect.objectContaining({ clienteId: null }));
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/componentes/form-gasto.test.tsx`
Esperado: FALLA con «Failed to resolve import "@/components/dinero/FormGasto"».

- [ ] **Paso 3: escribir el formulario de gasto**

```tsx
// src/components/dinero/FormGasto.tsx
"use client";

import { useState } from "react";
import { guardarGasto } from "@/lib/db/acciones-gastos";
import { CATEGORIAS, type Categoria } from "@/lib/db/gastos";
import { aCentimos } from "@/lib/dinero";

/**
 * Los importes se convierten a céntimos AQUÍ, en el borde. A partir de este
 * punto ningún euro en coma flotante viaja hacia la base.
 */
export function FormGasto({
  clientes,
}: {
  clientes: { id: string; nombre: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(datos: FormData) {
    setError(null);

    const concepto = String(datos.get("concepto") ?? "").trim();
    if (concepto === "") return setError("El gasto necesita un concepto.");

    const base = aCentimos(String(datos.get("base") ?? ""));
    if (base === null) return setError("La base no es un importe.");

    // El IVA vacío es cero, no un error: hay gastos sin IVA.
    const ivaTexto = String(datos.get("iva") ?? "").trim();
    const iva = ivaTexto === "" ? 0 : aCentimos(ivaTexto);
    if (iva === null) return setError("El IVA no es un importe.");

    const clienteId = String(datos.get("clienteId") ?? "");

    setEnviando(true);
    const r = await guardarGasto({
      fecha: String(datos.get("fecha") ?? new Date().toISOString().slice(0, 10)),
      concepto,
      proveedor: String(datos.get("proveedor") ?? "") || null,
      baseCentimos: base,
      ivaCentimos: iva,
      categoria: String(datos.get("categoria") ?? "otro") as Categoria,
      clienteId: clienteId === "" ? null : clienteId,
    });
    setEnviando(false);

    if (!r.ok) setError(r.error);
  }

  return (
    <form action={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block">Concepto</span>
          <input name="concepto" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Proveedor</span>
          <input name="proveedor" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Base</span>
          <input name="base" inputMode="decimal" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">IVA</span>
          <input name="iva" inputMode="decimal" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Fecha</span>
          <input
            name="fecha"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Categoría</span>
          <select name="categoria" className="w-full rounded-lg px-2 py-1.5">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            {/* Vacío por defecto: la mayoría de los gastos son de estructura. */}
            <option value="">— de estructura, sin imputar —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        Guardar gasto
      </button>
    </form>
  );
}
```

- [ ] **Paso 4: escribir el formulario de factura externa**

```tsx
// src/components/dinero/FormFacturaExterna.tsx
"use client";

import { useState } from "react";
import { guardarFacturaExterna } from "@/lib/db/acciones-facturas";
import { aCentimos } from "@/lib/dinero";

type Linea = { concepto: string; importe: string; proyectoId: string };

const LINEA_VACIA: Linea = { concepto: "", importe: "", proyectoId: "" };

/**
 * Registra una factura que ya emitiste FUERA de Atlas. No la emite: eso llega
 * en el plan 2E, con su cadena de huellas y su firma.
 */
export function FormFacturaExterna({
  clientes,
  proyectos,
}: {
  clientes: { id: string; nombre: string }[];
  proyectos: { id: string; nombre: string }[];
}) {
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function cambiar(i: number, campo: keyof Linea, valor: string) {
    setLineas((ls) => ls.map((l, j) => (i === j ? { ...l, [campo]: valor } : l)));
  }

  async function alEnviar(datos: FormData) {
    setError(null);

    const utiles = lineas.filter((l) => l.concepto.trim() !== "");
    if (utiles.length === 0) return setError("Una factura necesita al menos una línea.");

    const convertidas = [];
    for (const l of utiles) {
      const c = aCentimos(l.importe);
      if (c === null) return setError(`El importe de «${l.concepto}» no se entiende.`);
      convertidas.push({
        concepto: l.concepto.trim(),
        cantidad: 1,
        precioUnitarioCentimos: c,
        // El proyecto va en la LÍNEA: una factura puede cubrir dos proyectos,
        // como el presupuesto real de Biodental.
        proyectoId: l.proyectoId === "" ? null : l.proyectoId,
      });
    }

    const numero = Number(datos.get("numero"));
    if (!Number.isInteger(numero) || numero <= 0) {
      return setError("El número de factura tiene que ser un entero positivo.");
    }

    setEnviando(true);
    const r = await guardarFacturaExterna({
      clienteId: String(datos.get("clienteId") ?? ""),
      serie: String(datos.get("serie") ?? "").trim(),
      numero,
      fechaEmision: String(datos.get("fechaEmision") ?? ""),
      fechaVencimiento: String(datos.get("fechaVencimiento") ?? "") || null,
      ivaTipo: 21,
      lineas: convertidas,
    });
    setEnviando(false);

    if (r.ok) setLineas([{ ...LINEA_VACIA }]);
    else setError(r.error);
  }

  return (
    <form action={alEnviar} className="cristal space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block">Cliente</span>
          <select name="clienteId" className="w-full rounded-lg px-2 py-1.5">
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Serie</span>
          <input name="serie" defaultValue="A" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Número</span>
          <input name="numero" inputMode="numeric" className="w-full rounded-lg px-2 py-1.5" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Emitida</span>
          <input
            name="fechaEmision"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-lg px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Vence</span>
          <input name="fechaVencimiento" type="date" className="w-full rounded-lg px-2 py-1.5" />
        </label>
      </div>

      <div className="space-y-2">
        {lineas.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-3">
            <input
              aria-label={`Concepto de la línea ${i + 1}`}
              value={l.concepto}
              onChange={(e) => cambiar(i, "concepto", e.target.value)}
              placeholder="Concepto"
              className="rounded-lg px-2 py-1.5 text-sm"
            />
            <input
              aria-label={`Importe de la línea ${i + 1}`}
              value={l.importe}
              onChange={(e) => cambiar(i, "importe", e.target.value)}
              inputMode="decimal"
              placeholder="Importe"
              className="rounded-lg px-2 py-1.5 text-sm"
            />
            <select
              aria-label={`Proyecto de la línea ${i + 1}`}
              value={l.proyectoId}
              onChange={(e) => cambiar(i, "proyectoId", e.target.value)}
              className="rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="">— sin proyecto —</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLineas((ls) => [...ls, { ...LINEA_VACIA }])}
          className="text-sm underline opacity-70 hover:opacity-100"
        >
          Añadir línea
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--estado-caido)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        style={{ background: "var(--cristal-fondo-denso)" }}
      >
        Registrar factura
      </button>
    </form>
  );
}
```

- [ ] **Paso 5: colgar los formularios de la pantalla**

En `src/app/dinero/page.tsx`, añadir estos imports:

```tsx
import { FormGasto } from "@/components/dinero/FormGasto";
import { FormFacturaExterna } from "@/components/dinero/FormFacturaExterna";
import { listarClientes } from "@/lib/db/clientes";
import { listarProyectos } from "@/lib/db/proyectos";
```

Cambiar el `Promise.all` para que cargue también las listas:

```tsx
  const [resumen, facturas, clientes, proyectos] = await Promise.all([
    resumenDelMes(sb, hoy),
    listarFacturas(sb, {}),
    listarClientes(sb),
    listarProyectos(sb),
  ]);
```

Y renderizar los formularios justo antes del `<h2>Facturas</h2>`:

```tsx
      <h2 className="pt-2 text-lg font-semibold">Registrar factura emitida fuera</h2>
      <FormFacturaExterna
        clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        proyectos={proyectos.map((p) => ({ id: p.id, nombre: p.nombre }))}
      />

      <h2 className="pt-2 text-lg font-semibold">Apuntar un gasto</h2>
      <FormGasto clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))} />
```

- [ ] **Paso 6: comprobar**

```bash
npx vitest run src/tests/componentes/form-gasto.test.tsx
npx tsc --noEmit
```
Esperado: los 4 tests pasan y `tsc` limpio.

- [ ] **Paso 7: comprometer**

```bash
git add apps/atlas/src/components/dinero/ \
        apps/atlas/src/tests/componentes/form-gasto.test.tsx \
        apps/atlas/src/app/dinero/page.tsx
git commit -m "feat(atlas): dar de alta gastos y facturas desde la pantalla"
```

---

## Tarea 10: Jubilar `finance.ts` de jarvis (parcial — quedan tres tablas fuera)

**El objetivo del plan era que el dinero viviera en UN sitio, y este bloque no lo cumple del todo.** Esta tarea vuelca `hat3x_transactions` y jubila `finance.ts`, pero `apps/jarvis/src/lib/company-brain.ts` sigue leyendo y escribiendo `hat3x_recurring_expenses`, `hat3x_project_costs` y `hat3x_project_revenue`, y `command-handler.ts` las expone a través de `company-brain.ts`. Mientras esas tres tablas sigan siendo la verdad de alguien, sigue habiendo dos verdades — la migración de esta tarea cierra una de las dos, no las dos.

**Ficheros:**
- Crear: `apps/atlas/scripts/migrar/transacciones.ts`
- Modificar: `apps/jarvis/src/lib/finance.ts`
- Modificar: `apps/atlas/README.md`
- Modificar: `apps/atlas/MANTENIMIENTO.md`

**Interfaces:**
- Consume: `gastos` (tarea 2), la base de jarvis por cadena de conexión.
- Produce: el script `scripts/migrar/transacciones.ts`.

- [ ] **Paso 1: escribir el script de volcado**

```ts
// apps/atlas/scripts/migrar/transacciones.ts
//
// Vuelca `hat3x_transactions` de jarvis al libro de Atlas. Se ejecuta UNA vez:
//
//   npx tsx scripts/migrar/transacciones.ts --origen "postgresql://..."
//
// Los ingresos NO se convierten en facturas: una transacción de jarvis no tiene
// serie, ni número, ni líneas, y fabricarle unos falsos metería en el libro
// facturas que nunca existieron. Se vuelcan solo los gastos, y los ingresos se
// listan por pantalla para decidir a mano cuáles merecen una factura
// registrada.
//
import { Client } from "pg";

const DESTINO = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Las categorías de jarvis no son las de Atlas. Esto las traduce. */
const CATEGORIA: Record<string, string> = {
  herramientas_saas: "herramientas",
  infraestructura: "infraestructura",
  marketing: "marketing",
  personal: "otro",
  cliente: "otro",
  otro: "otro",
};

async function main() {
  const i = process.argv.indexOf("--origen");
  const cadena = process.argv[i + 1];
  if (i === -1 || !cadena) {
    throw new Error("Falta --origen con la cadena de conexión de jarvis.");
  }

  const origen = new Client({ connectionString: cadena });
  const destino = new Client({ connectionString: DESTINO });
  await origen.connect();
  await destino.connect();

  const { rows } = await origen.query(
    `SELECT type, amount, description, category, date::text AS date
     FROM hat3x_transactions ORDER BY date`
  );

  let gastos = 0;
  const ingresos: string[] = [];

  for (const t of rows) {
    if (t.type === "expense") {
      await destino.query(
        `INSERT INTO gastos (fecha, concepto, base, iva, total, categoria, notas)
         VALUES ($1,$2,$3,0,$3,$4,'Importado de jarvis')`,
        [t.date, t.description, t.amount, CATEGORIA[t.category] ?? "otro"]
      );
      gastos++;
    } else {
      ingresos.push(`  ${t.date}  ${t.amount} €  ${t.description}`);
    }
  }

  console.log(`${gastos} gastos importados.`);
  if (ingresos.length) {
    console.log(`\n${ingresos.length} ingresos NO importados, para revisar a mano:`);
    console.log(ingresos.join("\n"));
  }

  await origen.end();
  await destino.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Paso 2: dejar `finance.ts` sin salida**

Sustituir **todo** el contenido de `apps/jarvis/src/lib/finance.ts` por:

```ts
//
// JUBILADO. El dinero de HAT3X vive en Atlas desde el bloque 2A.
//
// Este módulo escribía en `hat3x_transactions`, que era la segunda de las
// cuatro verdades sobre el dinero. Sus datos se volcaron con
// `apps/atlas/scripts/migrar/transacciones.ts`.
//
// No se borra el fichero para que quien lo importe reciba un error que explica
// dónde mirar, en vez de un «módulo no encontrado» que no explica nada.
//
const AVISO =
  "finance.ts está jubilado: el dinero vive en Atlas (bloque 2A). " +
  "Usa /dinero, o apps/atlas/src/lib/db/acciones-gastos.ts.";

export function recordTransaction(): never {
  throw new Error(AVISO);
}

export function queryFinances(): never {
  throw new Error(AVISO);
}

export function getCurrentMonthSummary(): never {
  throw new Error(AVISO);
}
```

- [ ] **Paso 3: comprobar que nadie más lo usa**

Ejecutar:
```bash
grep -rn "lib/finance" apps/jarvis/src apps/command/src --include=*.ts --include=*.tsx
```
Esperado: si aparece algún consumidor, hay que quitarle la llamada o redirigirla a Atlas antes de seguir. Si no aparece nada, continuar.

- [ ] **Paso 4: documentar**

En `apps/atlas/README.md`, sección «Estructura», añadir bajo `src/lib/`:

```
│   ├── dinero.ts    Los importes, en céntimos enteros. Ningún float toca un euro
```

En `apps/atlas/MANTENIMIENTO.md`, sección «Tareas periódicas», añadir una fila:

```
| Mes | Comprobar que los recibos fijos se materializaron: `select count(*) from gastos where recurrente_id is not null and date_trunc('month', fecha) = date_trunc('month', current_date);` |
```

- [ ] **Paso 5: verificación de salida**

```bash
cd apps/atlas
npx tsc --noEmit
npx vitest run
# parar el servidor de desarrollo antes del build: comparten .next
npm run build
```
Esperado: `tsc` limpio, toda la batería en verde, build compilando con `/dinero` en la lista de rutas.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/scripts/migrar/transacciones.ts \
        apps/jarvis/src/lib/finance.ts \
        apps/atlas/README.md apps/atlas/MANTENIMIENTO.md
git commit -m "feat(atlas): jubilar finance.ts, el dinero vive en un solo sitio"
```

---

## Verificación de salida del plan

Al terminar las diez tareas:

- [ ] `npx tsc --noEmit` limpio.
- [ ] `npx vitest run` entero en verde.
- [ ] `npm run build` compilando, con `/dinero` en la lista de rutas.
- [ ] `npm run humo` con `ok /dinero`.
- [ ] Con sesión de propietario, `/dinero` enseña el resumen del mes, permite registrar una factura de dos líneas con proyectos distintos y apuntar un gasto de estructura.
- [ ] Con sesión de **colaborador**, `/dinero` devuelve 404.
- [ ] `select atlas_materializar_recurrentes(current_date);` dos veces seguidas crea los gastos una sola vez.
- [ ] `select atlas_materializar_periodos(current_date);` deja una fila por contrato activo, con `factura_id` nulo.

## Lo que este plan deja preparado y no usa

- **`facturas.huella`, `huella_anterior`, `firma`, `rectifica_a` y la emisión propia** — los rellena el plan 2E. La restricción `solo_atlas_encadena` ya impide que una factura externa los lleve.
- **`periodos_contrato.factura_id`** — lo enlaza el plan 2B al facturar un periodo.
- **`gastos.proyecto_id` en la rentabilidad por proyecto** — lo consume 2D.
- **`ajustes_economia`** (spec §4.8) — no se crea aquí a propósito. Guardará los datos fiscales del emisor y el coste de la hora, y ninguno de los dos lo necesita 2A: el primero es de 2E y el segundo de 2C. Crear una tabla vacía tres planes antes de que alguien la lea solo invita a preguntarse por qué está siempre sin filas.
- **`marcarCobrada` y `cambiarCobro`** — existen y están probadas, pero la pantalla de 2A no las expone todavía: el botón de cobro llega con 2B, junto al resto del seguimiento.
