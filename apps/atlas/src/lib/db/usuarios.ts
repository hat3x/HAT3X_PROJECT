//
// Consultas de personas y permisos. Sin "use server", igual que clientes.ts:
// las mutaciones viven en acciones-usuarios.ts.
//
import { obtenerPerfil } from "./perfil";
import type { Sb } from "./clientes";

export type Rol = "editor" | "lector";
export type Ok = { ok: true } | { ok: false; error: string };

export type UsuarioConPermisos = {
  id: string;
  nombre: string | null;
  esPropietario: boolean;
  permisos: { proyectoId: string; proyectoNombre: string; rol: Rol }[];
};

/**
 * Solo lee `perfiles`. El correo y lo demás viven en `auth.users`, que no se
 * toca: para repartir permisos basta con saber quién es cada cual.
 */
export async function listarUsuarios(sb: Sb): Promise<UsuarioConPermisos[]> {
  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, es_propietario, permisos(proyecto_id, rol, proyectos(nombre))")
    .order("nombre");
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    esPropietario: p.es_propietario,
    permisos: (p.permisos ?? []).map((q) => ({
      proyectoId: q.proyecto_id,
      proyectoNombre: q.proyectos?.nombre ?? "—",
      rol: q.rol as Rol,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Escritura. Recibe `sb` y hace todo el trabajo; `acciones-usuarios.ts` solo
// resuelve el cliente de servidor y revalida.
// ---------------------------------------------------------------------------

export function validarRol(rol: string): Ok {
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
async function soloPropietario(sb: Sb): Promise<Ok> {
  const perfil = await obtenerPerfil(sb);
  return perfil?.esPropietario
    ? { ok: true }
    : { ok: false, error: "Solo el propietario reparte permisos." };
}

export async function escribirPermiso(
  sb: Sb,
  usuarioId: string,
  proyectoId: string,
  rol: string
): Promise<Ok> {
  const valido = validarRol(rol);
  if (!valido.ok) return valido;
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;

  // upsert sobre (usuario_id, proyecto_id): cambiar de rol es reasignar, no
  // acumular. La restricción única del esquema es lo que lo garantiza.
  const { error } = await sb
    .from("permisos")
    .upsert(
      { usuario_id: usuarioId, proyecto_id: proyectoId, rol },
      { onConflict: "usuario_id,proyecto_id" }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function quitarPermiso(
  sb: Sb,
  usuarioId: string,
  proyectoId: string
): Promise<Ok> {
  const permiso = await soloPropietario(sb);
  if (!permiso.ok) return permiso;

  const { error } = await sb
    .from("permisos")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("proyecto_id", proyectoId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
