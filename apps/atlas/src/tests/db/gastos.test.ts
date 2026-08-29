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

const CORREO_DUENYO = "duenyo-gastos@atlas.test";
const CORREO_COLABORADOR = "colab-gastos@atlas.test";
const SLUG_CLIENTE = "gastos-prueba";

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

  // Limpieza defensiva: si una corrida anterior murió entre crear los usuarios
  // y su `afterAll` (el propio `afterAll` podía reventar contra un
  // `idCliente` todavía en "" — ya ha pasado en este mismo plan), el correo
  // queda ocupado y esta corrida falla aquí mismo, en el `createUser` de más
  // abajo, sin llegar nunca a limpiar nada. Limpiar solo al final deja el
  // fichero inservible para siempre; limpiar también al principio lo hace
  // autorreparable.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLABORADOR) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await pg.query(
    `DELETE FROM gastos WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG_CLIENTE]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);

  sbDuenyo = await altaUsuario(CORREO_DUENYO, true, "dg");
  sbColaborador = await altaUsuario(CORREO_COLABORADOR, false, "cg");

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Gastos Prueba',$1)
     RETURNING id`,
    [SLUG_CLIENTE]
  );
  idCliente = c.id;
});

beforeEach(async () => {
  // Sin filtro a propósito: en desarrollo local no hay gastos reales que
  // proteger. NO copiar este `DELETE` sin filtro a un fichero que sí toque
  // datos que importan.
  await pg.query(`DELETE FROM gastos`);
});

afterAll(async () => {
  // Cada borrado va en su propio `try`: si uno falla, no debe impedir los
  // siguientes, y el cierre de `pg` en el `finally` está garantizado pase lo
  // que pase. Esta limpieza es solo cortesía cuando todo sale bien; la red de
  // seguridad real es la limpieza defensiva de `beforeAll`.
  try {
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM gastos WHERE cliente_id = $1`, [idCliente]);
      }
    } catch {
      // Se limpia en la siguiente corrida, en el `beforeAll`.
    }
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
      }
    } catch {
      // Idem.
    }
    for (const id of usuarios) {
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        // Idem: por correo, en la limpieza defensiva de la próxima corrida.
      }
    }
  } finally {
    await pg.end();
  }
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

  it("un colaborador no puede borrar un gasto", async () => {
    await escribirGasto(sbDuenyo, entrada());
    const [g] = await listarGastos(sbDuenyo, {});

    expect(await borrarGasto(sbColaborador, g!.id)).toEqual({
      ok: false,
      error: "Solo el propietario puede gestionar gastos.",
    });
    // Lo que de verdad importa: que siga ahí.
    expect(await listarGastos(sbDuenyo, {})).toHaveLength(1);
  });

  it("un gasto que no existe no se borra en silencio", async () => {
    const r = await borrarGasto(sbDuenyo, "00000000-0000-0000-0000-000000000000");
    expect(r).toEqual({ ok: false, error: "Ese gasto no existe." });
  });
});
