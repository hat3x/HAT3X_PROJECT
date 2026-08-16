"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirApariencia, type OkApariencia } from "./perfil";

//
// Envoltorio del límite HTTP. Solo resuelve el cliente de servidor y revalida;
// validar y escribir es cosa de `perfil.ts`, que recibe `sb` y sí se puede
// probar contra la base.
//

export async function guardarApariencia(
  tema: string,
  paleta: string
): Promise<OkApariencia> {
  const sb = await clienteServidor();
  const r = await escribirApariencia(sb, tema, paleta);
  if (!r.ok) return r;

  // El tema lo pinta el layout raíz, así que hay que revalidarlo entero: si solo
  // se revalidase esta página, el resto de Atlas seguiría con el color viejo.
  revalidatePath("/", "layout");
  return { ok: true };
}
