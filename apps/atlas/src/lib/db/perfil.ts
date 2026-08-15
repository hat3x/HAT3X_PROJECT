import type { Sb } from "./clientes";
import type { Tema, Paleta } from "@/lib/tema/tokens";

export type Perfil = {
  id: string;
  nombre: string | null;
  esPropietario: boolean;
  tema: Tema;
  paleta: Paleta;
};

/**
 * Devuelve el perfil de quien tiene la sesión, o null si no hay ninguna.
 * Es la única fuente del gating de rol: se resuelve SIEMPRE en servidor y viaja
 * como prop, porque un componente cliente no puede decidir si eres propietario.
 */
export async function obtenerPerfil(sb: Sb): Promise<Perfil | null> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("perfiles")
    .select("id, nombre, es_propietario, tema, paleta")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    esPropietario: data.es_propietario,
    tema: data.tema as Tema,
    paleta: data.paleta as Paleta,
  };
}
