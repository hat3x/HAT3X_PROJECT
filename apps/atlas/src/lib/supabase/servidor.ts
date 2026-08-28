import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export type Sb = SupabaseClient<Database>;

/**
 * Cliente para componentes y acciones de servidor. Importa `next/headers`, así
 * que NUNCA debe alcanzarse desde un componente `"use client"`.
 *
 * Usa la clave anónima, no la service_role: quien decide qué se ve es RLS.
 */
export async function clienteServidor(): Promise<Sb> {
  const almacen = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (galletas) => {
          try {
            galletas.forEach(({ name, value, options }) =>
              almacen.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component: refrescar la sesión es tarea
            // del middleware, así que aquí se ignora sin ruido.
          }
        },
      },
    }
  );
}
