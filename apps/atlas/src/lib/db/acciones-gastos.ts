"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirGasto, borrarGasto, type EntradaGasto } from "./gastos";
import type { Ok } from "./proyectos";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol y escribir es cosa de
// `gastos.ts`, que sí se puede probar contra la base porque recibe `sb`.
//
// El reparto no es estético: un módulo "use server" expone TODAS sus funciones
// exportadas como endpoints invocables desde el navegador.
//

export async function guardarGasto(entrada: EntradaGasto): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirGasto(sb, entrada);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  return { ok: true };
}

export async function eliminarGasto(id: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await borrarGasto(sb, id);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  return { ok: true };
}
