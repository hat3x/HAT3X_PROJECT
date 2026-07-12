import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Cliente Supabase con la SERVICE ROLE KEY. Omite RLS por completo.
 *
 * USO EXCLUSIVO DE SERVIDOR y SOLO para la reserva pública (visitante anónimo):
 * el Route Handler valida el salón por slug y comprueba que servicio/profesional
 * pertenecen a él antes de escribir, de modo que la RLS puede seguir siendo
 * estricta (solo `authenticated`) sin abrir políticas a `anon`.
 *
 * Depende de SUPABASE_SERVICE_ROLE_KEY, una variable de entorno SIN el prefijo
 * NEXT_PUBLIC_: solo existe en el servidor. Si este módulo se importara desde
 * un componente cliente, la clave sería `undefined` y `createAdminClient`
 * lanzaría. NUNCA exponer esa clave al navegador.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para el cliente admin.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
