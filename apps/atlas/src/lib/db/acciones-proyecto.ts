"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  escribirContrato,
  escribirServicio,
  type EntradaContrato,
  type EntradaServicio,
  type Ok,
} from "./proyectos";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol y escribir es cosa de
// `proyectos.ts`, que sí se puede probar contra la base porque recibe `sb`.
//

export async function guardarContrato(entrada: EntradaContrato): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirContrato(sb, entrada);
  if (!r.ok) return r;

  revalidatePath("/clientes");
  revalidatePath("/proyectos");
  return { ok: true };
}

export async function guardarServicio(
  entrada: EntradaServicio,
  slugProyecto: string
): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirServicio(sb, entrada);
  if (!r.ok) return r;

  revalidatePath(`/proyectos/${slugProyecto}`);
  return { ok: true };
}
