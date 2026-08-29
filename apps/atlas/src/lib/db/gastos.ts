import type { Sb } from "./clientes";
import { obtenerPerfil } from "./perfil";
import type { Ok } from "./proyectos";

/**
 * Las categorías de partida. Se pueden ampliar, pero no a mano en cada
 * formulario: una lista copiada en dos sitios diverge, y las sumas por
 * categoría empiezan a dejarse gastos fuera sin avisar.
 */
export const CATEGORIAS = [
  "infraestructura",
  "ia",
  "telefonia",
  "herramientas",
  "marketing",
  "gestoria",
  "otro",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export type Gasto = {
  id: string;
  /** ISO AAAA-MM-DD */
  fecha: string;
  concepto: string;
  plataformaId: string | null;
  plataformaNombre: string | null;
  base: number;
  iva: number;
  total: number;
  categoria: string;
  clienteId: string | null;
  clienteNombre: string | null;
  proyectoId: string | null;
  proyectoNombre: string | null;
  /**
   * Imputado a alguien concreto. Si es falso es coste de estructura, y NO se
   * reparte entre clientes: repartirlo inventaría una precisión que no existe.
   */
  esDirecto: boolean;
};

export type EntradaGasto = {
  fecha: string;
  concepto: string;
  plataformaId?: string | null;
  /** Céntimos enteros. Nunca euros en float. */
  baseCentimos: number;
  /** Céntimos enteros. Nunca euros en float. */
  ivaCentimos: number;
  categoria: Categoria;
  clienteId?: string | null;
  proyectoId?: string | null;
  notas?: string | null;
};

/** Céntimos → el `numeric(12,2)` que espera Postgres. */
function aEuros(centimos: number): number {
  return centimos / 100;
}

/**
 * El listado. **No filtra por permisos**: de eso se encarga RLS (solo el
 * propietario ve gastos), igual que en `facturas.ts`.
 */
export async function listarGastos(
  sb: Sb,
  filtros: { desde?: string; hasta?: string; clienteId?: string }
): Promise<Gasto[]> {
  let consulta = sb
    .from("gastos")
    .select(
      // Se traen los NOMBRES de los tres ejes, no solo sus identificadores: el
      // desglose de la pantalla agrupa por ellos, y resolverlos después
      // obligaría a una consulta por fila.
      `id, fecha, concepto, base, iva, total, categoria,
       cliente_id, proyecto_id, plataforma_id,
       clientes(nombre), proyectos(nombre), plataformas(nombre)`
    )
    .order("fecha", { ascending: false })
    .limit(500);

  if (filtros.desde) consulta = consulta.gte("fecha", filtros.desde);
  if (filtros.hasta) consulta = consulta.lte("fecha", filtros.hasta);
  if (filtros.clienteId) consulta = consulta.eq("cliente_id", filtros.clienteId);

  const { data, error } = await consulta;
  if (error) throw error;

  // PostgREST devuelve cada join como objeto o como array según la
  // cardinalidad que infiera. Se normaliza en un solo sitio en vez de repetir
  // el ternario tres veces.
  const nombreDe = (u: unknown): string | null => {
    const v = u as { nombre: string } | { nombre: string }[] | null;
    const uno = Array.isArray(v) ? (v[0] ?? null) : v;
    return uno?.nombre ?? null;
  };

  return (data ?? []).map((g) => ({
    id: g.id,
    fecha: g.fecha,
    concepto: g.concepto,
    base: Number(g.base),
    iva: Number(g.iva),
    total: Number(g.total),
    categoria: g.categoria,
    clienteId: g.cliente_id,
    clienteNombre: nombreDe(g.clientes),
    proyectoId: g.proyecto_id,
    proyectoNombre: nombreDe(g.proyectos),
    plataformaId: g.plataforma_id,
    plataformaNombre: nombreDe(g.plataformas),
    esDirecto: g.cliente_id !== null || g.proyecto_id !== null,
  }));
}

// ---------------------------------------------------------------------------
// Escritura. Recibe `sb` y hace todo el trabajo —validar, comprobar el rol y
// escribir— para que se pueda probar contra la base. El envoltorio de
// `acciones-gastos.ts` solo resuelve el cliente de servidor y revalida.
// ---------------------------------------------------------------------------

export async function escribirGasto(sb: Sb, entrada: EntradaGasto): Promise<Ok> {
  if (entrada.concepto.trim() === "") {
    return { ok: false, error: "El gasto necesita un concepto." };
  }
  if (!(CATEGORIAS as readonly string[]).includes(entrada.categoria)) {
    return { ok: false, error: `«${entrada.categoria}» no es una categoría de gasto.` };
  }

  // RLS lo impediría igual, pero así el mensaje es claro en vez de un 42501.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar gastos." };
  }

  const { error } = await sb.from("gastos").insert({
    fecha: entrada.fecha,
    concepto: entrada.concepto.trim(),
    plataforma_id: entrada.plataformaId ?? null,
    base: aEuros(entrada.baseCentimos),
    iva: aEuros(entrada.ivaCentimos),
    total: aEuros(entrada.baseCentimos + entrada.ivaCentimos),
    categoria: entrada.categoria,
    cliente_id: entrada.clienteId ?? null,
    proyecto_id: entrada.proyectoId ?? null,
    notas: entrada.notas ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Comprueba propietario y fila afectada a mano, igual que `marcarCobrada` en
 * `facturas.ts`: un `delete` cuyo `using()` de RLS filtra la fila NO da
 * error, afecta a cero filas y Supabase lo cuenta como éxito. Sin esto, un
 * colaborador —o un `id` que no existe— recibiría `{ ok: true }` de un
 * endpoint (`eliminarGasto` vive en un módulo "use server") sin haber
 * borrado nada.
 */
export async function borrarGasto(sb: Sb, id: string): Promise<Ok> {
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar gastos." };
  }

  const { data, error } = await sb.from("gastos").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Ese gasto no existe." };
  }
  return { ok: true };
}
