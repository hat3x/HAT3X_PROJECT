// Capa con efectos sobre la resolución del salón: envuelve la RPC pública
// `public.get_salon_branding(p_slug)` de Salón OS y devuelve el branding ya
// mapeado (o null si el slug no existe / el salón está inactivo).
//
// La RPC es de lectura pública (anon) y RETURNS TABLE, así que `data` llega como
// array: `[]` cuando no hay salón, o `[{ id, name, slug, logo_url, primary_color,
// secondary_color }]`. Aquí tomamos la primera fila y la normalizamos con el
// mapper PURO de salon.ts (probado en aislamiento).
import { supabase } from '@/integrations/supabase/client';
import { mapSalonBrandingRow, type SalonBranding } from './salon';

/**
 * Resuelve el branding del salón por slug vía la RPC pública.
 * - Devuelve el `SalonBranding` (con `id`, del que se deriva salon_id) si existe.
 * - Devuelve `null` si la RPC no trae fila (slug inexistente o salón inactivo).
 * - Relanza el error de red/PostgREST para que el llamador (SalonProvider) pinte
 *   la pantalla de error controlada.
 */
export async function fetchSalonBranding(slug: string): Promise<SalonBranding | null> {
  const { data, error } = await supabase.rpc('get_salon_branding', { p_slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapSalonBrandingRow(row ?? null);
}
