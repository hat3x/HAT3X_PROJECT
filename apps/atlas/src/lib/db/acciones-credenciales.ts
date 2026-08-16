"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";
import { aBytea, claveMaestra } from "./credenciales";
import { cifrar, enmascarar } from "@/lib/cripto/cifrado";

export type Ok = { ok: true } | { ok: false; error: string };

export type EntradaCredencial = {
  proveedor: string;
  etiqueta: string;
  secreto: string;
  proyectoId: string | null;
};

const RUTA = "/ajustes/credenciales";

// OJO: en un módulo "use server" TODAS las exportaciones deben ser async,
// incluida esta aunque no espere nada. Es el error que tsc no ve y next build sí.
export async function validarCredencial(entrada: EntradaCredencial): Promise<Ok> {
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
async function soloPropietario() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return {
      sb,
      fallo: { ok: false as const, error: "Solo el propietario gestiona el llavero." },
    };
  }
  return { sb, fallo: null };
}

export async function guardarCredencial(entrada: EntradaCredencial): Promise<Ok> {
  const valido = await validarCredencial(entrada);
  if (!valido.ok) return valido;

  const { sb, fallo } = await soloPropietario();
  if (fallo) return fallo;

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
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}

export async function rotarCredencial(id: string, secretoNuevo: string): Promise<Ok> {
  if (secretoNuevo.trim().length < 8) {
    return { ok: false, error: "El secreto parece demasiado corto. Revísalo." };
  }
  const { sb, fallo } = await soloPropietario();
  if (fallo) return fallo;

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
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}

export async function borrarCredencial(id: string): Promise<Ok> {
  const { sb, fallo } = await soloPropietario();
  if (fallo) return fallo;

  // El historial de usos se va detrás por el ON DELETE CASCADE del esquema.
  const { error } = await sb.from("credenciales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}
