import type { Sb } from "./clientes";
import { obtenerPerfil } from "./perfil";
import { desglosar } from "@/lib/dinero";
import type { Ok } from "./proyectos";

export type LineaFactura = {
  id: string;
  orden: number;
  concepto: string;
  descripcion: string | null;
  cantidad: number;
  precioUnitario: number;
  importe: number;
  proyectoId: string | null;
};

export type Factura = {
  id: string;
  origen: "externa" | "atlas";
  serie: string;
  numero: number | null;
  clienteId: string;
  clienteNombre: string;
  /** ISO AAAA-MM-DD */
  fechaEmision: string;
  fechaVencimiento: string | null;
  base: number;
  ivaTipo: number;
  ivaCuota: number;
  total: number;
  estado: "borrador" | "emitida" | "anulada";
  cobradaEn: string | null;
  lineas: LineaFactura[];
};

const CAMPOS = `
  id, origen, serie, numero, cliente_id, fecha_emision, fecha_vencimiento,
  base, iva_tipo, iva_cuota, total, estado, cobrada_en,
  clientes!inner(nombre),
  factura_lineas(id, orden, concepto, descripcion, cantidad, precio_unitario,
                 importe, proyecto_id)
`;

type Fila = {
  id: string;
  origen: string;
  serie: string;
  numero: number | null;
  cliente_id: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  base: number;
  iva_tipo: number;
  iva_cuota: number;
  total: number;
  estado: string;
  cobrada_en: string | null;
  clientes: { nombre: string } | { nombre: string }[];
  factura_lineas: {
    id: string;
    orden: number;
    concepto: string;
    descripcion: string | null;
    cantidad: number;
    precio_unitario: number;
    importe: number;
    proyecto_id: string | null;
  }[];
};

function aFactura(f: Fila): Factura {
  // PostgREST devuelve el join como objeto o como array según la cardinalidad
  // que infiera. Normalizarlo aquí evita repetir el ternario en cada consumidor.
  const cliente = Array.isArray(f.clientes) ? f.clientes[0]! : f.clientes;
  return {
    id: f.id,
    origen: f.origen as Factura["origen"],
    serie: f.serie,
    numero: f.numero,
    clienteId: f.cliente_id,
    clienteNombre: cliente.nombre,
    fechaEmision: f.fecha_emision,
    fechaVencimiento: f.fecha_vencimiento,
    base: Number(f.base),
    ivaTipo: Number(f.iva_tipo),
    ivaCuota: Number(f.iva_cuota),
    total: Number(f.total),
    estado: f.estado as Factura["estado"],
    cobradaEn: f.cobrada_en,
    lineas: [...f.factura_lineas]
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({
        id: l.id,
        orden: l.orden,
        concepto: l.concepto,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        precioUnitario: Number(l.precio_unitario),
        importe: Number(l.importe),
        proyectoId: l.proyecto_id,
      })),
  };
}

/**
 * El historial. **No filtra por permisos**: de eso se encarga RLS, y hay un
 * test que lo comprueba con un colaborador en vez de suponerlo.
 */
export async function listarFacturas(
  sb: Sb,
  filtros: { clienteId?: string; sinCobrar?: boolean }
): Promise<Factura[]> {
  let consulta = sb
    .from("facturas")
    .select(CAMPOS)
    .order("fecha_emision", { ascending: false })
    .limit(200);

  if (filtros.clienteId) consulta = consulta.eq("cliente_id", filtros.clienteId);
  if (filtros.sinCobrar) {
    consulta = consulta.is("cobrada_en", null).neq("estado", "anulada");
  }

  const { data, error } = await consulta;
  if (error) throw error;
  return (data ?? []).map((f) => aFactura(f as unknown as Fila));
}

export async function obtenerFactura(sb: Sb, id: string): Promise<Factura | null> {
  const { data, error } = await sb
    .from("facturas")
    .select(CAMPOS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? aFactura(data as unknown as Fila) : null;
}

// ---------------------------------------------------------------------------
// Escritura. Recibe `sb` y hace todo el trabajo —validar, comprobar el rol y
// escribir— para que se pueda probar contra la base. El envoltorio de
// `acciones-facturas.ts` solo resuelve el cliente de servidor y revalida.
// ---------------------------------------------------------------------------

export type EntradaLinea = {
  concepto: string;
  descripcion?: string | null;
  cantidad: number;
  /** Céntimos enteros. Nunca euros en float. */
  precioUnitarioCentimos: number;
  proyectoId?: string | null;
};

export type EntradaFactura = {
  clienteId: string;
  serie: string;
  numero: number;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  ivaTipo: number;
  lineas: EntradaLinea[];
  notas?: string | null;
};

/** Céntimos → el `numeric(12,2)` que espera Postgres. */
function aEuros(centimos: number): number {
  return centimos / 100;
}

/**
 * Registra una factura emitida FUERA de Atlas.
 *
 * `origen = 'externa'` y sin cadena de huellas: registrar una factura ajena es
 * contabilidad, no emisión. La emisión propia llega en el plan 2E.
 *
 * Nace `emitida` y no `borrador`: es una factura que ya existe y que alguien ya
 * recibió. Un borrador es algo que todavía no se ha mandado.
 */
export async function registrarFacturaExterna(
  sb: Sb,
  entrada: EntradaFactura
): Promise<Ok> {
  if (entrada.lineas.length === 0) {
    return { ok: false, error: "Una factura necesita al menos una línea." };
  }

  // RLS lo impediría igual, pero así el mensaje es claro en vez de un 42501.
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar facturas." };
  }

  const lineas = entrada.lineas.map((l, i) => ({
    orden: i,
    concepto: l.concepto,
    descripcion: l.descripcion ?? null,
    cantidad: l.cantidad,
    precio_unitario: aEuros(l.precioUnitarioCentimos),
    importe: aEuros(Math.round(l.precioUnitarioCentimos * l.cantidad)),
    proyecto_id: l.proyectoId ?? null,
  }));

  const baseCentimos = entrada.lineas.reduce(
    (suma, l) => suma + Math.round(l.precioUnitarioCentimos * l.cantidad),
    0
  );
  const d = desglosar(baseCentimos, entrada.ivaTipo);

  const { data, error } = await sb
    .from("facturas")
    .insert({
      origen: "externa",
      serie: entrada.serie,
      numero: entrada.numero,
      cliente_id: entrada.clienteId,
      fecha_emision: entrada.fechaEmision,
      fecha_vencimiento: entrada.fechaVencimiento ?? null,
      base: aEuros(d.base),
      iva_tipo: entrada.ivaTipo,
      iva_cuota: aEuros(d.cuota),
      total: aEuros(d.total),
      estado: "emitida",
      notas: entrada.notas ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return error.code === "23505"
      ? {
          ok: false,
          error: `Ya hay una factura con ese número en la serie ${entrada.serie}.`,
        }
      : { ok: false, error: error.message };
  }

  const { error: eLineas } = await sb
    .from("factura_lineas")
    .insert(lineas.map((l) => ({ ...l, factura_id: data.id })));

  if (eLineas) {
    // PostgREST no da transacciones entre dos llamadas, así que la cabecera se
    // retira a mano. Sin esto quedaría una factura de 0 € que parece real y que
    // descuadraría cualquier suma del periodo.
    const { error: eRescate } = await sb.from("facturas").delete().eq("id", data.id);

    // Se distingue el caso porque cada uno exige una acción distinta de quien
    // lo lea: si el rescate funcionó, basta con saber por qué fallaron las
    // líneas para poder reintentar. Si además falló el rescate, hay que decir
    // que ha quedado una factura vacía ocupando esa serie-número, o nadie
    // sabrá que hay basura que borrar a mano y por qué el reintento choca con
    // un número «ya usado».
    if (eRescate) {
      return {
        ok: false,
        error:
          `No se pudieron guardar las líneas (${eLineas.message}), y además ` +
          `quedó una factura vacía en ${entrada.serie}-${entrada.numero} que ` +
          `hay que borrar a mano.`,
      };
    }
    return { ok: false, error: eLineas.message };
  }

  return { ok: true };
}

/**
 * `fecha = null` deshace el cobro.
 *
 * Comprueba propietario y fila afectada a mano, porque un `update` cuyo
 * `using()` de RLS filtra la fila NO da error: afecta a cero filas y
 * Supabase lo cuenta como éxito. Sin esto, un colaborador —o un `id` que no
 * existe— recibiría `{ ok: true }` sin haber cobrado nada.
 */
export async function marcarCobrada(
  sb: Sb,
  id: string,
  fecha: string | null
): Promise<Ok> {
  const perfil = await obtenerPerfil(sb);
  if (!perfil?.esPropietario) {
    return { ok: false, error: "Solo el propietario puede gestionar facturas." };
  }

  const { data, error } = await sb
    .from("facturas")
    .update({ cobrada_en: fecha })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Esa factura no existe." };
  }
  return { ok: true };
}
