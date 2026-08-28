import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import {
  listarDescubrimientos,
  saludDelDescubridor,
  MARGEN_MS,
} from "@/lib/db/descubrimientos";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

let pg: Client;
let admin: ReturnType<typeof createClient<Database>>;
let sbDuenyo: ReturnType<typeof createClient<Database>>;
let sbColaborador: ReturnType<typeof createClient<Database>>;
const usuarios: string[] = [];

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

async function pasada(campos: {
  ok: boolean;
  cuando: string;
  altas?: number;
  pausados?: number;
  reactivados?: number;
  error?: string;
}) {
  await pg.query(
    `INSERT INTO descubrimientos (ok, ejecutado_en, altas, pausados, reactivados, error)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      campos.ok,
      campos.cuando,
      campos.altas ?? 0,
      campos.pausados ?? 0,
      campos.reactivados ?? 0,
      campos.error ?? null,
    ]
  );
}

beforeAll(async () => {
  pg = new Client({ connectionString: URL_PG });
  await pg.connect();
  admin = createClient<Database>(URL_API, SERVICE, {
    auth: { persistSession: false },
  });
  sbDuenyo = await altaUsuario("duenyo-descubrimientos@atlas.test", true, "dd");
  sbColaborador = await altaUsuario(
    "colaborador-descubrimientos@atlas.test",
    false,
    "cd"
  );
});

beforeEach(async () => {
  await pg.query(`DELETE FROM descubrimientos`);
});

afterAll(async () => {
  await pg.query(`DELETE FROM descubrimientos`);
  for (const id of usuarios) await admin.auth.admin.deleteUser(id);
  await pg.end();
});

describe("listar descubrimientos", () => {
  it("devuelve las pasadas, la más reciente primero", async () => {
    await pasada({ ok: true, cuando: "2026-08-28T09:00:00Z", altas: 2 });
    await pasada({
      ok: false,
      cuando: "2026-08-28T10:00:00Z",
      error: "Kairos respondió 404 a atlas_list_salons.",
    });

    const filas = await listarDescubrimientos(sbDuenyo, 10);

    expect(filas).toHaveLength(2);
    expect(filas[0]!.ok).toBe(false);
    expect(filas[0]!.error).toContain("404");
    expect(filas[1]!.altas).toBe(2);
  });

  it("respeta el límite", async () => {
    for (let i = 0; i < 5; i++) {
      await pasada({ ok: true, cuando: `2026-08-28T0${i}:00:00Z` });
    }

    expect(await listarDescubrimientos(sbDuenyo, 3)).toHaveLength(3);
  });

  // Cuenta qué clientes entraron y salieron del censo: es información del
  // negocio, no de un proyecto concreto. La consulta no filtra, lo hace RLS.
  it("un colaborador no ve ninguna", async () => {
    await pasada({ ok: true, cuando: "2026-08-28T09:00:00Z" });

    expect(await listarDescubrimientos(sbColaborador, 10)).toEqual([]);
  });
});

describe("salud del descubridor", () => {
  const AHORA = Date.parse("2026-08-28T12:00:00Z");

  // Este es el estado que la tabla NO puede enseñar por sí sola: una fila que
  // falta es invisible. Es exactamente el fallo del 307 —la ruta rebotaba a
  // /login y no se escribía nada— y sin esto la pantalla se veía tan tranquila.
  it("sin ninguna pasada avisa de que no ha corrido nunca", () => {
    expect(saludDelDescubridor(null, AHORA)).toBe("nunca");
  });

  it("con una pasada reciente está al día", () => {
    expect(saludDelDescubridor("2026-08-28T11:23:00Z", AHORA)).toBe("al-dia");
  });

  // Pasa cada hora. El margen deja sitio a una pasada perdida sin gritar por
  // ella: avisar al primer retraso convertiría la pantalla en ruido.
  it("justo dentro del margen sigue al día", () => {
    const limite = new Date(AHORA - MARGEN_MS + 60_000).toISOString();
    expect(saludDelDescubridor(limite, AHORA)).toBe("al-dia");
  });

  it("pasado el margen avisa de que lleva demasiado sin correr", () => {
    const viejo = new Date(AHORA - MARGEN_MS - 60_000).toISOString();
    expect(saludDelDescubridor(viejo, AHORA)).toBe("atrasado");
  });

  // Una fecha ilegible no puede leerse como «al día»: sería el único caso en el
  // que un dato roto se pinta en verde.
  it("una fecha que no se entiende cuenta como atrasado", () => {
    expect(saludDelDescubridor("no es una fecha", AHORA)).toBe("atrasado");
  });
});
