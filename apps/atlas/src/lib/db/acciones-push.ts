"use server";

import { revalidatePath } from "next/cache";
import { clienteServidor } from "@/lib/supabase/servidor";

export type Ok = { ok: true } | { ok: false; error: string };

const RUTA = "/ajustes/notificaciones";

export async function registrarDispositivo(sus: {
  endpoint: string;
  p256dh: string;
  auth: string;
  dispositivo: string | null;
}): Promise<Ok> {
  const sb = await clienteServidor();
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
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}

export async function olvidarDispositivo(endpoint: string): Promise<Ok> {
  const sb = await clienteServidor();
  // La política `push_propias` (for all to authenticated) ya limita el borrado
  // a las suscripciones propias; el endpoint además es único en toda la tabla.
  const { error } = await sb.from("suscripciones_push").delete().eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };

  revalidatePath(RUTA);
  return { ok: true };
}
