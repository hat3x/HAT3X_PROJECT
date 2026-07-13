// ============================================================================
// TPV · Stub local de '@supabase/supabase-js' para los tests offline
// ----------------------------------------------------------------------------
// Los módulos de dominio del servidor (`functions/_shared/*.ts`) importan el
// paquete real de Supabase sólo para el TIPO `SupabaseClient` y para
// `createClient` (que NO se invoca en la ruta de dominio, sólo en
// `clienteUsuario`). Para poder ejercitar ese código en `deno test` sin red ni
// una base de datos real, el import map de tests (`import_map.test.json`)
// redirige el especificador '@supabase/supabase-js' a este archivo.
//
// Así los tests de integración/e2e:
//   · No descargan npm (rápidos y herméticos en CI sin red).
//   · Reciben nuestro `FakeSupabase` (ver fakeSupabase.ts) allí donde el código
//     espera un `SupabaseClient` — tipado como `any` para no acoplar los tests a
//     la firma genérica real de PostgREST.
// ============================================================================

/** Cliente Supabase: en tests es `any` para aceptar el doble en memoria. */
// deno-lint-ignore no-explicit-any
export type SupabaseClient = any;

/** Forma mínima del error de PostgREST que consume `mapearErrorPg`. */
export interface PostgrestError {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

/**
 * `createClient` real no debe ejecutarse en tests de dominio (se inyecta el
 * `FakeSupabase`). Si alguna prueba lo llama por error, falla ruidosamente.
 */
export function createClient(): never {
  throw new Error(
    'stub de tests: createClient() no está disponible; inyecta un FakeSupabase',
  );
}
