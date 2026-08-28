"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { escribirPermiso, quitarPermiso, type Ok } from "./usuarios";

//
// Envoltorios del límite HTTP. Solo resuelven el cliente de servidor y
// revalidan la caché; validar, comprobar el rol y escribir es cosa de
// `usuarios.ts`, que sí se puede probar contra la base porque recibe `sb`.
//

const RUTA = "/ajustes/usuarios";

export async function asignarPermiso(
  usuarioId: string,
  proyectoId: string,
  rol: string
): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await escribirPermiso(sb, usuarioId, proyectoId, rol);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return { ok: true };
}

export async function retirarPermiso(usuarioId: string, proyectoId: string): Promise<Ok> {
  const sb = await clienteServidor();
  const r = await quitarPermiso(sb, usuarioId, proyectoId);
  if (!r.ok) return r;

  revalidatePath(RUTA);
  return { ok: true };
}
