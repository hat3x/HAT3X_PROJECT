//
// Consultas del llavero. Este módulo NO lleva "use server" a propósito: si lo
// llevara, `usarCredencial` —la función que descifra— quedaría expuesta como
// acción invocable desde el navegador. Las mutaciones viven en
// `acciones-credenciales.ts`, igual que clientes.ts frente a acciones-clientes.ts.
//
import { cifrar, descifrar, enmascarar } from "@/lib/cripto/cifrado";
import { obtenerPerfil } from "./perfil";
import type { Sb } from "./clientes";

export type CredencialResumen = {
  id: string;
  proveedor: string;
  etiqueta: string;
  prefijo: string | null;
  proyectoId: string | null;
  creadoEn: string; // ISO 8601
  rotadaEn: string | null; // ISO 8601
};

/**
 * PostgREST habla con `bytea` en hexadecimal (`\x48656c6c6f`), no en binario.
 * Mandarle un `Uint8Array` tal cual lo serializaría como `{"0":72,"1":101,…}` y
 * Postgres lo rechazaría. Estas dos funciones son ese puente.
 */
export function aBytea(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

export function deBytea(texto: string): Uint8Array<ArrayBuffer> {
  const hex = texto.startsWith("\\x") ? texto.slice(2) : texto;
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function claveMaestra(): string {
  const clave = process.env.ATLAS_MASTER_KEY;
  if (!clave) {
    throw new Error(
      "Falta ATLAS_MASTER_KEY. Sin ella el llavero no se puede abrir ni cerrar."
    );
  }
  return clave;
}

/**
 * Nunca devuelve secretos: solo el prefijo enmascarado. Las columnas cifradas ni
 * siquiera se seleccionan, así que no pueden colarse por descuido en una prop.
 */
export async function listarCredenciales(sb: Sb): Promise<CredencialResumen[]> {
  const { data, error } = await sb
    .from("credenciales")
    .select("id, proveedor, etiqueta, prefijo, proyecto_id, creado_en, rotada_en")
    .order("proveedor");
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    proveedor: c.proveedor,
    etiqueta: c.etiqueta,
    prefijo: c.prefijo,
    proyectoId: c.proyecto_id,
    creadoEn: c.creado_en,
    rotadaEn: c.rotada_en,
  }));
}

/**
 * Descifra una credencial para usarla. **SOLO servidor.** Lo que devuelve no
 * puede acabar en una prop, en una respuesta de API ni en un log. Cada llamada
 * deja rastro en `credencial_usos`: si algún día hay que investigar una fuga, el
 * registro de qué se abrió y cuándo es lo único que queda.
 */
export async function usarCredencial(
  sb: Sb,
  id: string,
  contexto: string
): Promise<string> {
  const { data, error } = await sb
    .from("credenciales")
    .select("secreto_cifrado, iv, tag")
    .eq("id", id)
    .single();
  if (error) throw error;

  await sb.from("credencial_usos").insert({ credencial_id: id, contexto });

  return descifrar(
    {
      cifrado: deBytea(data.secreto_cifrado),
      iv: deBytea(data.iv),
      tag: deBytea(data.tag),
    },
    claveMaestra()
  );
}

// ---------------------------------------------------------------------------
// Escritura. Recibe `sb` y hace todo el trabajo, para que se pueda probar
// contra la base; `acciones-credenciales.ts` solo resuelve el cliente de
// servidor y revalida.
// ---------------------------------------------------------------------------

export type Ok = { ok: true } | { ok: false; error: string };

export type EntradaCredencial = {
  proveedor: string;
  etiqueta: string;
  secreto: string;
  proyectoId: string | null;
};

export function validarCredencial(entrada: EntradaCredencial): Ok {
  if (entrada.proveedor.trim() === "") {
    return { ok: false, error: "Di de qué proveedor es la clave." };
  }
  if (entrada.etiqueta.trim() === "") {
    return {
      ok: false,
      error: "Ponle una etiqueta: dentro de un año no recordarás cuál es cuál.",
    };
  }
  // No se valida el formato: cada proveedor tiene el suyo y una regla de más
  // acabaría rechazando una clave buena. Solo se descarta lo obviamente vacío.
  if (entrada.secreto.trim().length < 8) {
    return { ok: false, error: "El secreto parece demasiado corto. Revísalo." };
  }
  return { ok: true };
}

/** El llavero no se comparte: es del propietario y de nadie más. */
async function soloPropietario(sb: Sb): Promise<Ok> {
  const perfil = await obtenerPerfil(sb);
  return perfil?.esPropietario
    ? { ok: true }
    : { ok: false, error: "Solo el propietario gestiona el llavero." };
}

export async function escribirCredencial(
  sb: Sb,
  entrada: EntradaCredencial
): Promise<Ok> {
  const valido = validarCredencial(entrada);
  if (!valido.ok) return valido;
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;

  const s = await cifrar(entrada.secreto, claveMaestra());
  const { error } = await sb.from("credenciales").insert({
    proveedor: entrada.proveedor.trim(),
    etiqueta: entrada.etiqueta.trim(),
    proyecto_id: entrada.proyectoId,
    secreto_cifrado: aBytea(s.cifrado),
    iv: aBytea(s.iv),
    tag: aBytea(s.tag),
    // Lo único legible que queda del secreto.
    prefijo: enmascarar(entrada.secreto),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function rotarSecreto(
  sb: Sb,
  id: string,
  secretoNuevo: string
): Promise<Ok> {
  if (secretoNuevo.trim().length < 8) {
    return { ok: false, error: "El secreto parece demasiado corto. Revísalo." };
  }
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;

  const s = await cifrar(secretoNuevo, claveMaestra());
  const { error } = await sb
    .from("credenciales")
    .update({
      secreto_cifrado: aBytea(s.cifrado),
      iv: aBytea(s.iv),
      tag: aBytea(s.tag),
      prefijo: enmascarar(secretoNuevo),
      rotada_en: new Date().toISOString(),
    })
    .eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function borrarSecreto(sb: Sb, id: string): Promise<Ok> {
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;

  // El historial de usos se va detrás por el ON DELETE CASCADE del esquema.
  const { error } = await sb.from("credenciales").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
