import type { Sb } from "./clientes";

//
// El registro del descubridor de tenants de Kairos.
//
// Solo lectura: quien escribe aquí es `/api/descubrir`, con service_role. Este
// módulo es lo que mira la pantalla.
//

export type Descubrimiento = {
  id: number;
  ejecutadoEn: string; // ISO 8601
  ok: boolean;
  altas: number;
  pausados: number;
  reactivados: number;
  error: string | null;
};

export type Salud = "nunca" | "al-dia" | "atrasado";

/**
 * Cuánto puede pasar sin una pasada antes de que sea un problema.
 *
 * El descubridor corre cada hora. Tres deja sitio a dos perdidas seguidas —un
 * despliegue, un reinicio de Supabase— sin gritar por ellas: una pantalla que
 * avisa al primer retraso se convierte en ruido, y el ruido se ignora.
 */
export const MARGEN_MS = 3 * 60 * 60 * 1000;

/**
 * Lo que la tabla no puede contar por sí sola.
 *
 * Una pasada que falla deja una fila con su motivo. Una pasada que NUNCA
 * ocurre no deja nada, y la pantalla se ve idéntica a la de un sistema en
 * calma. Fue exactamente el fallo del 307: el guardia rebotaba `/api/descubrir`
 * a `/login`, no se escribía ninguna fila, y nada lo delataba.
 *
 * Por eso el silencio se convierte aquí en un estado con nombre.
 */
export function saludDelDescubridor(
  ultimaEjecucion: string | null,
  ahoraMs: number
): Salud {
  if (ultimaEjecucion === null) return "nunca";

  const cuando = Date.parse(ultimaEjecucion);
  // Una fecha ilegible no puede leerse como «al día»: sería el único caso en el
  // que un dato roto se pinta en verde.
  if (!Number.isFinite(cuando)) return "atrasado";

  return ahoraMs - cuando <= MARGEN_MS ? "al-dia" : "atrasado";
}

/**
 * El historial. **No filtra por permisos**: de eso se encarga RLS, y hay un test
 * que lo comprueba con un colaborador en vez de suponerlo.
 */
export async function listarDescubrimientos(
  sb: Sb,
  limite: number
): Promise<Descubrimiento[]> {
  const { data, error } = await sb
    .from("descubrimientos")
    .select("id, ejecutado_en, ok, altas, pausados, reactivados, error")
    // Por `ejecutado_en` y no por `id`: la columna que se enseña es la que
    // ordena, o dos pasadas insertadas al revés saldrían desordenadas en
    // pantalla sin que nada lo explicara.
    .order("ejecutado_en", { ascending: false })
    .limit(limite);
  if (error) throw error;

  return (data ?? []).map((d) => ({
    id: d.id,
    ejecutadoEn: d.ejecutado_en,
    ok: d.ok,
    altas: d.altas,
    pausados: d.pausados,
    reactivados: d.reactivados,
    error: d.error,
  }));
}
