//
// Consultas de personas y permisos. Sin "use server", igual que clientes.ts:
// las mutaciones viven en acciones-usuarios.ts.
//
import type { Sb } from "./clientes";

export type Rol = "editor" | "lector";

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
