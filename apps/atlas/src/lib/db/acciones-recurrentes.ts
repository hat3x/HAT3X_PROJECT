"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  escribirRecurrente,
  cambiarActivo,
  type EntradaRecurrente,
} from "./recurrentes";
import type { Ok } from "./proyectos";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol y escribir es cosa de
// `recurrentes.ts`, que sí se puede probar contra la base porque recibe `sb`.
//
// El reparto no es estético: un módulo "use server" expone TODAS sus funciones
// exportadas como endpoints invocables desde el navegador.
//

export async function guardarRecurrente(entrada: EntradaRecurrente): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirRecurrente(sb, entrada);
  if (!r.ok) return r;

  revalidatePath("/dinero/gastos");
  return { ok: true };
}

export async function cambiarActivoRecurrente(
  id: string,
  activo: boolean
): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await cambiarActivo(sb, id, activo);
  if (!r.ok) return r;

  revalidatePath("/dinero/gastos");
  return { ok: true };
}
