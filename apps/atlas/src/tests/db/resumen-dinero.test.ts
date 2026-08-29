import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { resumenDelMes } from "@/lib/db/resumen-dinero";
import type { Database } from "@/types/supabase";
import { soloLocal } from "@/tests/ayuda/solo-local";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const CORREO_DUENYO = "duenyo-resumen@atlas.test";
const SLUG_CLIENTE = "resumen-prueba";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sb: ReturnType<typeof createClient<Database>>;
let idUsuario = "";
let idCliente = "";

beforeAll(async () => {
  // Antes de nada: este fichero hace `DELETE FROM` sin filtro sobre `gastos`
  // más abajo. Comprobarlo cuesta una comparación de texto; no comprobarlo,
  // el día que `URL_PG` apunte a otro sitio, es irreversible.
  soloLocal(URL_PG);
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva: si una corrida anterior murió entre crear el usuario y
  // su `afterAll`, el correo queda ocupado y esta corrida falla en el
  // `createUser` de más abajo sin haber limpiado nada. Limpiar solo al final
  // deja el fichero inservible para siempre; limpiar también al principio lo
  // hace autorreparable. Mismo mecanismo que `acciones-facturas.test.ts` y
  // `scripts/humo.mjs`: recorrer `listUsers()` y borrar por correo — la fila
  // de `perfiles` la borra la cascada de la FK a `auth.users`.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_DUENYO) await admin.auth.admin.deleteUser(u.id);
  }
  await pg.query(
    `DELETE FROM facturas WHERE cliente_id IN (SELECT id FROM clientes WHERE slug = $1)`,
    [SLUG_CLIENTE]
  );
  await pg.query(`DELETE FROM clientes WHERE slug = $1`, [SLUG_CLIENTE]);

  const creado = await admin.auth.admin.createUser({
    email: CORREO_DUENYO,
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1,true)`, [idUsuario]);

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "dr" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: CORREO_DUENYO,
    password: "contrasena-de-prueba",
  });
  if (error) throw error;

  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Resumen Prueba',$1)
     RETURNING id`,
    [SLUG_CLIENTE]
  );
  idCliente = c.id;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
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
        await pg.query(`DELETE FROM facturas WHERE cliente_id = $1`, [idCliente]);
      }
    } catch {
      // Se limpia en la siguiente corrida, en el `beforeAll`.
    }
    try {
      await pg.query(`DELETE FROM gastos`);
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
      if (idUsuario !== "") await admin.auth.admin.deleteUser(idUsuario);
    } catch {
      // Idem: por correo, en la limpieza defensiva de la próxima corrida.
    }
  } finally {
    await pg.end();
  }
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

  // Los importes son céntimos enteros: 150 € y 100 € entran como 15000 y
  // 10000. Ver la corrección al brief en el módulo de datos.
  it("separa lo cobrado de lo pendiente", async () => {
    await factura(1, 100, "2026-08-20");
    await factura(2, 50, null);

    const r = await resumenDelMes(sb, "2026-08-01");
    expect(r.facturado).toBe(15000);
    expect(r.cobrado).toBe(10000);
    expect(r.pendiente).toBe(5000);
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
    expect(r.gastoDirecto).toBe(1000);
    expect(r.gastoEstructura).toBe(2000);
  });

  it("una anulada no cuenta como facturada", async () => {
    await factura(3, 999, null);
    await pg.query(`UPDATE facturas SET estado = 'anulada' WHERE numero = 3`);
    expect((await resumenDelMes(sb, "2026-08-01")).facturado).toBe(0);
  });

  // El plan 2E dejará facturas en borrador hasta asignarles número. Sin este
  // filtro, la pantalla empezaría a contar como ingreso lo que nadie ha
  // mandado todavía — y lo haría en silencio, el día que 2E entre.
  it("un borrador no cuenta como facturado", async () => {
    await pg.query(
      `INSERT INTO facturas (origen, serie, numero, cliente_id, fecha_emision,
                             base, iva_cuota, total, estado)
       VALUES ('externa','R',9,$1,'2026-08-10',100,0,100,'borrador')`,
      [idCliente]
    );
    expect((await resumenDelMes(sb, "2026-08-01")).facturado).toBe(0);
  });

  it("no mezcla meses", async () => {
    await factura(4, 100, null);
    expect((await resumenDelMes(sb, "2026-07-01")).facturado).toBe(0);
  });
});
