import type { Sb } from "./clientes";

export type Severidad = "critica" | "aviso";

export type Incidencia = {
  id: string;
  proyectoNombre: string;
  proyectoSlug: string;
  servicioNombre: string;
  severidad: Severidad;
  causa: string | null;
  /** ISO 8601 */
  abiertaEn: string;
  cerradaEn: string | null;
  silenciadaHasta: string | null;
};

export type Filtros = {
  /** Slug del proyecto. */
  proyecto?: string;
  severidad?: string;
  /** Solo las que siguen sin cerrar. */
  abiertas?: boolean;
};

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/**
 * Cuánto duró, en cristiano. Es el dato que de verdad se mira de una incidencia
 * cerrada: no cuándo pasó, sino cuánto estuvo caído.
 *
 * El instante actual entra por parámetro y no se lee del reloj, igual que en el
 * resto del proyecto.
 */
export function duracionDe(
  abiertaEn: string,
  cerradaEn: string | null,
  _ahoraMs: number
): string {
  if (cerradaEn === null) return "en curso";

  const ms = Date.parse(cerradaEn) - Date.parse(abiertaEn);
  // Un parpadeo que se abre y se cierra en la misma comprobación existe, y
  // «0 min» se lee como un error. Las fechas al revés caen aquí también.
  if (!Number.isFinite(ms) || ms < MIN) return "menos de 1 min";

  if (ms >= DIA) {
    const dias = Math.floor(ms / DIA);
    const horas = Math.floor((ms % DIA) / HORA);
    // A partir de un día los minutos sobran: nadie mide una caída de tres días
    // con esa precisión.
    return horas === 0 ? `${dias} d` : `${dias} d ${horas} h`;
  }
  if (ms >= HORA) {
    const horas = Math.floor(ms / HORA);
    const minutos = Math.floor((ms % HORA) / MIN);
    return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`;
  }
  return `${Math.floor(ms / MIN)} min`;
}

/** «Hasta resolver» se guarda como infinity, que no es una fecha parseable. */
export function estaSilenciada(silenciadaHasta: string | null, ahoraMs: number): boolean {
  if (silenciadaHasta === null) return false;
  if (silenciadaHasta === "infinity") return true;
  const hasta = Date.parse(silenciadaHasta);
  return Number.isFinite(hasta) && hasta > ahoraMs;
}

/**
 * El historial. **No filtra por permisos**: de eso se encarga RLS, y hay un test
 * que lo comprueba con un lector en vez de suponerlo.
 */
export async function listarIncidencias(sb: Sb, filtros: Filtros): Promise<Incidencia[]> {
  let consulta = sb
    .from("incidencias")
    .select(
      `id, severidad, causa, abierta_en, cerrada_en, silenciada_hasta,
       servicios!inner(nombre, proyectos!inner(nombre, slug))`
    )
    .order("abierta_en", { ascending: false })
    .limit(200);

  if (filtros.severidad) consulta = consulta.eq("severidad", filtros.severidad);
  if (filtros.abiertas) consulta = consulta.is("cerrada_en", null);
  if (filtros.proyecto) {
    consulta = consulta.eq("servicios.proyectos.slug", filtros.proyecto);
  }

  const { data, error } = await consulta;
  if (error) throw error;

  return (data ?? []).map((i) => ({
    id: i.id,
    proyectoNombre: i.servicios.proyectos.nombre,
    proyectoSlug: i.servicios.proyectos.slug,
    servicioNombre: i.servicios.nombre,
    severidad: i.severidad as Severidad,
    causa: i.causa,
    abiertaEn: i.abierta_en,
    cerradaEn: i.cerrada_en,
    silenciadaHasta: i.silenciada_hasta,
  }));
}
