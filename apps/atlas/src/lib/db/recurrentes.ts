import type { Sb } from "./clientes";
import { obtenerPerfil } from "./perfil";
import type { Ok } from "./proyectos";
import { CATEGORIAS, type Categoria } from "./gastos";

//
// Los recibos fijos: lo que se paga igual todos los meses.
//
// El motor que los convierte en gastos ya existe —la función
// `atlas_materializar_recurrentes`, que dispara pg_cron el día 1—. Esto es
// solo el alta y la lectura.
//
// Dar de alta uno aquí es lo que evita teclear doce veces al año el mismo
// recibo, que es como se acaba no tecleándolo y con el coste del mes saliendo
// más bajo de lo real.
//

export type Recurrente = {
  id: string;
  concepto: string;
  plataformaId: string | null;
  plataformaNombre: string | null;
  base: number;
  iva: number;
  total: number;
  categoria: string;
  clienteId: string | null;
  clienteNombre: string | null;
  diaDelMes: number;
  activo: boolean;
  /**
   * Última vez que se materializó, en ISO AAAA-MM-DD. Nulo si nunca.
   *
   * Se enseña en pantalla a propósito: un recibo dado de alta que dejara de
   * aparecer sería un agujero silencioso en el total del mes. Es la misma
   * lección del descubridor — lo que no se registra no se puede echar de
   * menos.
   */
  ultimaVez: string | null;
};

export type EntradaRecurrente = {
  concepto: string;
  plataformaId?: string | null;
  baseCentimos: number;
  ivaCentimos: number;
  categoria: Categoria;
  clienteId?: string | null;
  proyectoId?: string | null;
  /** Entre 1 y 28: los días 29, 30 y 31 no existen todos los meses. */
  diaDelMes: number;
};

function aEuros(centimos: number): number {
  return centimos / 100;
}

/**
 * El catálogo de recibos fijos, con la fecha del último materializado.
 *
 * **No filtra por permisos**: de eso se encarga RLS, comprobado con un
 * colaborador real en los tests de esquema.
 */
export async function listarRecurrentes(sb: Sb): Promise<Recurrente[]> {
  const { data, error } = await sb
    .from("gastos_recurrentes")
    .select(
      `id, concepto, base, iva, categoria, dia_del_mes, activo,
       cliente_id, plataforma_id,
       clientes(nombre), plataformas(nombre),
       gastos(fecha)`
    )
    .order("concepto");
  if (error) throw error;

  const nombreDe = (u: unknown): string | null => {
    const v = u as { nombre: string } | { nombre: string }[] | null;
    const uno = Array.isArray(v) ? (v[0] ?? null) : v;
    return uno?.nombre ?? null;
  };

  return (data ?? []).map((r) => {
    // De todos los gastos que salieron de este recurrente, el más reciente. Se
    // calcula aquí y no con un `order` en la consulta porque PostgREST no deja
    // ordenar una relación anidada y quedarse solo con la primera fila.
    const fechas = ((r.gastos ?? []) as { fecha: string }[]).map((g) => g.fecha);
    const base = Number(r.base);
    const iva = Number(r.iva);

    return {
      id: r.id,
      concepto: r.concepto,
      plataformaId: r.plataforma_id,
      plataformaNombre: nombreDe(r.plataformas),
      base,
      iva,
      total: base + iva,
      categoria: r.categoria,
      clienteId: r.cliente_id,
      clienteNombre: nombreDe(r.clientes),
      diaDelMes: r.dia_del_mes,
      activo: r.activo,
      ultimaVez: fechas.length ? fechas.sort().at(-1)! : null,
    };
  });
}

export async function escribirRecurrente(
  sb: Sb,
  entrada: EntradaRecurrente
): Promise<Ok> {
  if (entrada.concepto.trim() === "") {
    return { ok: false, error: "El recibo necesita un concepto." };
  }
  if (!(CATEGORIAS as readonly string[]).includes(entrada.categoria)) {
    return { ok: false, error: `«${entrada.categoria}» no es una categoría de gasto.` };
  }
  // El tope de 28 lo impone también la base, pero aquí el mensaje explica el
  // porqué en vez de soltar el nombre de una restricción.
  if (
    !Number.isInteger(entrada.diaDelMes) ||
    entrada.diaDelMes < 1 ||
    entrada.diaDelMes > 28
  ) {
    return {
      ok: false,
      error:
        "El día tiene que estar entre 1 y 28: los días 29, 30 y 31 no existen todos los meses.",
    };
  }

  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar gastos." };
  }

  const { error } = await sb.from("gastos_recurrentes").insert({
    concepto: entrada.concepto.trim(),
    plataforma_id: entrada.plataformaId ?? null,
    base: aEuros(entrada.baseCentimos),
    iva: aEuros(entrada.ivaCentimos),
    categoria: entrada.categoria,
    cliente_id: entrada.clienteId ?? null,
    proyecto_id: entrada.proyectoId ?? null,
    dia_del_mes: entrada.diaDelMes,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Da de baja un recibo sin borrarlo: sus gastos históricos siguen colgando de
 * él, y borrarlo dejaría huérfano el rastro de por qué se apuntaron.
 */
export async function cambiarActivo(sb: Sb, id: string, activo: boolean): Promise<Ok> {
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar gastos." };
  }

  const { data, error } = await sb
    .from("gastos_recurrentes")
    .update({ activo })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Un update que RLS filtra no da error: afecta a cero filas y se lee como
  // éxito. Mismo motivo que en `marcarCobrada` y en `borrarGasto`.
  if (!data || data.length === 0) {
    return { ok: false, error: "Ese recibo no existe." };
  }
  return { ok: true };
}
