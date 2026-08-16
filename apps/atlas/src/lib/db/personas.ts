import type { Persona } from "@/lib/alertas/destinatarios";
import type { Sb } from "./clientes";

/**
 * Carga lo justo para decidir a quién avisar. Solo lee `perfiles` y `permisos`:
 * `auth.users` no se toca, así que ningún correo sale por aquí.
 *
 * `usuarios.ts` hace una consulta parecida, pero trae además el nombre de cada
 * proyecto, que la pantalla de ajustes necesita y aquí sobraría.
 */
export async function cargarPersonas(sb: Sb): Promise<Persona[]> {
  const { data, error } = await sb
    .from("perfiles")
    .select("id, es_propietario, permisos(proyecto_id)");
  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    esPropietario: p.es_propietario,
    proyectos: (p.permisos ?? []).map((q) => q.proyecto_id),
  }));
}
