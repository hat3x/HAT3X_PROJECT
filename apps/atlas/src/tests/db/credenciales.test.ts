import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { cifrar, descifrar, enmascarar } from "@/lib/cripto/cifrado";
import {
  aBytea,
  deBytea,
  listarCredenciales,
  usarCredencial,
} from "@/lib/db/credenciales";
import type { Database } from "@/types/supabase";

const URL_API = "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const URL_PG = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// 32 bytes exactos. Clave de pruebas: no abre nada real.
const CLAVE = Buffer.from("clave-de-32-bytes-para-pruebas!!").toString("base64");

let pg: Client;
let sb: ReturnType<typeof createClient<Database>>;
let admin: ReturnType<typeof createClient<Database>>;
let idUsuario = "";

/** Da de alta una credencial por la MISMA vía que la aplicación: PostgREST. */
async function alta(proveedor: string, etiqueta: string, secreto: string) {
  const s = await cifrar(secreto, CLAVE);
  const { data, error } = await sb
    .from("credenciales")
    .insert({
      proveedor,
      etiqueta,
      secreto_cifrado: aBytea(s.cifrado),
      iv: aBytea(s.iv),
      tag: aBytea(s.tag),
      prefijo: enmascarar(secreto),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  process.env.ATLAS_MASTER_KEY = CLAVE;

  pg = new Client({ connectionString: URL_PG });
  await pg.connect();

  admin = createClient<Database>(URL_API, SERVICE, { auth: { persistSession: false } });
  const creado = await admin.auth.admin.createUser({
    email: "llavero@atlas.test",
    password: "contrasena-de-prueba",
    email_confirm: true,
  });
  if (creado.error) throw creado.error;
  idUsuario = creado.data.user.id;
  // El llavero es solo del propietario: sin esto, RLS devolvería lista vacía.
  await pg.query(`INSERT INTO perfiles (id, es_propietario) VALUES ($1, true)`, [
    idUsuario,
  ]);

  sb = createClient<Database>(URL_API, ANON, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "llavero" },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "llavero@atlas.test",
    password: "contrasena-de-prueba",
  });
  if (error) throw error;
});

afterAll(async () => {
  await pg.query(`DELETE FROM credenciales WHERE etiqueta LIKE 'PRUEBA %'`);
  if (idUsuario) await admin.auth.admin.deleteUser(idUsuario);
  await pg.end();
});

describe("bytea de ida y vuelta", () => {
  it("convierte a hexadecimal y recupera los mismos bytes", () => {
    const bytes = new Uint8Array(new ArrayBuffer(4));
    bytes.set([0x00, 0x7f, 0x80, 0xff]);
    expect(aBytea(bytes)).toBe("\\x007f80ff");
    expect([...deBytea("\\x007f80ff")]).toEqual([0x00, 0x7f, 0x80, 0xff]);
  });

  it("sobrevive a un ciclo completo con bytes aleatorios", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(64)));
    expect([...deBytea(aBytea(bytes))]).toEqual([...bytes]);
  });
});

describe("ciclo de vida de una credencial", () => {
  it("guarda cifrado y recupera el original a través de PostgREST", async () => {
    const secreto = "sk_live_abc123def456";
    const id = await alta("retell", "PRUEBA A", secreto);

    const { data, error } = await sb
      .from("credenciales")
      .select("secreto_cifrado, iv, tag, prefijo")
      .eq("id", id)
      .single();
    if (error) throw error;

    // Lo guardado no se parece al secreto por ningún lado.
    expect(data.secreto_cifrado).not.toContain("sk_live");
    expect(data.prefijo).toBe("sk_live_••••f456");

    expect(
      await descifrar(
        {
          cifrado: deBytea(data.secreto_cifrado),
          iv: deBytea(data.iv),
          tag: deBytea(data.tag),
        },
        CLAVE
      )
    ).toBe(secreto);
  });

  it("rotar sustituye el secreto y deja constancia de cuándo", async () => {
    const id = await alta("n8n", "PRUEBA B", "sk_live_0000aaaa");
    const antes = await sb.from("credenciales").select("rotada_en").eq("id", id).single();
    expect(antes.data?.rotada_en).toBeNull();

    const nuevo = await cifrar("sk_live_1111bbbb", CLAVE);
    const { error } = await sb
      .from("credenciales")
      .update({
        secreto_cifrado: aBytea(nuevo.cifrado),
        iv: aBytea(nuevo.iv),
        tag: aBytea(nuevo.tag),
        prefijo: enmascarar("sk_live_1111bbbb"),
        rotada_en: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;

    const { data } = await sb
      .from("credenciales")
      .select("secreto_cifrado, iv, tag, prefijo, rotada_en")
      .eq("id", id)
      .single();
    expect(data!.rotada_en).not.toBeNull();
    expect(data!.prefijo).toBe("sk_live_••••bbbb");
    expect(
      await descifrar(
        {
          cifrado: deBytea(data!.secreto_cifrado),
          iv: deBytea(data!.iv),
          tag: deBytea(data!.tag),
        },
        CLAVE
      )
    ).toBe("sk_live_1111bbbb");
  });

  it("usarCredencial descifra y deja rastro del uso", async () => {
    const id = await alta("twilio", "PRUEBA C", "sk_live_2222cccc");

    expect(await usarCredencial(sb, id, "check http")).toBe("sk_live_2222cccc");

    const { data } = await sb
      .from("credencial_usos")
      .select("contexto")
      .eq("credencial_id", id);
    expect((data ?? []).map((u) => u.contexto)).toEqual(["check http"]);
  });

  it("borrar la credencial arrastra su historial de usos", async () => {
    const id = await alta("vercel", "PRUEBA D", "sk_live_3333dddd");
    await usarCredencial(sb, id, "prueba de borrado");
    await pg.query(`DELETE FROM credenciales WHERE id=$1`, [id]);

    const { rows } = await pg.query(
      `SELECT count(*)::int AS n FROM credencial_usos WHERE credencial_id=$1`,
      [id]
    );
    expect(rows[0].n).toBe(0);
  });
});

describe("lo que el listado deja ver", () => {
  it("nunca trae el secreto, solo el prefijo enmascarado", async () => {
    await alta("retell", "PRUEBA E", "sk_live_4444eeee");
    const lista = await listarCredenciales(sb);
    const mia = lista.find((c) => c.etiqueta === "PRUEBA E");

    expect(mia).toBeDefined();
    expect(mia!.prefijo).toBe("sk_live_••••eeee");
    // La comprobación que de verdad importa: ni rastro del secreto ni de las
    // columnas cifradas en lo que sale de aquí hacia la pantalla.
    const serializado = JSON.stringify(mia);
    expect(serializado).not.toContain("4444eeee");
    expect(serializado).not.toContain("secreto_cifrado");
    expect(Object.keys(mia!).sort()).toEqual([
      "creadoEn",
      "etiqueta",
      "id",
      "prefijo",
      "proveedor",
      "proyectoId",
      "rotadaEn",
    ]);
  });
});
