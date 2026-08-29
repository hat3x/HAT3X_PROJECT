import type { Sb } from "./clientes";

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
