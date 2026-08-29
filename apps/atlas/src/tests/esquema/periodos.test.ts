// src/tests/esquema/periodos.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { soloLocal } from "@/tests/ayuda/solo-local";

const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const SLUG_CLIENTE = "periodos-prueba";
const SLUG_PROYECTO = "periodos";
const CORREO_COLABORADOR = "colab-periodos@atlas.test";
let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];
let idCliente = "";
let idProyecto = "";

// Copiado de src/tests/db/gastos.test.ts: el aislamiento de fila se comprueba
// con un colaborador de verdad autenticado, no se supone.
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
  // Antes de nada: este fichero hace `DELETE FROM` sin filtro sobre
  // `periodos_contrato` más abajo. Comprobarlo cuesta una comparación de
  // texto; no comprobarlo, el día que `URL_PG` apunte a otro sitio, es
  // irreversible.
  soloLocal(URL_PG);
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva: si una corrida anterior se cortó a medias, los slugs
  // fijos de cliente y proyecto ya existirán y el INSERT de más abajo fallará.
  // Igual que en src/tests/db/acciones-facturas.test.ts, se borra por slug
  // antes de crear nada, para que el fichero se autorrepare solo. Mismo
  // motivo para el correo del colaborador, copiado de gastos.test.ts.
  await pg.query(
    `DELETE FROM periodos_contrato WHERE contrato_id IN (
       SELECT id FROM contratos WHERE cliente_id IN (
         SELECT id FROM clientes WHERE slug = $1
       )
     )`,
    [SLUG_CLIENTE]
  );
  await pg.query(
    `DELETE FROM contratos WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG_CLIENTE]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);
  await pg.query(`DELETE FROM proyectos WHERE slug = $1`, [SLUG_PROYECTO]);
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_COLABORADOR) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

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

  sbColaborador = await altaUsuario(CORREO_COLABORADOR, false, "cp");
});

// DELETE FROM sobre periodos_contrato es sin condición: aceptable solo porque
// esto corre contra Supabase local y esa tabla no lleva datos que importen
// fuera del test. No copiar este patrón a un fichero que toque datos que sí
// importan.
beforeEach(async () => {
  await pg.query(`DELETE FROM periodos_contrato`);
  await pg.query(`DELETE FROM contratos WHERE cliente_id = $1`, [idCliente]);
});

afterAll(async () => {
  // Cada borrado va en su propio try: si uno falla, no debe impedir los
  // siguientes, y el cierre de `pg` en el finally está garantizado pase lo
  // que pase. Esta limpieza es solo cortesía cuando todo sale bien; la red de
  // seguridad real es la limpieza defensiva del beforeAll. Mismo patrón que
  // src/tests/db/acciones-facturas.test.ts.
  try {
    try {
      await pg.query(`DELETE FROM periodos_contrato`);
    } catch {
      // Se limpia en la siguiente corrida, en el beforeAll.
    }
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM contratos WHERE cliente_id = $1`, [idCliente]);
      }
    } catch {
      // Idem.
    }
    try {
      if (idCliente !== "") {
        await pg.query(`DELETE FROM clientes WHERE id = $1`, [idCliente]);
      }
    } catch {
      // Idem.
    }
    try {
      if (idProyecto !== "") {
        await pg.query(`DELETE FROM proyectos WHERE id = $1`, [idProyecto]);
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

// El spec exige comprobar el aislamiento con un colaborador de verdad, no
// suponerlo. Ya se hacía para facturas y gastos; aquí faltaba para
// periodos_contrato.
describe("permisos de periodos_contrato", () => {
  it("un colaborador no ve ningún periodo aunque existan filas", async () => {
    await contrato("2026-01-01", null);
    await materializar("2026-09-01");
    const { data, error } = await sbColaborador.from("periodos_contrato").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
