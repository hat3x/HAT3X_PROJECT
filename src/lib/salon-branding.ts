// Puente entre la resolución pura (salon.ts) y Supabase: llama a la RPC PÚBLICA
// public.get_salon_branding(p_slug) y devuelve la marca ya normalizada (o null si el
// slug no existe / el salón está inactivo). Se mantiene aparte de salon.ts para que la
// parte pura se pueda testear sin mockear la red; aquí solo va la llamada de I/O.
import { supabase } from '@/integrations/supabase/client';
import { mapBrandingRow, type SalonBranding } from '@/lib/salon';

/**
 * Obtiene la marca del salón por slug vía la RPC pública (segura para anon: solo
 * devuelve campos de marca, nunca datos fiscales/PII de `salons`).
 *
 * Contrato:
 *   · Devuelve `SalonBranding` si el salón existe y está activo.
 *   · Devuelve `null` si la RPC responde con conjunto VACÍO (slug inexistente o salón
 *     inactivo) — no es un error, es el disparador de la pantalla "salón no disponible".
 *   · LANZA si la RPC devuelve un error de transporte/SQL, para que el SalonProvider lo
 *     distinga (estado "error de red", reintentable) del "no encontrado".
 */
export async function fetchSalonBranding(slug: string): Promise<SalonBranding | null> {
  const { data, error } = await supabase.rpc('get_salon_branding', { p_slug: slug });
  if (error) throw error;
  return mapBrandingRow(data);
}
