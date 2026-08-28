"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirVista, type OkApariencia } from "./perfil";

//
// Envoltorio del límite HTTP. Validar y escribir es cosa de `perfil.ts`.
//

export async function guardarVista(vista: string): Promise<OkApariencia> {
  const sb = await clienteServidor();
  const r = await escribirVista(sb, vista);
  if (!r.ok) return r;

  // Solo la portada: la vista no cambia el resto de la aplicación, a diferencia
  // del tema, que sí obliga a revalidar el layout entero.
  revalidatePath("/");
  return { ok: true };
}
