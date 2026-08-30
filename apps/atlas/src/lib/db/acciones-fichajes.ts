// src/lib/db/acciones-fichajes.ts
"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  empezar,
  parar,
  anadirTramo,
  borrarTramo,
  type EntradaFichaje,
  type EntradaTramo,
} from "./fichajes";
import type { Ok } from "./proyectos";

//
// Envoltorios del límite HTTP. Validar, comprobar la sesión y escribir es cosa
// de `fichajes.ts`, que sí se puede probar contra la base porque recibe `sb`.
//
// El fichaje vive en el LAYOUT, así que la revalidación es del layout entero:
// `revalidatePath("/", "layout")`. Revalidar solo una ruta dejaría el botón
// del marco enseñando el estado anterior en todas las demás.
//

export async function empezarFichaje(entrada: EntradaFichaje): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await empezar(sb, entrada);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function pararFichaje(): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await parar(sb, Date.now());
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function anadirFichaje(entrada: EntradaTramo): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await anadirTramo(sb, entrada, Date.now());
  if (!r.ok) return r;
  revalidatePath("/dinero/horas");
  return { ok: true };
}

/**
 * Borrar un tramo propio. Revalida la pantalla de horas y también el layout:
 * si el tramo borrado era el que el marco enseñaba como último, el marco lo
 * seguiría enseñando.
 */
export async function borrarFichaje(id: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await borrarTramo(sb, id);
  if (!r.ok) return r;
  revalidatePath("/dinero/horas");
  revalidatePath("/", "layout");
  return { ok: true };
}
