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

const CORREO_DUENYO = "duenyo-escribir-fra@atlas.test";
const CORREO_COLABORADOR = "colab-escribir-fra@atlas.test";
const SLUG_CLIENTE = "escribir-prueba";

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

  // Limpieza defensiva: si una corrida anterior murió entre crear los usuarios
  // y su `afterAll` (el propio `afterAll` podía reventar contra una columna
  // uuid con `idCliente` todavía en "" — ya ha pasado), el correo queda
  // ocupado y esta corrida falla aquí mismo, en el `createUser` de más abajo,
  // sin llegar nunca a limpiar nada. Limpiar solo al final deja el fichero
  // inservible para siempre; limpiar también al principio lo hace
  // autorreparable. Mismo mecanismo que `scripts/humo.mjs`: recorrer
  // `listUsers()` y borrar por correo — `perfiles` lo borra la cascada de la
  // FK a `auth.users`, no hace falta a mano.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO || u.email === CORREO_COLABORADOR) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await pg.query(
    `DELETE FROM facturas WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG_CLIENTE]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);

  sbDuenyo = await altaUsuario(CORREO_DUENYO, true, "def");
  sbColaborador = await altaUsuario(CORREO_COLABORADOR, false, "cef");

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Escribir Prueba',$1)
     RETURNING id`,
    [SLUG_CLIENTE]
  );
  idCliente = c.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  // Cada borrado va en su propio `try`: si uno falla, no debe impedir los
  // siguientes, y el cierre de `pg` en el `finally` está garantizado pase lo
  // que pase. Antes, un fallo a mitad de este bloque dejaba el fichero
  // inservible para siempre porque nunca llegaba a borrar los usuarios ni a
  // cerrar la conexión. Esta limpieza es solo cortesía cuando todo sale bien;
  // la red de seguridad real es la limpieza defensiva de `beforeAll`.
  try {
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
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

  it("un colaborador no puede marcar cobrada", async () => {
    await registrarFacturaExterna(sbDuenyo, entrada());
    const [f] = await listarFacturas(sbDuenyo, { clienteId: idCliente });

    const r = await marcarCobrada(sbColaborador, f!.id, "2026-09-01");
    expect(r).toEqual({
      ok: false,
      error: "Solo el propietario puede gestionar facturas.",
    });

    // Y lo que de verdad importa: que NO se haya cobrado.
    const [tras] = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(tras!.cobradaEn).toBeNull();
  });

  // Un id inexistente producía la misma mentira que el caso del colaborador:
  // cero filas afectadas y un {ok:true} que no había hecho nada.
  it("una factura que no existe no se cobra en silencio", async () => {
    const r = await marcarCobrada(
      sbDuenyo,
      "00000000-0000-0000-0000-000000000000",
      "2026-09-01"
    );
    expect(r).toEqual({ ok: false, error: "Esa factura no existe." });
  });
});
