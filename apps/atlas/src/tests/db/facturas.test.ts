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

const CORREO_DUENYO = "duenyo-facturas@atlas.test";
const CORREO_COLABORADOR = "colab-facturas@atlas.test";
const SLUG_CLIENTE = "biodental-prueba";

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

  sbDuenyo = await altaUsuario(CORREO_DUENYO, true, "df");
  sbColaborador = await altaUsuario(CORREO_COLABORADOR, false, "cf");

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Biodental Prueba',$1)
     RETURNING id`,
    [SLUG_CLIENTE]
  );
  idCliente = c.id;

  // 'emitida' explícito: por defecto una factura nace 'borrador', y esta es
  // la que los tests usan como "la que sí falta por cobrar" — con el filtro
  // de `sinCobrar` exigiendo 'emitida' (ronda de arreglo 1), dejarla en el
  // default la habría hecho desaparecer de esa lista en silencio.
  const { rows: [f] } = await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           fecha_vencimiento, base, iva_cuota, total, estado)
     VALUES ('externa','BIO',1,$1,'2026-08-04','2026-09-04',350,73.5,423.5,'emitida')
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

  // Una cobrada, para poder filtrar. 'emitida' explícito: sin él nace
  // 'borrador' por defecto, y el filtro de `sinCobrar` la habría dejado fuera
  // por el estado en vez de por el cobro — el `.is("cobrada_en", null)` de
  // `listarFacturas` habría podido borrarse sin que ningún test lo notara.
  await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           base, iva_cuota, total, estado, cobrada_en)
     VALUES ('externa','BIO',2,$1,'2026-07-04',350,73.5,423.5,'emitida','2026-07-20')`,
    [idCliente]
  );

  // Una anulada y sin cobrar: no es una deuda que perseguir, y esa exclusión
  // es justo la consulta sobre la que se construye el plan 2B.
  await pg.query(
    `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                           base, iva_cuota, total, estado)
     VALUES ('externa','BIO',3,$1,'2026-06-04',350,73.5,423.5,'anulada')`,
    [idCliente]
  );
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

describe("listar facturas", () => {
  it("trae las del cliente, la más reciente primero", async () => {
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente });
    expect(fs).toHaveLength(3);
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

  // Una factura anulada y sin cobrar NO es una deuda que perseguir. Es la
  // consulta sobre la que se construye el plan 2B, así que la exclusión se
  // fija con un test en vez de confiarla al `.neq` del código.
  it("las anuladas no salen entre las que faltan por cobrar", async () => {
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente, sinCobrar: true });
    expect(fs.map((f) => f.numero)).toEqual([1]);
  });

  // Mismo motivo que las anuladas: un borrador no es una deuda que perseguir.
  it("los borradores no salen entre las que faltan por cobrar", async () => {
    await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                             base, iva_cuota, total, estado)
       VALUES ('externa','BIO',9,$1,'2026-08-04',100,0,100,'borrador')`,
      [idCliente]
    );
    const fs = await listarFacturas(sbDuenyo, { clienteId: idCliente, sinCobrar: true });
    expect(fs.map((f) => f.numero)).not.toContain(9);
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
