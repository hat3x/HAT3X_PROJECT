"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import {
  registrarFacturaExterna,
  marcarCobrada,
  type EntradaFactura,
} from "./facturas";
import type { Ok } from "./proyectos";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol y escribir es cosa de
// `facturas.ts`, que sí se puede probar contra la base porque recibe `sb`.
//
// El reparto no es estético: un módulo "use server" expone TODAS sus funciones
// exportadas como endpoints invocables desde el navegador.
//

export async function guardarFacturaExterna(entrada: EntradaFactura): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await registrarFacturaExterna(sb, entrada);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  revalidatePath("/clientes");
  return { ok: true };
}

export async function cambiarCobro(id: string, fecha: string | null): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await marcarCobrada(sb, id, fecha);
  if (!r.ok) return r;

  revalidatePath("/dinero");
  return { ok: true };
}
