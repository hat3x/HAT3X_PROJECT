"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  escribirCredencial,
  rotarSecreto,
  borrarSecreto,
  type EntradaCredencial,
  type Ok,
} from "./credenciales";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol, cifrar y escribir es cosa de
// `credenciales.ts`, que sí se puede probar contra la base porque recibe `sb`.
//

const RUTA = "/ajustes/credenciales";

export async function guardarCredencial(entrada: EntradaCredencial): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirCredencial(sb, entrada);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return { ok: true };
}

export async function rotarCredencial(id: string, secretoNuevo: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await rotarSecreto(sb, id, secretoNuevo);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return { ok: true };
}

export async function borrarCredencial(id: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await borrarSecreto(sb, id);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return { ok: true };
}
