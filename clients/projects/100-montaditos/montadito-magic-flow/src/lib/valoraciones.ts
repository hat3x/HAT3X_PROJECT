import { supabase } from '@/integrations/supabase/client';

const DEVICE_KEY = 'monty-device-id';
const RATED_KEY = 'monty-rating-date';

/** Fecha de hoy en Europe/Madrid (YYYY-MM-DD), independiente de la zona del móvil. */
function madridToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
}

/** Id anónimo y estable del dispositivo (solo para limitar la frecuencia de la valoración). */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev-unknown';
  }
}

/** ¿Se debe pedir valoración hoy? (1 vez al día por móvil, tras el 1er pedido del día). */
export function shouldAskRating(): boolean {
  try {
    return localStorage.getItem(RATED_KEY) !== madridToday();
  } catch {
    return false;
  }
}

/** Marca que hoy ya se le mostró/pidió la valoración a este móvil (aunque no la envíe). */
export function markRatingAsked(): void {
  try {
    localStorage.setItem(RATED_KEY, madridToday());
  } catch {
    /* ignore */
  }
}

/** Inserta la valoración. Devuelve true si se guardó. */
export async function submitValoracion(input: {
  estrellas: number;
  comentario?: string | null;
  pedidoId?: string | null;
  localId?: string | null;
}): Promise<boolean> {
  const { error } = await supabase.from('valoraciones').insert({
    estrellas: input.estrellas,
    comentario: input.comentario?.trim() || null,
    pedido_id: input.pedidoId ?? null,
    local_id: input.localId ?? null,
    device_id: getDeviceId(),
  } as any);
  if (error) {
    console.error('submitValoracion', error);
    return false;
  }
  return true;
}
