"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { obtenerPerfil } from "./perfil";

export type Ok = { ok: true } | { ok: false; error: string };

const RUTA = "/ajustes/usuarios";

// OJO: en un módulo "use server" TODAS las exportaciones deben ser async,
// incluida esta aunque no espere nada. Es el error que tsc no ve y next build sí.
export async function validarRol(rol: string): Promise<Ok> {
  if (rol === "propietario") {
    return {
      ok: false,
      error:
        "«Propietario» no es un permiso por proyecto: es una condición de la " +
        "persona y se marca en su perfil.",
    };
  }
  if (rol !== "editor" && rol !== "lector") {
    return { ok: false, error: `El rol «${rol}» no existe. Admitidos: editor, lector.` };
  }
  return { ok: true };
}

/** Repartir accesos es cosa del propietario y de nadie más. */
async function soloPropietario() {
  const sb = await clienteServidor();
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return {
      sb,
      fallo: { ok: false as const, error: "Solo el propietario reparte permisos." },
    };
  }
  return { sb, fallo: null };
}

export async function asignarPermiso(
  usuarioId: string,
  proyectoId: string,
  rol: string
): Promise<Ok> {
  const valido = await validarRol(rol);
  if (!valido.ok) return valido;

  const { sb, fallo } = await soloPropietario();
  if (fallo) return fallo;

  // upsert sobre (usuario_id, proyecto_id): cambiar de rol es reasignar, no
  // acumular. La restricción única del esquema es lo que lo garantiza.
  const { error } = await sb
    .from("permisos")
    .upsert(
      { usuario_id: usuarioId, proyecto_id: proyectoId, rol },
      { onConflict: "usuario_id,proyecto_id" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}

export async function retirarPermiso(usuarioId: string, proyectoId: string): Promise<Ok> {
  const { sb, fallo } = await soloPropietario();
  if (fallo) return fallo;

  const { error } = await sb
    .from("permisos")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("proyecto_id", proyectoId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}
