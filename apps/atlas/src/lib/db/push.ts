import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

//
// Alta y baja de dispositivos para los avisos push.
//
// Sin `"use server"` a propósito: recibe `sb` y por eso se puede probar contra
// la base de verdad. El envoltorio del límite HTTP es `acciones-push.ts`.
//

export type Ok = { ok: true } | { ok: false; error: string };

export type Suscripcion = {
  endpoint: string;
  p256dh: string;
  auth: string;
  dispositivo: string | null;
};

type Sb = SupabaseClient<Database>;

/** Rechaza lo que no sirve antes de tocar la base. */
export function validarSuscripcion(sus: Suscripcion): Ok {
  // Sin endpoint no hay a dónde enviar, y las otras dos son con las que el
  // navegador descifra el mensaje: guardar una suscripción incompleta es
  // guardarse un fallo para más tarde, cuando haga falta avisar de algo.
  if (!sus.endpoint.trim()) return { ok: false, error: "Falta el endpoint." };
  if (!/^https?:\/\//.test(sus.endpoint)) {
    return { ok: false, error: "El endpoint no es una URL." };
  }
  if (!sus.p256dh.trim() || !sus.auth.trim()) {
    return { ok: false, error: "Faltan las claves de la suscripción." };
  }
  return { ok: true };
}

export async function registrarDispositivoCon(sb: Sb, sus: Suscripcion): Promise<Ok> {
  const valida = validarSuscripcion(sus);
  if (!valida.ok) return valida;

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "No hay sesión." };

  // `endpoint` es único: si el navegador renueva la suscripción del mismo
  // dispositivo, se actualiza en vez de acumular filas muertas a las que luego
  // se intentaría notificar para siempre.
  const { error } = await sb.from("suscripciones_push").upsert(
    {
      usuario_id: user.id,
      endpoint: sus.endpoint,
      p256dh: sus.p256dh,
      auth: sus.auth,
      dispositivo: sus.dispositivo,
    },
    { onConflict: "endpoint" }
  );

  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function olvidarDispositivoCon(sb: Sb, endpoint: string): Promise<Ok> {
  // La política `push_propias` (for all to authenticated) ya limita el borrado a
  // las suscripciones propias; el endpoint además es único en toda la tabla.
  const { error } = await sb
    .from("suscripciones_push")
    .delete()
    .eq("endpoint", endpoint);

  return error ? { ok: false, error: error.message } : { ok: true };
}
