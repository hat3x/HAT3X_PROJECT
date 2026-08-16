//
// Consultas del llavero. Este módulo NO lleva "use server" a propósito: si lo
// llevara, `usarCredencial` —la función que descifra— quedaría expuesta como
// acción invocable desde el navegador. Las mutaciones viven en
// `acciones-credenciales.ts`, igual que clientes.ts frente a acciones-clientes.ts.
//
import { descifrar } from "@/lib/cripto/cifrado";
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
