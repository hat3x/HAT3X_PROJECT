// src/tests/esquema/recurrentes.test.ts
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
const CORREO_COLABORADOR = "colab-recurrentes@atlas.test";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];

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
  // Antes de nada: este fichero hace `DELETE FROM` sin filtro sobre `gastos`
  // y `gastos_recurrentes` más abajo. Comprobarlo cuesta una comparación de
  // texto; no comprobarlo, el día que `URL_PG` apunte a otro sitio, es
  // irreversible.
  soloLocal(URL_PG);
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  // Limpieza defensiva, mismo motivo que en gastos.test.ts: si una corrida
  // anterior murió a medias, el correo queda ocupado y esta corrida fallaría
  // en `createUser` sin llegar a limpiar nada.
  const { data: listado } = await admin.auth.admin.listUsers();
  for (const u of listado?.users ?? []) {
    if (u.email === CORREO_COLABORADOR) {
      await admin.auth.admin.deleteUser(u.id);
    }
  }

  sbColaborador = await altaUsuario(CORREO_COLABORADOR, false, "cr");
});

// DELETE FROM sin condición: aceptable solo porque esto corre contra Supabase
// local y estas dos tablas no llevan datos que importen fuera del test. No
// copiar este patrón a un fichero que toque datos que sí importan.
beforeEach(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM gastos_recurrentes`);
});

afterAll(async () => {
  await pg.query(`DELETE FROM gastos`);
  await pg.query(`DELETE FROM gastos_recurrentes`);
  for (const id of usuarios) {
    try {
      await admin.auth.admin.deleteUser(id);
    } catch {
      // Se limpia en la limpieza defensiva de la próxima corrida.
    }
  }
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

// El spec exige comprobar el aislamiento con un colaborador de verdad, no
// suponerlo. Ya se hacía para facturas y gastos; aquí faltaba para
// gastos_recurrentes.
describe("permisos de gastos_recurrentes", () => {
  it("un colaborador no ve ninguna alta recurrente aunque existan filas", async () => {
    await alta("Vercel");
    const { data, error } = await sbColaborador.from("gastos_recurrentes").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
