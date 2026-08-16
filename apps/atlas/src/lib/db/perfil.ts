import type { Sb } from "./clientes";
import { PALETAS, type Tema, type Paleta } from "@/lib/tema/tokens";

/** Cómo prefiere ver el Resumen esta persona. */
export type VistaResumen = "control" | "lista" | "oficina";

export const VISTAS = ["control", "lista", "oficina"] as const;

export type Perfil = {
  id: string;
  nombre: string | null;
  esPropietario: boolean;
  tema: Tema;
  paleta: Paleta;
  vista: VistaResumen;
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
    .select("id, nombre, es_propietario, tema, paleta, vista_resumen")
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
    vista: data.vista_resumen as VistaResumen,
  };
}

// ---------------------------------------------------------------------------
// Apariencia. Recibe `sb` para poder probarse contra la base; el envoltorio de
// `acciones-apariencia.ts` solo resuelve el cliente de servidor y revalida.
// ---------------------------------------------------------------------------

export type OkApariencia = { ok: true } | { ok: false; error: string };

const TEMAS = ["claro", "oscuro"] as const;

export function validarApariencia(tema: string, paleta: string): OkApariencia {
  if (!(TEMAS as readonly string[]).includes(tema)) {
    return { ok: false, error: `El tema «${tema}» no existe.` };
  }
  if (!(PALETAS as readonly string[]).includes(paleta)) {
    return { ok: false, error: `La paleta «${paleta}» no existe.` };
  }
  return { ok: true };
}

export async function escribirApariencia(
  sb: Sb,
  tema: string,
  paleta: string
): Promise<OkApariencia> {
  // Se valida aquí y no se confía en el selector: una acción de servidor es un
  // endpoint público, y lo que llega por la red no lo elige la interfaz.
  const valido = validarApariencia(tema, paleta);
  if (!valido.ok) return valido;

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "No hay sesión." };

  // Cada cual manda sobre su propio aspecto: la política `perfiles_propio` lo
  // permite sin ser propietario. El `.eq` es defensa en profundidad, no la
  // barrera; la barrera es RLS.
  const { error } = await sb.from("perfiles").update({ tema, paleta }).eq("id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export function validarVista(vista: string): OkApariencia {
  if (!(VISTAS as readonly string[]).includes(vista)) {
    return { ok: false, error: `La vista «${vista}» no existe.` };
  }
  return { ok: true };
}

/**
 * El conmutador del Resumen manda uno de tres valores, pero llega por la red y
 * ahí entra lo que sea: se valida igual que la apariencia.
 */
export async function escribirVista(sb: Sb, vista: string): Promise<OkApariencia> {
  const valido = validarVista(vista);
  if (!valido.ok) return valido;

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "No hay sesión." };

  const { error } = await sb
    .from("perfiles")
    .update({ vista_resumen: vista })
    .eq("id", user.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
