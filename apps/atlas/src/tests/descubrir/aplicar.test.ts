import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { vigilados, aplicarPlan, BASE_RESERVAS } from "@/lib/descubrir/aplicar";
import { reconciliar } from "@/lib/descubrir/tenants";
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
let idProyecto = "";

const tenant = (slug: string) => ({ slug, nombre: `Salón ${slug}`, sector: "peluqueria" });

/** Da de alta un check de tenant a mano, como los que ya existían. */
async function aMano(slug: string, activo = true) {
  const { rows: [s] } = await pg.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo, proveedor)
     VALUES ($1,$2,'api','Vercel') RETURNING id`,
    [idProyecto, `Reservas — ${slug}`]
  );
  await pg.query(
    `INSERT INTO checks (servicio_id, tipo, url, espera_status, activo)
     VALUES ($1,'http',$2,'{200}',$3)`,
    [s.id, `${BASE_RESERVAS}/${slug}`, activo]
  );
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const creado = await admin.auth.admin.createUser({
    email: "descubrir@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,'Descubrir',true)`,
    [idUsuario]
  );

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "descubrir" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "descubrir@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

beforeEach(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-descubrir'`);
  const { rows: [p] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado)
     VALUES ('Descubrir','proy-descubrir','producto-propio','produccion') RETURNING id`
  );
  idProyecto = p.id;
});

afterAll(async () => {
  await pg.query(`DELETE FROM proyectos WHERE slug = 'proy-descubrir'`);
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("qué se está vigilando ya", () => {
  it("reconoce los checks de tenant por su URL, aunque se crearan a mano", async () => {
    await aMano("biodental");
    await aMano("viejo", false);

    const lista = await vigilados(sb, idProyecto);

    expect(lista.map((v) => v.slug).sort()).toEqual(["biodental", "viejo"]);
    expect(lista.find((v) => v.slug === "viejo")!.activo).toBe(false);
  });

  it("no confunde con los checks de plataforma", async () => {
    const { rows: [s] } = await pg.query(
      `INSERT INTO servicios (proyecto_id, nombre, tipo) VALUES ($1,'Entrada','web') RETURNING id`,
      [idProyecto]
    );
    await pg.query(
      `INSERT INTO checks (servicio_id, tipo, url, espera_status)
       VALUES ($1,'http','https://kairosmanager.app/login','{200}')`,
      [s.id]
    );

    expect(await vigilados(sb, idProyecto)).toEqual([]);
  });
});

describe("aplicar el plan", () => {
  it("da de alta el tenant nuevo con su check", async () => {
    const plan = reconciliar([tenant("nuevo")], []);
    const r = await aplicarPlan(sb, idProyecto, plan);

    expect(r).toEqual({ altas: 1, pausados: 0, reactivados: 0 });

    const { rows } = await pg.query(
      `SELECT s.nombre, c.url, c.espera_texto, c.notifica, c.activo
         FROM checks c JOIN servicios s ON s.id = c.servicio_id
        WHERE s.proyecto_id = $1`,
      [idProyecto]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(`${BASE_RESERVAS}/nuevo`);
    // Sin el texto esperado, un 200 con el cuerpo vacío contaría como bueno.
    expect(rows[0].espera_texto).toBe("nuevo");
    expect(rows[0].notifica).toBe(true);
    expect(rows[0].activo).toBe(true);
  });

  // Una demo caída importa, pero a las diez de la mañana, no de madrugada.
  it("las demos entran sin avisos", async () => {
    await aplicarPlan(sb, idProyecto, reconciliar([tenant("demo-resto")], []));

    const { rows } = await pg.query(
      `SELECT c.notifica FROM checks c JOIN servicios s ON s.id = c.servicio_id
        WHERE s.proyecto_id = $1`,
      [idProyecto]
    );
    expect(rows[0].notifica).toBe(false);
  });

  // Lo importante: un cliente de baja no es un cliente caído, y por HTTP son el
  // mismo 404.
  it("pausa al que sale del censo, sin borrarlo", async () => {
    await aMano("se-va");
    const plan = reconciliar([tenant("sigue")], await vigilados(sb, idProyecto));

    const r = await aplicarPlan(sb, idProyecto, plan);

    expect(r.pausados).toBe(1);
    const { rows } = await pg.query(
      `SELECT c.activo FROM checks c JOIN servicios s ON s.id = c.servicio_id
        WHERE c.url = $1`,
      [`${BASE_RESERVAS}/se-va`]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].activo).toBe(false);
  });

  it("reactiva al que vuelve, sin duplicarlo", async () => {
    await aMano("vuelve", false);
    const plan = reconciliar([tenant("vuelve")], await vigilados(sb, idProyecto));

    const r = await aplicarPlan(sb, idProyecto, plan);

    expect(r).toEqual({ altas: 0, pausados: 0, reactivados: 1 });
    const { rows } = await pg.query(
      `SELECT c.activo FROM checks c JOIN servicios s ON s.id = c.servicio_id
        WHERE s.proyecto_id = $1`,
      [idProyecto]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].activo).toBe(true);
  });

  it("no duplica lo que ya estaba dado de alta a mano", async () => {
    await aMano("biodental");
    const plan = reconciliar([tenant("biodental")], await vigilados(sb, idProyecto));

    const r = await aplicarPlan(sb, idProyecto, plan);

    expect(r).toEqual({ altas: 0, pausados: 0, reactivados: 0 });
    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM checks c JOIN servicios s ON s.id = c.servicio_id
        WHERE s.proyecto_id = $1`,
      [idProyecto]
    );
    expect(rows[0].n).toBe(1);
  });

  it("ejecutarlo dos veces seguidas no cambia nada la segunda", async () => {
    await aplicarPlan(sb, idProyecto, reconciliar([tenant("uno"), tenant("dos")], []));
    const segunda = await aplicarPlan(
      sb,
      idProyecto,
      reconciliar([tenant("uno"), tenant("dos")], await vigilados(sb, idProyecto))
    );

    expect(segunda).toEqual({ altas: 0, pausados: 0, reactivados: 0 });
  });
});
