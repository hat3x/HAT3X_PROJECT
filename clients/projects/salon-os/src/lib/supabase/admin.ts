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
    // Lecturas SIEMPRE en vivo. En Next 14 App Router, `fetch` (que usa supabase-js
    // por debajo) entra en el Data Cache aunque la ruta sea `dynamic = "force-dynamic"`:
    // ese flag gobierna el RENDER, pero un fetch sin `cache` explícito y con URL estable
    // (p. ej. la query de `professional_schedules`, que no lleva la fecha) se cachea y
    // devuelve datos OBSOLETOS tras un cambio en BD. Este cliente alimenta disponibilidad,
    // creación y reprogramación de citas: la frescura es una invariante de corrección
    // (un horario o una cita cacheados provocan huecos falsos). Forzamos `no-store`.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
