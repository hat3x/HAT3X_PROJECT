"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";
import { PALETAS } from "@/lib/tema/tokens";

export type Ok = { ok: true } | { ok: false; error: string };

const TEMAS = ["claro", "oscuro"] as const;

// OJO: en un módulo "use server" TODAS las exportaciones deben ser async,
// incluida esta aunque no espere nada. Es el error que tsc no ve y next build sí.
export async function validarApariencia(tema: string, paleta: string): Promise<Ok> {
  if (!(TEMAS as readonly string[]).includes(tema)) {
    return { ok: false, error: `El tema «${tema}» no existe.` };
  }
  if (!(PALETAS as readonly string[]).includes(paleta)) {
    return { ok: false, error: `La paleta «${paleta}» no existe.` };
  }
  return { ok: true };
}

export async function guardarApariencia(tema: string, paleta: string): Promise<Ok> {
  // Se valida aquí y no se confía en el selector: una acción de servidor es un
  // endpoint público, y lo que llega por la red no lo elige la interfaz.
  const valido = await validarApariencia(tema, paleta);
  if (!valido.ok) return valido;

  const sb = await clienteServidor();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "No hay sesión." };

  // Cada cual manda sobre su propio aspecto: la política `perfiles_propio` lo
  // permite sin ser propietario. El `.eq` es defensa en profundidad, no la
  // barrera; la barrera es RLS.
  const { error } = await sb
    .from("perfiles")
    .update({ tema, paleta })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  // El tema lo pinta el layout raíz, así que hay que revalidarlo entero: si solo
  // se revalidase esta página, el resto de Atlas seguiría con el color viejo.
  revalidatePath("/", "layout");
  return { ok: true };
}
