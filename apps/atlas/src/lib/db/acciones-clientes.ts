"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirCliente, type EntradaCliente, type Resultado } from "./clientes";

//
// Envoltorio del límite HTTP. Solo resuelve el cliente de servidor y revalida
// la caché; validar, comprobar el rol y escribir es cosa de `clientes.ts`, que
// sí se puede probar contra la base porque recibe `sb`.
//

export async function guardarCliente(
  entrada: EntradaCliente,
  id?: string
): Promise<Resultado> {
  const sb = await clienteServidor();
  const r = await escribirCliente(sb, entrada, id);
  if (!r.ok) return r;

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${entrada.slug}`);
  return r;
}
