//
// Cuánto se ha trabajado, por quién y para quién. Pura: el instante entra
// por parámetro y no hay base ni red.
//
import { AVISO_HORAS, TOPE_HORAS } from "./abiertos";

export type Tramo = {
  id: string;
  usuarioId: string;
  usuarioNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  /** ISO con zona. */
  inicio: string;
  /** ISO con zona, o null si sigue en curso. */
  fin: string | null;
  origen: "atlas" | "anadido";
  nota: string | null;
};

export type FilaHoras = { id: string | null; nombre: string; minutos: number };

export type ResumenHoras = {
  totalMin: number;
  medidosMin: number;
  anadidosMin: number;
  porCliente: FilaHoras[];
  porProyecto: FilaHoras[];
  porPersona: FilaHoras[];
  /** El inicio más reciente de cualquier tramo, o null si no hay ninguno. */
  ultimoInicio: string | null;
  /** Abiertos desde hace más de AVISO_HORAS: casi seguro olvidos. */
  sospechosos: Tramo[];
};

const SIN_ASIGNAR = "Sin asignar";
/**
 * Hay id pero no nombre: la fila existe y RLS la esconde (un colaborador sin
 * permiso sobre el proyecto). No es «Sin asignar» —está asignado— y decirlo
 * así engañaría: el rótulo dice la verdad, que no se puede ver.
 */
const SIN_PERMISO = "Sin permiso";

/** Minutos de un tramo, con el tope aplicado. Un abierto cuenta hasta `ahora`. */
export function minutosDe(t: Tramo, ahoraMs: number): number {
  const finMs = t.fin === null ? ahoraMs : Date.parse(t.fin);
  const ms = Math.max(0, finMs - Date.parse(t.inicio));
  return Math.min(Math.round(ms / 60_000), TOPE_HORAS * 60);
}

function agrupar(
  tramos: Tramo[],
  ahoraMs: number,
  clave: (t: Tramo) => string | null,
  nombre: (t: Tramo) => string | null,
  rotuloConIdSinNombre: string = SIN_PERMISO
): FilaHoras[] {
  const filas = new Map<string | null, FilaHoras>();
  for (const t of tramos) {
    const id = clave(t);
    // Con id y sin nombre, el rótulo depende del eje («Sin permiso» para
    // cliente y proyecto, «Sin nombre» para persona); sin id, «Sin asignar».
    const nombreUsado = nombre(t) ?? (id ? rotuloConIdSinNombre : SIN_ASIGNAR);
    const fila = filas.get(id) ?? { id, nombre: nombreUsado, minutos: 0 };
    fila.minutos += minutosDe(t, ahoraMs);
    filas.set(id, fila);
  }
  // De más a menos: lo que más pesa, arriba. Los desgloses se leen de arriba abajo.
  return [...filas.values()].sort((a, b) => b.minutos - a.minutos);
}

export function resumir(tramos: Tramo[], ahoraMs: number): ResumenHoras {
  let medidos = 0;
  let anadidos = 0;
  let ultimo: string | null = null;
  const sospechosos: Tramo[] = [];
  for (const t of tramos) {
    const m = minutosDe(t, ahoraMs);
    if (t.origen === "atlas") medidos += m;
    else anadidos += m;
    if (ultimo === null || Date.parse(t.inicio) > Date.parse(ultimo)) ultimo = t.inicio;
    if (t.fin === null && ahoraMs - Date.parse(t.inicio) >= AVISO_HORAS * 3_600_000) {
      sospechosos.push(t);
    }
  }
  return {
    totalMin: medidos + anadidos,
    medidosMin: medidos,
    anadidosMin: anadidos,
    // Los tres agrupan los MISMOS tramos: si no suman igual, hay uno perdido.
    porCliente: agrupar(tramos, ahoraMs, (t) => t.clienteId, (t) => t.clienteNombre, SIN_PERMISO),
    porProyecto: agrupar(tramos, ahoraMs, (t) => t.proyectoId, (t) => t.proyectoNombre, SIN_PERMISO),
    porPersona: agrupar(tramos, ahoraMs, (t) => t.usuarioId, (t) => t.usuarioNombre, "Sin nombre"),
    ultimoInicio: ultimo,
    sospechosos,
  };
}

export function formatearMinutos(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
