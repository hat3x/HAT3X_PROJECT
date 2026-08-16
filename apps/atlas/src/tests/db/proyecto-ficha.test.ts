import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { obtenerProyecto } from "@/lib/db/proyectos";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let idUsuario = "";
let sb: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const creado = await admin.auth.admin.createUser({
    email: "proy@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, true)`, [
    idUsuario,
  ]);

  const { rows: [p] } = await pg.query(
    `INSERT INTO proyectos (nombre, slug, tipo, estado, stack, repo_url)
     VALUES ('Recepcionista Sara','recep-sara','voz','produccion',
             ARRAY['Retell','n8n','Twilio'],'https://github.com/ejemplo/sara')
     RETURNING id`
  );
  const { rows: [c] } = await pg.query(
    `INSERT INTO clientes (nombre, slug) VALUES ('Dental Ficha','dental-ficha')
     RETURNING id`
  );
  await pg.query(
    `INSERT INTO contratos (cliente_id, proyecto_id, cuota_mensual, alta)
     VALUES ($1,$2,290.00,'2026-05-01')`,
    [c.id, p.id]
  );
  // Uno CON cliente y otro SIN: la atribución comercial es lo que se prueba.
  await pg.query(
    `INSERT INTO servicios (proyecto_id, cliente_id, nombre, tipo, proveedor, orden)
     VALUES ($1,$2,'n8n 02-crear-cita','workflow','n8n',1)`,
    [p.id, c.id]
  );
  await pg.query(
    `INSERT INTO servicios (proyecto_id, nombre, tipo, proveedor, orden)
     VALUES ($1,'Agente Retell','agente-voz','retell',0)`,
    [p.id]
  );
  await pg.query(
    `INSERT INTO enlaces (proyecto_id, etiqueta, url)
     VALUES ($1,'n8n','https://n8n.ejemplo.test')`,
    [p.id]
  );

  sb = createClient<Database>(URL_API, ANON);
  const { error } = await sb.auth.signInWithPassword({
    email: "proy@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM clientes  WHERE slug = 'dental-ficha'`);
  await pg.query(`DELETE FROM proyectos WHERE slug = 'recep-sara'`);
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("ficha de proyecto", () => {
  it("trae stack, repositorio y enlaces", async () => {
    const p = await obtenerProyecto(sb, "recep-sara");
    expect(p).not.toBeNull();
    expect(p!.stack).toEqual(["Retell", "n8n", "Twilio"]);
    expect(p!.repoUrl).toBe("https://github.com/ejemplo/sara");
    expect(p!.enlaces.map((e) => e.etiqueta)).toEqual(["n8n"]);
  });

  it("ordena los servicios y resuelve a qué cliente pertenece cada uno", async () => {
    const p = await obtenerProyecto(sb, "recep-sara");
    expect(p!.servicios.map((s) => s.nombre)).toEqual([
      "Agente Retell",
      "n8n 02-crear-cita",
    ]);
    // El servicio sin cliente es del proyecto; el otro es atribuible.
    expect(p!.servicios[0]!.clienteNombre).toBeNull();
    expect(p!.servicios[1]!.clienteNombre).toBe("Dental Ficha");
  });

  it("trae los contratos con el nombre del cliente", async () => {
    const p = await obtenerProyecto(sb, "recep-sara");
    expect(p!.contratos).toHaveLength(1);
    expect(p!.contratos[0]!.clienteNombre).toBe("Dental Ficha");
    expect(p!.contratos[0]!.cuotaMensual).toBe(290);
    expect(p!.contratos[0]!.alta).toBe("2026-05-01");
  });

  it("devuelve null cuando el slug no existe", async () => {
    expect(await obtenerProyecto(sb, "no-existe-jamas")).toBeNull();
  });
});
