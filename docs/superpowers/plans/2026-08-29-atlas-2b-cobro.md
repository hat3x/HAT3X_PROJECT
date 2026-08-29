# Atlas 2B — Cobro · Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendada) o `superpowers:executing-plans` para implementar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** que a HAT3X no se le escape dinero. Al terminar, Atlas sabe qué meses de contrato llevan sin facturarse y qué facturas llevan sin cobrarse, lo enseña en pantalla, y manda un aviso diario al móvil con el resumen.

**Requisito previo:** el plan [`2A · El libro`](./2026-08-29-atlas-2a-libro.md) terminado, con `facturas`, `periodos_contrato` y la pantalla `/dinero` funcionando.

**Arquitectura:** la decisión —qué hay que perseguir hoy— es una **función pura** con la fecha por parámetro, como `transicion()` y `agrupar()` del bloque 1. El envío **reutiliza la Edge Function `avisar`**, que ya sabe mandar push y correo: se le añade una rama, disparada por su propia tarea de `pg_cron` diaria, en vez de escribir una función nueva que necesitaría copiar `push.ts` y `correo.ts`. La aplicación no puede mandar push sin añadir `web-push` como dependencia, y eso sería peor.

**Stack:** el del bloque 2A. Next.js 14, Supabase (Postgres + RLS + pg_cron + Edge Functions sobre Deno), TypeScript estricto, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-29-atlas-bloque-2-economia-design.md`](../specs/2026-08-29-atlas-bloque-2-economia-design.md) — secciones §6.1, §4.5 y §8.

## Restricciones globales

Las del 2A siguen aplicando. Las propias de este plan:

- **Ninguna función de decisión lee el reloj.** El instante entra por parámetro. Es lo que permite probar un vencimiento a 90 días sin esperar 90 días.
- **Ningún `float` toca un importe.** Céntimos enteros en el cálculo; `numeric(12,2)` en la base.
- **Va una vez al día, no cada minuto** como el vigía. Un día de retraso no es una urgencia, y un aviso diario que se puede ignorar sin consecuencias deja de leerse en dos semanas.
- **Nunca se avisa dos veces del mismo día.** El candado es una consulta a `notificaciones`: si ya hay un aviso de cobro de hoy para ese usuario, no se manda otro.
- **La lógica que comparten la aplicación y la Edge Function va COPIADA**, no importada: Deno no resuelve el alias `@/` y el despliegue solo sube `supabase/functions`. Las copias las vigila `src/tests/vigia/copias.test.ts`, que falla si divergen aunque sea un byte.
- **Aplicar las migraciones con `npx supabase migration up --local`, NUNCA con `db reset`.**
- `npx tsc --noEmit` limpio y `npm run build` compilando, con el servidor de desarrollo parado.
- Comentarios en español que explican **por qué**, no qué.

## Interfaces heredadas

Del 2A: `facturas` (con `cobrada_en`, `fecha_vencimiento`, `estado`), `periodos_contrato` (con `factura_id` e `importe_esperado`), `contratos`, `clientes`.
Del bloque 1: la tabla `notificaciones`, la Edge Function `avisar` con su `push.ts` y `correo.ts`, `atlas_es_propietario()`, `type Sb`, `type Ok`.
De `lib/dinero.ts`: `formatear(centimos)`, `aCentimos(texto)`, `hoyEnMadrid()`.

---

## Tarea 1: Qué hay que perseguir hoy

**La decisión, aislada.** Sin base, sin red, sin reloj: entran los periodos sin facturar, las facturas sin cobrar y la fecha de hoy; sale qué se persigue y el texto del aviso.

**Ficheros:**
- Crear: `apps/atlas/src/lib/cobro/pendientes.ts`
- Test: `apps/atlas/src/tests/cobro/pendientes.test.ts`

**Interfaces:**
- Consume: nada.
- Produce:
  - `type PeriodoSinFacturar = { contratoId: string; clienteNombre: string; periodo: string; importeEsperadoCentimos: number }`
  - `type FacturaSinCobrar = { id: string; serie: string; numero: number | null; clienteNombre: string; totalCentimos: number; fechaVencimiento: string | null }`
  - `type Cobro = { sinFacturar: PeriodoSinFacturar[]; vencidas: FacturaSinCobrar[]; totalSinFacturarCentimos: number; totalVencidoCentimos: number; hayAlgo: boolean; titulo: string; cuerpo: string }`
  - `function pendientesDeCobro(periodos: PeriodoSinFacturar[], facturas: FacturaSinCobrar[], hoy: string): Cobro`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/cobro/pendientes.test.ts
import { describe, it, expect } from "vitest";
import {
  pendientesDeCobro,
  type PeriodoSinFacturar,
  type FacturaSinCobrar,
} from "@/lib/cobro/pendientes";

const HOY = "2026-09-15";

function periodo(p: Partial<PeriodoSinFacturar> = {}): PeriodoSinFacturar {
  return {
    contratoId: "c1",
    clienteNombre: "Biodental",
    periodo: "2026-08-01",
    importeEsperadoCentimos: 35000,
    ...p,
  };
}

function factura(f: Partial<FacturaSinCobrar> = {}): FacturaSinCobrar {
  return {
    id: "f1",
    serie: "A",
    numero: 1,
    clienteNombre: "Biodental",
    totalCentimos: 42350,
    fechaVencimiento: "2026-09-01",
    ...f,
  };
}

describe("pendientes de cobro", () => {
  it("sin nada pendiente, no hay nada que avisar", () => {
    const c = pendientesDeCobro([], [], HOY);
    expect(c.hayAlgo).toBe(false);
    expect(c.totalSinFacturarCentimos).toBe(0);
    expect(c.totalVencidoCentimos).toBe(0);
  });

  it("suma lo que falta por facturar", () => {
    const c = pendientesDeCobro(
      [periodo(), periodo({ contratoId: "c2", importeEsperadoCentimos: 6000 })],
      [],
      HOY
    );
    expect(c.totalSinFacturarCentimos).toBe(41000);
    expect(c.hayAlgo).toBe(true);
  });

  // Una factura que aún no ha vencido NO es una deuda: es un plazo en curso.
  // Perseguirla sería avisar de algo que el cliente está cumpliendo.
  it("una factura que todavía no ha vencido no cuenta", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: "2026-10-01" })], HOY);
    expect(c.vencidas).toEqual([]);
    expect(c.hayAlgo).toBe(false);
  });

  it("la que vence hoy tampoco: se cumple durante todo el día", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: HOY })], HOY);
    expect(c.vencidas).toEqual([]);
  });

  it("la que venció ayer sí", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: "2026-09-14" })], HOY);
    expect(c.vencidas).toHaveLength(1);
    expect(c.totalVencidoCentimos).toBe(42350);
  });

  // Sin fecha de vencimiento no hay plazo que incumplir. Tratarla como vencida
  // llenaría el aviso de facturas que nadie acordó cuándo pagar.
  it("una factura sin vencimiento no se persigue", () => {
    const c = pendientesDeCobro([], [factura({ fechaVencimiento: null })], HOY);
    expect(c.vencidas).toEqual([]);
  });

  // Lo más viejo primero: es lo que más urge y lo que peor pinta tiene.
  it("ordena las vencidas de más antigua a más reciente", () => {
    const c = pendientesDeCobro(
      [],
      [
        factura({ id: "nueva", fechaVencimiento: "2026-09-10" }),
        factura({ id: "vieja", fechaVencimiento: "2026-06-01" }),
      ],
      HOY
    );
    expect(c.vencidas.map((f) => f.id)).toEqual(["vieja", "nueva"]);
  });

  it("el aviso dice las dos cosas cuando las hay", () => {
    const c = pendientesDeCobro(
      [periodo()],
      [factura({ fechaVencimiento: "2026-09-01" })],
      HOY
    );
    expect(c.titulo).toBe("Cobro: 1 sin facturar y 1 factura vencida");
    expect(c.cuerpo).toContain("350,00");
    expect(c.cuerpo).toContain("423,50");
  });

  it("y solo lo que hay cuando falta una de las dos", () => {
    const soloVencidas = pendientesDeCobro(
      [],
      [factura({ fechaVencimiento: "2026-09-01" })],
      HOY
    );
    expect(soloVencidas.titulo).toBe("Cobro: 1 factura vencida");

    const soloSinFacturar = pendientesDeCobro([periodo()], [], HOY);
    expect(soloSinFacturar.titulo).toBe("Cobro: 1 mes sin facturar");
  });

  // El plural importa más de lo que parece: un aviso que dice «1 meses» se lee
  // como un fallo del sistema, y un aviso que parece roto se deja de leer.
  it("concuerda el plural", () => {
    const c = pendientesDeCobro([periodo(), periodo({ contratoId: "c2" })], [], HOY);
    expect(c.titulo).toBe("Cobro: 2 meses sin facturar");
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `cd apps/atlas && npx vitest run src/tests/cobro/pendientes.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/cobro/pendientes"».

- [ ] **Paso 3: escribir la implementación**

```ts
// src/lib/cobro/pendientes.ts
//
// Qué hay que perseguir hoy.
//
// Función pura: sin base, sin red, sin reloj. La fecha entra por parámetro, que
// es lo que permite probar un vencimiento a noventa días sin esperar noventa
// días — igual que `transicion()` y `agrupar()` del bloque 1.
//
// Sin imports de la aplicación: esto se copia tal cual dentro de la Edge
// Function, y Deno no resuelve el alias `@/`.
//

export type PeriodoSinFacturar = {
  contratoId: string;
  clienteNombre: string;
  /** Primer día del mes, ISO AAAA-MM-DD. */
  periodo: string;
  importeEsperadoCentimos: number;
};

export type FacturaSinCobrar = {
  id: string;
  serie: string;
  numero: number | null;
  clienteNombre: string;
  totalCentimos: number;
  /** ISO AAAA-MM-DD. Nulo cuando no se acordó plazo. */
  fechaVencimiento: string | null;
};

export type Cobro = {
  sinFacturar: PeriodoSinFacturar[];
  vencidas: FacturaSinCobrar[];
  totalSinFacturarCentimos: number;
  totalVencidoCentimos: number;
  hayAlgo: boolean;
  titulo: string;
  cuerpo: string;
};

/**
 * Céntimos → euros con dos decimales, sin depender de `Intl`, para que la
 * copia que corre en Deno produzca exactamente el mismo texto que la de Node.
 */
function euros(centimos: number): string {
  const signo = centimos < 0 ? "-" : "";
  const abs = Math.abs(centimos);
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function pendientesDeCobro(
  periodos: PeriodoSinFacturar[],
  facturas: FacturaSinCobrar[],
  hoy: string
): Cobro {
  // Vencida es la que pasó su plazo, no la que lo tiene hoy: un plazo se
  // cumple durante todo su último día. Y sin fecha no hay plazo que incumplir,
  // así que esas no se persiguen — avisar de ellas llenaría el mensaje de
  // facturas que nadie acordó cuándo pagar.
  const vencidas = facturas
    .filter((f) => f.fechaVencimiento !== null && f.fechaVencimiento < hoy)
    // Lo más viejo primero: es lo que más urge y lo que peor pinta tiene.
    .sort((a, b) => (a.fechaVencimiento! < b.fechaVencimiento! ? -1 : 1));

  const totalSinFacturarCentimos = periodos.reduce(
    (t, p) => t + p.importeEsperadoCentimos,
    0
  );
  const totalVencidoCentimos = vencidas.reduce((t, f) => t + f.totalCentimos, 0);

  const nSin = periodos.length;
  const nVen = vencidas.length;
  const hayAlgo = nSin > 0 || nVen > 0;

  // El plural concuerda a propósito: un aviso que dice «1 meses» se lee como un
  // fallo del sistema, y un aviso que parece roto se deja de leer.
  const trozoSin = `${nSin} ${nSin === 1 ? "mes" : "meses"} sin facturar`;
  const trozoVen = `${nVen} ${nVen === 1 ? "factura vencida" : "vencidas"}`;

  let titulo: string;
  if (nSin > 0 && nVen > 0) titulo = `Cobro: ${nSin} sin facturar y ${trozoVen}`;
  else if (nVen > 0) titulo = `Cobro: ${trozoVen}`;
  else if (nSin > 0) titulo = `Cobro: ${trozoSin}`;
  else titulo = "Cobro: nada pendiente";

  const partes: string[] = [];
  if (nSin > 0) partes.push(`${euros(totalSinFacturarCentimos)} € sin facturar`);
  if (nVen > 0) partes.push(`${euros(totalVencidoCentimos)} € vencidos sin cobrar`);

  return {
    sinFacturar: periodos,
    vencidas,
    totalSinFacturarCentimos,
    totalVencidoCentimos,
    hayAlgo,
    titulo,
    cuerpo: partes.join(". "),
  };
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/cobro/pendientes.test.ts`
Esperado: PASA, 10 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/lib/cobro/ apps/atlas/src/tests/cobro/
git commit -m "feat(atlas): la decision de que hay que perseguir hoy"
```

---

## Tarea 2: La consulta que lo alimenta

**Ficheros:**
- Crear: `apps/atlas/src/lib/db/cobro.ts`
- Test: `apps/atlas/src/tests/db/cobro.test.ts`

**Interfaces:**
- Consume: `Sb`, los tipos `PeriodoSinFacturar` y `FacturaSinCobrar` de la tarea 1, y las tablas `periodos_contrato` y `facturas` del 2A.
- Produce: `function leerCobro(sb: Sb, hoy: string): Promise<{ periodos: PeriodoSinFacturar[]; facturas: FacturaSinCobrar[] }>`

- [ ] **Paso 1: escribir el test que falla**

```ts
// src/tests/db/cobro.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { leerCobro } from "@/lib/db/cobro";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-cobro@atlas.test";
const CORREO_COLAB = "colab-cobro@atlas.test";
const SLUG = "cobro-prueba";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
let idCliente = "";
let idProyecto = "";
let idContrato = "";

async function altaUsuario(correo: string, propietario: boolean, clave: string) {
  const creado = await admin.auth.admin.createUser({
    email: correo,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
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

  // Limpieza defensiva: si una corrida anterior murió a medias, sus restos
  // harían fallar el alta por correo duplicado y el fichero quedaría
  // inservible para siempre. Limpiar solo al final no basta.
  const { data: lista } = await admin.auth.admin.listUsers();
  for (const u of lista?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
      await pg.query(`DELETE FROM perfiles WHERE id = $1`, [u.id]);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await pg.query(
    `DELETE FROM facturas WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG]);
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG]);

  sbDuenyo = await altaUsuario(CORREO_DUENYO, true, "dc");
  sbColaborador = await altaUsuario(CORREO_COLAB, false, "cc");

  const {
    rows: [c],
  } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Cobro Prueba',$1) RETURNING id`,
    [SLUG]
  );
  idCliente = c.id;
  const {
    rows: [p],
  } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo) VALUES ('Cobro',$1,'interno') RETURNING id`,
    [SLUG]
  );
  idProyecto = p.id;
  const {
    rows: [k],
  } = await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta, estado)
     VALUES ($1,$2,350,'2026-01-01','activo') RETURNING id`,
    [idCliente, idProyecto]
  );
  idContrato = k.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM periodos_contrato WHERE contrato_id = $1`, [idContrato]);
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  // Cada borrado en su propio try: un fallo en el primero no puede impedir los
  // siguientes, o el fichero quedaría inservible tras una corrida cortada.
  try {
    await pg.query(`DELETE FROM periodos_contrato WHERE contrato_id = $1`, [idContrato]);
  } catch {}
  try {
    await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
  } catch {}
  try {
    await pg.query(`DELETE FROM contratos WHERE id = $1`, [idContrato]);
  } catch {}
  try {
    await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
  } catch {}
  try {
    await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
  } catch {}
  try {
    const { data: lista } = await admin.auth.admin.listUsers();
    for (const u of lista?.users ?? []) {
      if (u.email === CORREO_DUENYO || u.email === CORREO_COLAB) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
  } catch {}
  await pg.end();
});

async function periodo(mes: string, conFactura: string | null = null) {
  await pg.query(
    `INSERT INTO periodos_contrato (contrato_id, periodo, importe_esperado, factura_id)
     VALUES ($1,$2,350,$3)`,
    [idContrato, mes, conFactura]
  );
}

async function factura(numero: number, vence: string | null, cobrada: string | null) {
  const { rows } = await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           fecha_vencimiento, base, iva_cuota, total, estado, cobrada_en)
     VALUES ('externa','C',$1,$2,'2026-08-01',$3,350,73.5,423.5,'emitida',$4)
     RETURNING id`,
    [numero, idCliente, vence, cobrada]
  );
  return rows[0].id as string;
}

describe("leer lo pendiente de cobro", () => {
  it("sin nada, las dos listas vienen vacías", async () => {
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toEqual([]);
    expect(c.facturas).toEqual([]);
  });

  it("trae el periodo sin factura, con el nombre del cliente", async () => {
    await periodo("2026-08-01");
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toHaveLength(1);
    expect(c.periodos[0]!.clienteNombre).toBe("Cobro Prueba");
    expect(c.periodos[0]!.importeEsperadoCentimos).toBe(35000);
  });

  // El mes en curso todavía se puede facturar: perseguirlo el día 3 sería
  // avisar de algo que no ha llegado a ser un descuido.
  it("el mes en curso no cuenta como sin facturar", async () => {
    await periodo("2026-09-01");
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toEqual([]);
  });

  it("un periodo ya facturado no cuenta", async () => {
    const id = await factura(1, "2026-09-01", null);
    await periodo("2026-08-01", id);
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.periodos).toEqual([]);
  });

  it("trae la factura sin cobrar en céntimos", async () => {
    await factura(2, "2026-09-01", null);
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.facturas).toHaveLength(1);
    expect(c.facturas[0]!.totalCentimos).toBe(42350);
  });

  it("una cobrada no viene", async () => {
    await factura(3, "2026-09-01", "2026-09-05");
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.facturas).toEqual([]);
  });

  // Un borrador no se ha mandado a nadie, y una anulada no se debe. Ninguna de
  // las dos es una deuda que perseguir.
  it("ni un borrador ni una anulada", async () => {
    await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                             fecha_vencimiento, base, iva_cuota, total, estado)
       VALUES ('externa','C',4,$1,'2026-08-01','2026-09-01',350,73.5,423.5,'borrador'),
              ('externa','C',5,$1,'2026-08-01','2026-09-01',350,73.5,423.5,'anulada')`,
      [idCliente]
    );
    const c = await leerCobro(sbDuenyo, "2026-09-15");
    expect(c.facturas).toEqual([]);
  });

  // No filtra la consulta: de eso se encarga RLS, y se comprueba con un
  // colaborador real en vez de suponerlo.
  it("un colaborador no ve nada", async () => {
    await periodo("2026-08-01");
    await factura(6, "2026-09-01", null);
    const c = await leerCobro(sbColaborador, "2026-09-15");
    expect(c.periodos).toEqual([]);
    expect(c.facturas).toEqual([]);
  });
});
```

- [ ] **Paso 2: comprobar que falla**

Ejecutar: `npx vitest run src/tests/db/cobro.test.ts`
Esperado: FALLA con «Failed to resolve import "@/lib/db/cobro"».

- [ ] **Paso 3: escribir la implementación**

```ts
// src/lib/db/cobro.ts
import type { Sb } from "./clientes";
import type { PeriodoSinFacturar, FacturaSinCobrar } from "@/lib/cobro/pendientes";

//
// Lo que alimenta la decisión de `lib/cobro/pendientes.ts`.
//
// **No filtra por permisos**: de eso se encarga RLS, y hay un test que lo
// comprueba con un colaborador real en vez de suponerlo.
//

/** Céntimos desde el `numeric(12,2)` que devuelve Postgres. */
function aCentimos(n: unknown): number {
  return Math.round(Number(n) * 100);
}

export async function leerCobro(
  sb: Sb,
  hoy: string
): Promise<{ periodos: PeriodoSinFacturar[]; facturas: FacturaSinCobrar[] }> {
  // El mes en curso se excluye: todavía se puede facturar, y perseguirlo el
  // día 3 sería avisar de algo que aún no ha llegado a ser un descuido.
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;

  const { data: perFilas, error: eP } = await sb
    .from("periodos_contrato")
    .select(
      `contrato_id, periodo, importe_esperado,
       contratos!inner(clientes!inner(nombre))`
    )
    .is("factura_id", null)
    .lt("periodo", mesEnCurso)
    .order("periodo");
  if (eP) throw eP;

  const { data: facFilas, error: eF } = await sb
    .from("facturas")
    .select("id, serie, numero, total, fecha_vencimiento, clientes!inner(nombre)")
    .is("cobrada_en", null)
    .eq("estado", "emitida")
    .order("fecha_vencimiento");
  if (eF) throw eF;

  // PostgREST devuelve cada relación como objeto o como array según la
  // cardinalidad que infiera. Se normaliza en un solo sitio.
  const uno = <T,>(u: unknown): T => (Array.isArray(u) ? u[0] : u) as T;

  return {
    periodos: (perFilas ?? []).map((p) => {
      const contrato = uno<{ clientes: unknown }>(p.contratos);
      const cliente = uno<{ nombre: string }>(contrato.clientes);
      return {
        contratoId: p.contrato_id,
        clienteNombre: cliente.nombre,
        periodo: p.periodo,
        importeEsperadoCentimos: aCentimos(p.importe_esperado),
      };
    }),
    facturas: (facFilas ?? []).map((f) => ({
      id: f.id,
      serie: f.serie,
      numero: f.numero,
      clienteNombre: uno<{ nombre: string }>(f.clientes).nombre,
      totalCentimos: aCentimos(f.total),
      fechaVencimiento: f.fecha_vencimiento,
    })),
  };
}
```

- [ ] **Paso 4: comprobar que pasa**

Ejecutar: `npx vitest run src/tests/db/cobro.test.ts`
Esperado: PASA, 8 tests. Ejecútalo **dos veces seguidas**: la segunda tiene que pasar igual, que es lo que prueba la limpieza defensiva.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/lib/db/cobro.ts apps/atlas/src/tests/db/cobro.test.ts
git commit -m "feat(atlas): leer lo que falta por facturar y por cobrar"
```

---

## Tarea 3: El tipo de aviso, y su disparo diario

**Ficheros:**
- Crear: `apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql`
- Test: `apps/atlas/src/tests/esquema/aviso-cobro.test.ts`

**Interfaces:**
- Consume: `notificaciones` del bloque 1, y `atlas_disparar_avisos()` como referencia de forma.
- Produce: la columna `notificaciones.tipo`, la función `atlas_disparar_cobro()` y la tarea de cron `atlas-cobro`.

- [ ] **Paso 1: escribir la migración**

```sql
-- apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql
--
-- El aviso diario de cobro.
--
-- `notificaciones` nació atada a `incidencias`, con su `incidencia_id`. Un
-- aviso de cobro no tiene incidencia, así que ese campo va nulo — pero
-- entonces el historial no sabría de qué era cada fila. Por eso una columna
-- `tipo`.
alter table notificaciones
  add column tipo text not null default 'incidencia'
    check (tipo in ('incidencia','cobro'));

-- Las que ya existen son todas de incidencia, que es lo que dice el `default`.
-- Se deja el default puesto para que el código del bloque 1 no tenga que
-- cambiar: sigue insertando sin nombrar la columna y sigue siendo correcto.

-- El candado del día: sirve a la consulta «¿ya avisé hoy de cobro?», que es lo
-- único que impide mandar el mismo resumen dos veces si el cron se dispara dos
-- veces.
create index notificaciones_cobro_del_dia
  on notificaciones(usuario_id, enviada_en desc) where tipo = 'cobro';

-- ---------- el disparo ----------
--
-- Reutiliza la MISMA Edge Function que los avisos de incidencia, `avisar`, con
-- un cuerpo distinto. Escribir una función nueva habría obligado a copiar
-- `push.ts` y `correo.ts`, y dos copias del envío divergen siempre.
create or replace function atlas_disparar_cobro() returns void
language plpgsql security definer set search_path = public as $$
declare
  url   text := current_setting('app.atlas_funciones_url', true);
  clave text := current_setting('app.atlas_service_key', true);
begin
  -- Sin configurar, avisa y se calla, igual que el resto de disparadores: un
  -- error diario en el registro de cron acabaría tapando un problema de
  -- verdad.
  if url is null or clave is null then
    raise warning 'atlas: faltan app.atlas_funciones_url o app.atlas_service_key; no se dispara el cobro';
    return;
  end if;

  perform net.http_post(
    url     := url || '/avisar',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || clave),
    body    := '{"cobro": true}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

-- Cualquier `security definer` sin revoke queda expuesta en /rest/v1/rpc a
-- cualquier autenticado, y al ejecutarse como su dueño se salta RLS.
revoke all on function atlas_disparar_cobro() from public;
revoke all on function atlas_disparar_cobro() from anon;
revoke all on function atlas_disparar_cobro() from authenticated;

-- A las 9:07 de la mañana. Ni de madrugada, porque un aviso que se lee doce
-- horas después es un aviso perdido; ni en punto, porque los minutos redondos
-- concentran carga de tareas programadas.
select cron.schedule('atlas-cobro', '7 9 * * *',
                     $$select atlas_disparar_cobro()$$);
```

- [ ] **Paso 2: aplicar la migración y regenerar los tipos**

```bash
cd apps/atlas
npx supabase migration up --local
npm run tipos
```

- [ ] **Paso 3: escribir el test**

```ts
// src/tests/esquema/aviso-cobro.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
let pg: Client;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
});

afterAll(async () => {
  await pg.end();
});

describe("el aviso de cobro", () => {
  it("las notificaciones nacen de tipo incidencia", async () => {
    const { rows } = await pg.query(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'notificaciones' AND column_name = 'tipo'`
    );
    expect(rows[0].column_default).toContain("incidencia");
  });

  it("solo admite los dos tipos previstos", async () => {
    await expect(
      pg.query(
        `INSERT INTO notificaciones (usuario_id, canal, ok, tipo)
         VALUES ('00000000-0000-0000-0000-000000000000','push',true,'chuches')`
      )
    ).rejects.toThrow(/tipo/);
  });

  it("la tarea diaria está dada de alta a las 9:07", async () => {
    const { rows } = await pg.query(
      `SELECT schedule FROM cron.job WHERE jobname = 'atlas-cobro'`
    );
    expect(rows[0].schedule).toBe("7 9 * * *");
  });

  // Un `security definer` sin revoke queda expuesto en /rest/v1/rpc y se salta
  // RLS. Se comprueba ejecutando con el rol, no leyendo el catálogo: lo que
  // importa es qué pasa cuando alguien llama.
  it("un rol autenticado no puede dispararla", async () => {
    await pg.query("begin");
    await pg.query("set local role authenticated");
    await expect(pg.query("select atlas_disparar_cobro()")).rejects.toThrow(
      /permission denied|permiso denegado/i
    );
    await pg.query("rollback");
  });
});
```

- [ ] **Paso 4: ejecutar el test**

Ejecutar: `npx vitest run src/tests/esquema/aviso-cobro.test.ts`
Esperado: PASA, 4 tests.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/supabase/migrations/20260829170000_aviso_cobro.sql \
        apps/atlas/src/tests/esquema/aviso-cobro.test.ts \
        apps/atlas/src/types/supabase.ts
git commit -m "feat(atlas): el tipo de aviso de cobro y su disparo diario"
```

---

## Tarea 4: La rama de cobro en la Edge Function

**Ficheros:**
- Crear: `apps/atlas/supabase/functions/avisar/cobro.ts` (copia de `src/lib/cobro/pendientes.ts`)
- Modificar: `apps/atlas/supabase/functions/avisar/index.ts`
- Modificar: `apps/atlas/src/tests/vigia/copias.test.ts`

**Interfaces:**
- Consume: `pendientesDeCobro` (tarea 1), la columna `notificaciones.tipo` (tarea 3), y el `push.ts` y `correo.ts` que ya existen en esa carpeta.
- Produce: la rama que responde a `{"cobro": true}`.

- [ ] **Paso 1: copiar la lógica pura a Deno**

Copia `apps/atlas/src/lib/cobro/pendientes.ts` a `apps/atlas/supabase/functions/avisar/cobro.ts`, **byte a byte**, sin cambiar nada. No tiene imports, así que la copia es directa.

- [ ] **Paso 2: ampliar el vigilante de copias**

Abre `apps/atlas/src/tests/vigia/copias.test.ts`, mira cómo declara los pares que ya vigila, y **añade el nuevo con esa misma forma**: original `src/lib/cobro/pendientes.ts`, copia `supabase/functions/avisar/cobro.ts`. El test tiene que fallar si divergen aunque sea un byte.

- [ ] **Paso 3: ejecutar el test de copias**

Ejecutar: `npx vitest run src/tests/vigia/copias.test.ts`
Esperado: PASA. Si falla, la copia no es idéntica: cópiala otra vez sin retoques.

- [ ] **Paso 4: añadir la rama a la Edge Function**

Abre `apps/atlas/supabase/functions/avisar/index.ts`. Añade arriba `import { pendientesDeCobro } from "./cobro.ts";` y, dentro del `Deno.serve`, **antes** de la lógica de incidencias que ya existe:

```ts
  // La misma función sirve a dos cadencias: las incidencias van cada minuto y
  // el cobro una vez al día, disparados por dos tareas de cron distintas. Se
  // reutiliza esta y no se escribe una nueva porque una nueva necesitaría su
  // propia copia de `push.ts` y `correo.ts`, y dos copias del envío divergen
  // siempre.
  const cuerpo = await peticion.json().catch(() => ({}));
  if (cuerpo?.cobro === true) {
    return await avisarDeCobro(sb);
  }
```

Y al final del fichero:

```ts
/**
 * El resumen diario de cobro: qué lleva sin facturarse y qué sin cobrarse.
 *
 * No manda nada si no hay nada. Un aviso diario que llega vacío se convierte
 * en ruido, y el ruido se deja de leer — con lo que el día que sí importe
 * tampoco se leerá.
 */
async function avisarDeCobro(sb: SupabaseClient): Promise<Response> {
  const hoy = new Date().toISOString().slice(0, 10);
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;

  const { data: per } = await sb
    .from("periodos_contrato")
    .select("contrato_id, periodo, importe_esperado, contratos!inner(clientes!inner(nombre))")
    .is("factura_id", null)
    .lt("periodo", mesEnCurso);

  const { data: fac } = await sb
    .from("facturas")
    .select("id, serie, numero, total, fecha_vencimiento, clientes!inner(nombre)")
    .is("cobrada_en", null)
    .eq("estado", "emitida");

  const uno = (u: unknown) => (Array.isArray(u) ? u[0] : u);

  const cobro = pendientesDeCobro(
    (per ?? []).map((p) => ({
      contratoId: p.contrato_id,
      clienteNombre: uno(uno(p.contratos).clientes).nombre,
      periodo: p.periodo,
      importeEsperadoCentimos: Math.round(Number(p.importe_esperado) * 100),
    })),
    (fac ?? []).map((f) => ({
      id: f.id,
      serie: f.serie,
      numero: f.numero,
      clienteNombre: uno(f.clientes).nombre,
      totalCentimos: Math.round(Number(f.total) * 100),
      fechaVencimiento: f.fecha_vencimiento,
    })),
    hoy
  );

  if (!cobro.hayAlgo) {
    return new Response(JSON.stringify({ enviados: 0, motivo: "nada pendiente" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data: perfiles } = await sb
    .from("perfiles")
    .select("id")
    .eq("es_propietario", true);

  let enviados = 0;
  for (const p of perfiles ?? []) {
    // El candado del día. Si el cron se dispara dos veces, el segundo no manda
    // nada: un aviso repetido enseña que el sistema no se controla a sí mismo.
    const { data: yaHoy } = await sb
      .from("notificaciones")
      .select("id")
      .eq("usuario_id", p.id)
      .eq("tipo", "cobro")
      .gte("enviada_en", `${hoy}T00:00:00Z`)
      .limit(1);
    if (yaHoy && yaHoy.length > 0) continue;

    await repartir(sb, p.id, cobro.titulo, cobro.cuerpo, "cobro");
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), {
    headers: { "content-type": "application/json" },
  });
}
```

**Importante:** `repartir` ya existe en ese fichero para las incidencias. Ábrelo, mira su firma real y **adapta la llamada de arriba a lo que de verdad acepta**. Si no admite un parámetro de tipo, amplíala —sin romper las llamadas existentes— para que la fila que escriba en `notificaciones` lleve `tipo: 'cobro'`. Si su forma difiere mucho de lo que supone el código de arriba, ajusta la llamada y **déjalo dicho en el informe**; lo que no es negociable es que la notificación quede registrada con su tipo.

- [ ] **Paso 5: comprobar**

```bash
npx vitest run
npx tsc --noEmit
```
Esperado: toda la batería en verde, incluida la de copias, y `tsc` limpio.

- [ ] **Paso 6: comprometer**

```bash
git add apps/atlas/supabase/functions/avisar/ apps/atlas/src/tests/vigia/copias.test.ts
git commit -m "feat(atlas): el aviso diario de cobro, en la funcion que ya enviaba"
```

---

## Tarea 5: Verlo en pantalla

**Ficheros:**
- Crear: `apps/atlas/src/app/dinero/cobro/page.tsx`
- Modificar: `apps/atlas/src/app/dinero/page.tsx`
- Modificar: `apps/atlas/scripts/humo.mjs`

**Interfaces:**
- Consume: `leerCobro` (tarea 2), `pendientesDeCobro` (tarea 1), `formatear` y `hoyEnMadrid` de `lib/dinero.ts`, y `Distintivo`.
- Produce: la ruta `/dinero/cobro`.

- [ ] **Paso 1: escribir la pantalla**

```tsx
// src/app/dinero/cobro/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "@/lib/db/perfil";
import { leerCobro } from "@/lib/db/cobro";
import { pendientesDeCobro } from "@/lib/cobro/pendientes";
import { formatear, hoyEnMadrid } from "@/lib/dinero";
import { Distintivo } from "@/components/ui/Distintivo";

const FECHA = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

const MES = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

/** Días que lleva vencida, para que se vea cuál duele más. */
function diasDeRetraso(vencimiento: string, hoy: string): number {
  const ms = Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${vencimiento}T00:00:00Z`);
  return Math.floor(ms / 86_400_000);
}

export default async function PaginaCobro() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  // Doble puerta: RLS ya devolvería listas vacías, pero un 404 es más honesto
  // que una pantalla en blanco que parece rota.
  if (!perfil?.esPropietario) notFound();

  const hoy = hoyEnMadrid();
  const { periodos, facturas } = await leerCobro(sb, hoy);
  const c = pendientesDeCobro(periodos, facturas, hoy);

  return (
    <section className="max-w-4xl space-y-4">
      <header>
        <Link
          href="/dinero"
          className="mb-2 inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100"
        >
          <ChevronLeft size={15} aria-hidden="true" />
          Dinero
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Cobro</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
          Lo que falta por facturar y lo que falta por cobrar. Llega también al
          móvil, una vez al día.
        </p>
      </header>

      {!c.hayAlgo ? (
        <div className="cristal p-8 text-center">
          <p className="font-medium">Nada pendiente. Buena señal.</p>
          <p className="mt-1 text-sm" style={{ color: "var(--texto-tenue)" }}>
            Todos los meses cerrados están facturados y ninguna factura ha
            pasado su plazo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="cristal cristal-denso p-4">
            <div
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--texto-tenue)" }}
            >
              Sin facturar
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatear(c.totalSinFacturarCentimos)}
            </div>
          </div>
          <div className="cristal cristal-denso p-4">
            <div
              className="text-xs uppercase tracking-wider"
              style={{ color: "var(--texto-tenue)" }}
            >
              Vencido sin cobrar
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {formatear(c.totalVencidoCentimos)}
            </div>
          </div>
        </div>
      )}

      {c.sinFacturar.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">Meses sin facturar</h2>
          <div className="cristal cristal-denso overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Periodos de contrato sin factura</caption>
              <thead>
                <tr
                  className="border-b text-left text-xs uppercase tracking-wider"
                  style={{
                    borderColor: "var(--cristal-borde)",
                    color: "var(--texto-tenue)",
                  }}
                >
                  <th scope="col" className="px-4 py-2 font-medium">Cliente</th>
                  <th scope="col" className="px-4 py-2 font-medium">Mes</th>
                  <th scope="col" className="px-4 py-2 font-medium">Esperado</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
                {c.sinFacturar.map((p) => (
                  <tr key={`${p.contratoId}-${p.periodo}`}>
                    <td className="px-4 py-2.5">{p.clienteNombre}</td>
                    <td className="px-4 py-2.5 capitalize">
                      {MES.format(new Date(p.periodo))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                      {formatear(p.importeEsperadoCentimos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {c.vencidas.length > 0 && (
        <>
          <h2 className="pt-2 text-lg font-semibold">Facturas vencidas</h2>
          <div className="cristal cristal-denso overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Facturas emitidas que pasaron su plazo</caption>
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
                  <th scope="col" className="px-4 py-2 font-medium">Venció</th>
                  <th scope="col" className="px-4 py-2 font-medium">Retraso</th>
                  <th scope="col" className="px-4 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--cristal-borde)" }}>
                {c.vencidas.map((f) => {
                  const dias = diasDeRetraso(f.fechaVencimiento!, hoy);
                  return (
                    <tr key={f.id}>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {f.serie}-{f.numero ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">{f.clienteNombre}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {FECHA.format(new Date(f.fechaVencimiento!))}
                      </td>
                      <td className="px-4 py-2.5">
                        {/* Más de un mes de retraso deja de ser un despiste. */}
                        <Distintivo
                          estado={dias > 30 ? "caido" : "aviso"}
                          texto={`${dias} ${dias === 1 ? "día" : "días"}`}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {formatear(f.totalCentimos)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Paso 2: enlazarla desde `/dinero`**

En `src/app/dinero/page.tsx`, junto al enlace a los gastos que ya existe, añadir:

```tsx
      <p className="text-sm">
        <Link href="/dinero/cobro" className="underline opacity-80 hover:opacity-100">
          Ver lo que falta por facturar y por cobrar →
        </Link>
      </p>
```

- [ ] **Paso 3: añadirla a la prueba de humo**

En `scripts/humo.mjs`, en el array `PANTALLAS`, tras la entrada de `/dinero/gastos`:

```js
    { ruta: "/dinero/cobro", exige: ["Cobro"] },
```

- [ ] **Paso 4: comprobar**

```bash
npx tsc --noEmit
npx vitest run
# parar el servidor de desarrollo antes del build: comparten .next
npm run build
```
Esperado: `tsc` limpio, batería entera en verde, y build compilando con `/dinero/cobro` en la lista de rutas.

- [ ] **Paso 5: comprometer**

```bash
git add apps/atlas/src/app/dinero/ apps/atlas/scripts/humo.mjs
git commit -m "feat(atlas): la pantalla de cobro, con los dias de retraso a la vista"
```

---

## Verificación de salida del plan

- [ ] `npx tsc --noEmit` limpio.
- [ ] `npx vitest run` entero en verde.
- [ ] `npm run build` compilando, con `/dinero/cobro` en la lista de rutas.
- [ ] `npm run humo` con `ok /dinero/cobro`.
- [ ] Con sesión de **colaborador**, `/dinero/cobro` devuelve 404.
- [ ] `select atlas_disparar_cobro();` dos veces seguidas manda **un solo** aviso.
- [ ] Con nada pendiente, la Edge Function responde `{"enviados":0,"motivo":"nada pendiente"}` y no escribe en `notificaciones`.

## Lo que este plan deja fuera

- **Marcar cobrada desde la pantalla.** `marcarCobrada` y `cambiarCobro` existen y están probadas desde 2A, pero exponerlas es una decisión aparte.
- **Recordatorio al cliente.** Atlas avisa al propietario, no manda nada al cliente. Eso es otra conversación y otro riesgo.
- **La rentabilidad**, que es 2D y necesita las horas de 2C.
