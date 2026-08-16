import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  validarSuscripcion,
  registrarDispositivoCon,
  olvidarDispositivoCon,
  type Suscripcion,
} from "@/lib/db/push";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Endpoint inventado, con la forma del de FCM. Nunca se le envía nada: estos
// tests solo escriben en la tabla.
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/PRUEBA-PUSH-ATLAS";

const sus = (campos: Partial<Suscripcion> = {}): Suscripcion => ({
  endpoint: ENDPOINT,
  p256dh: "clave-publica-de-prueba",
  auth: "secreto-de-prueba",
  dispositivo: "Navegador de prueba",
  ...campos,
});

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sb: ReturnType<typeof createClient<Database>>;
let sinSesion: ReturnType<typeof createClient<Database>>;
let idUsuario = "";

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });

  const usuario = await admin.auth.admin.createUser({
    email: "push@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (usuario.error) throw usuario.error;
  idUsuario = usuario.data.user.id;

  await pg.query(
    `INSERT INTO perfiles (id, nombre, es_propietario) VALUES ($1,'Push Prueba',false)`,
    [idUsuario]
  );

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "push" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "push@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;

  sinSesion = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "push-anon" },
  });
});

afterAll(async () => {
  await pg.query(
    `DELETE FROM suscripciones_push WHERE endpoint LIKE '%PRUEBA-PUSH-ATLAS%'`
  );
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("validación de la suscripción", () => {
  it("acepta una completa", () => {
    expect(validarSuscripcion(sus()).ok).toBe(true);
  });

  it("rechaza la que no tiene endpoint", () => {
    const r = validarSuscripcion(sus({ endpoint: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/endpoint/i);
  });

  it("rechaza un endpoint que no es una URL", () => {
    const r = validarSuscripcion(sus({ endpoint: "fcm.googleapis.com/algo" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/URL/i);
  });

  // Sin ellas el mensaje no se puede cifrar: se guardaría una fila que solo
  // sirve para fallar el día que haya que avisar de algo.
  it.each(["p256dh", "auth"] as const)("rechaza la que no trae %s", (campo) => {
    const r = validarSuscripcion(sus({ [campo]: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/claves/i);
  });
});

describe("alta de dispositivo", () => {
  it("guarda la suscripción del usuario con sesión", async () => {
    const r = await registrarDispositivoCon(sb, sus());
    expect(r.ok).toBe(true);

    const { rows } = await pg.query(
      `SELECT usuario_id, p256dh, dispositivo FROM suscripciones_push WHERE endpoint = $1`,
      [ENDPOINT]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].usuario_id).toBe(idUsuario);
    expect(rows[0].dispositivo).toBe("Navegador de prueba");
  });

  // Lo que evita notificar para siempre a suscripciones muertas: el navegador
  // renueva la del mismo dispositivo y aquí se actualiza, no se acumula.
  it("actualiza en vez de duplicar cuando vuelve el mismo endpoint", async () => {
    const r = await registrarDispositivoCon(
      sb,
      sus({ p256dh: "clave-renovada", dispositivo: "Mismo navegador, otra sesión" })
    );
    expect(r.ok).toBe(true);

    const { rows } = await pg.query(
      `SELECT p256dh, dispositivo FROM suscripciones_push WHERE endpoint = $1`,
      [ENDPOINT]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("clave-renovada");
    expect(rows[0].dispositivo).toBe("Mismo navegador, otra sesión");
  });

  it("no guarda nada sin sesión", async () => {
    const r = await registrarDispositivoCon(sinSesion, sus({ endpoint: `${ENDPOINT}-2` }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sesión/i);

    const { rows } = await pg.query(
      `SELECT 1 FROM suscripciones_push WHERE endpoint = $1`,
      [`${ENDPOINT}-2`]
    );
    expect(rows).toHaveLength(0);
  });

  it("ni siquiera consulta la sesión si la suscripción no vale", async () => {
    const r = await registrarDispositivoCon(sb, sus({ auth: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/claves/i);
  });
});

describe("baja de dispositivo", () => {
  it("borra la suscripción", async () => {
    expect((await olvidarDispositivoCon(sb, ENDPOINT)).ok).toBe(true);

    const { rows } = await pg.query(
      `SELECT 1 FROM suscripciones_push WHERE endpoint = $1`,
      [ENDPOINT]
    );
    expect(rows).toHaveLength(0);
  });

  // Desactivar los avisos dos veces seguidas no es un error: la intención ya
  // está cumplida.
  it("borrar lo que no existe no falla", async () => {
    expect((await olvidarDispositivoCon(sb, `${ENDPOINT}-inexistente`)).ok).toBe(true);
  });
});
