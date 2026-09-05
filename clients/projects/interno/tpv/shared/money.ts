// ============================================================================
// TPV · Núcleo de cálculo de dinero, IVA y totales
// ----------------------------------------------------------------------------
// Fuente ÚNICA de verdad del cálculo monetario del TPV. Puro, sin dependencias
// y sin efectos: se importa idéntico desde las Edge Functions (Deno, servidor
// autoritativo) y desde la capa web (previsualización optimista en el cliente).
//
// Regla de oro: el SERVIDOR recalcula SIEMPRE los totales a partir de las
// líneas antes de persistir. El cliente nunca fija subtotal/total/impuestos;
// sólo envía líneas (cantidad, precio, descuento, %IVA). Así ningún importe
// llega manipulado desde el navegador.
//
// Convención fiscal (España): `precio_unitario` es BASE sin IVA. El IVA se
// calcula por línea sobre la base neta (base - descuento) y se REDONDEA por
// línea a 2 decimales (práctica habitual de TPV/factura simplificada), luego
// se suma para la cabecera. Todos los importes son `numeric(12,2)` en BD.
// ============================================================================

/** Tolerancia para comparar importes en euros (medio céntimo). */
export const TOLERANCIA_EUR = 0.005;

/**
 * Redondeo a 2 decimales, medio hacia arriba, estable ante el error binario
 * del punto flotante y simétrico para negativos (devoluciones/cambio).
 */
export function redondear2(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const signo = valor < 0 ? -1 : 1;
  return (signo * Math.round((Math.abs(valor) + Number.EPSILON) * 100)) / 100;
}

/** ¿Son dos importes iguales dentro de la tolerancia de céntimo? */
export function importesIguales(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCIA_EUR;
}

// ----------------------------------------------------------------------------
// Líneas
// ----------------------------------------------------------------------------

/** Entrada mínima necesaria para calcular una línea de ticket. */
export interface LineaCalculable {
  cantidad: number;
  precio_unitario: number;
  /** Importe de descuento absoluto sobre la línea (€). Excluyente con pct. */
  descuento?: number;
  /** Descuento porcentual 0..100 sobre la base bruta. Si viene, manda sobre `descuento`. */
  descuento_pct?: number;
  /** % de IVA aplicado (p.ej. 21, 10, 4, 0). */
  tipo_impuesto?: number;
}

/** Resultado del cálculo de una línea, listo para persistir en `tpv_lineas_ticket`. */
export interface LineaCalculada {
  /** cantidad × precio_unitario (antes de descuento). */
  base_bruta: number;
  /** Descuento efectivo aplicado (€), ya resuelto desde importe o porcentaje. */
  descuento: number;
  /** Base imponible de la línea = base_bruta − descuento (≥ 0). */
  base_neta: number;
  tipo_impuesto: number;
  /** Cuota de IVA de la línea, redondeada a 2 decimales. */
  importe_impuesto: number;
  /** Total con impuestos = base_neta + importe_impuesto. */
  total_linea: number;
}

/**
 * Calcula una línea. El descuento nunca puede superar la base bruta (la base
 * neta y el total quedan acotados a ≥ 0, coherente con los CHECK de la BD).
 */
export function calcularLinea(linea: LineaCalculable): LineaCalculada {
  const cantidad = Number(linea.cantidad) || 0;
  const precio = Number(linea.precio_unitario) || 0;
  const tipoImpuesto = linea.tipo_impuesto ?? 21;

  const baseBruta = redondear2(cantidad * precio);

  // El porcentaje, si viene, tiene prioridad sobre el importe fijo.
  const descuentoBruto =
    linea.descuento_pct != null
      ? baseBruta * (linea.descuento_pct / 100)
      : (linea.descuento ?? 0);

  // Acotar el descuento a [0, baseBruta].
  const descuento = redondear2(Math.min(Math.max(descuentoBruto, 0), baseBruta));

  const baseNeta = redondear2(baseBruta - descuento);
  const importeImpuesto = redondear2(baseNeta * (tipoImpuesto / 100));
  const totalLinea = redondear2(baseNeta + importeImpuesto);

  return {
    base_bruta: baseBruta,
    descuento,
    base_neta: baseNeta,
    tipo_impuesto: tipoImpuesto,
    importe_impuesto: importeImpuesto,
    total_linea: totalLinea,
  };
}

// ----------------------------------------------------------------------------
// Cabecera del ticket
// ----------------------------------------------------------------------------

/** Totales de cabecera, mapeables 1:1 a las columnas de `tpv_ventas`. */
export interface TotalesTicket {
  /** Σ base_neta = base imponible total (columna `subtotal`). */
  subtotal: number;
  /** Σ descuento de todas las líneas. */
  descuento_total: number;
  /** Σ cuota de IVA. */
  impuestos_total: number;
  /** subtotal + impuestos_total. */
  total: number;
}

/** Desglose de IVA agrupado por tipo impositivo (para factura). */
export interface TramoIva {
  tipo_impuesto: number;
  base: number;
  cuota: number;
}

/** Totales + desglose de IVA calculados desde las líneas ya calculadas. */
export interface ResumenTicket extends TotalesTicket {
  desglose_iva: TramoIva[];
}

/** Agrega las líneas calculadas en los totales de cabecera + desglose de IVA. */
export function calcularTotales(lineas: LineaCalculada[]): ResumenTicket {
  const tramos = new Map<number, TramoIva>();
  let subtotal = 0;
  let descuentoTotal = 0;
  let impuestosTotal = 0;

  for (const l of lineas) {
    subtotal += l.base_neta;
    descuentoTotal += l.descuento;
    impuestosTotal += l.importe_impuesto;

    const previo = tramos.get(l.tipo_impuesto) ?? {
      tipo_impuesto: l.tipo_impuesto,
      base: 0,
      cuota: 0,
    };
    previo.base = redondear2(previo.base + l.base_neta);
    previo.cuota = redondear2(previo.cuota + l.importe_impuesto);
    tramos.set(l.tipo_impuesto, previo);
  }

  subtotal = redondear2(subtotal);
  descuentoTotal = redondear2(descuentoTotal);
  impuestosTotal = redondear2(impuestosTotal);

  return {
    subtotal,
    descuento_total: descuentoTotal,
    impuestos_total: impuestosTotal,
    total: redondear2(subtotal + impuestosTotal),
    desglose_iva: [...tramos.values()].sort(
      (a, b) => a.tipo_impuesto - b.tipo_impuesto,
    ),
  };
}

/** Atajo: calcula líneas + totales en una pasada desde las entradas crudas. */
export function calcularTicket(lineas: LineaCalculable[]): {
  lineas: LineaCalculada[];
  totales: ResumenTicket;
} {
  const calculadas = lineas.map(calcularLinea);
  return { lineas: calculadas, totales: calcularTotales(calculadas) };
}

// ----------------------------------------------------------------------------
// Pagos (efectivo, tarjeta, mixto)
// ----------------------------------------------------------------------------

/** Importe de un pago para el cálculo de saldo (positivo cobra, negativo devuelve). */
export interface PagoImporte {
  importe: number;
}

/** Estado de cobro de un ticket. */
export interface SaldoTicket {
  /** Total a cobrar del ticket. */
  total: number;
  /** Neto ya cobrado (Σ importes, cobros − devoluciones). */
  pagado: number;
  /** Lo que falta por cobrar (total − pagado). ≤ 0 → cubierto. */
  pendiente: number;
  /** Sobrepago detectado (pagado − total) cuando es positivo; útil para cambio. */
  sobrepago: number;
  /** true si el ticket está exactamente cubierto (dentro de tolerancia). */
  cubierto: boolean;
}

/** Calcula el saldo de un ticket a partir de su total y los pagos aplicados. */
export function calcularSaldo(
  total: number,
  pagos: PagoImporte[],
): SaldoTicket {
  const pagado = redondear2(
    pagos.reduce((acc, p) => acc + (Number(p.importe) || 0), 0),
  );
  const pendiente = redondear2(total - pagado);
  const sobrepago = pendiente < 0 ? redondear2(-pendiente) : 0;
  return {
    total,
    pagado,
    pendiente,
    sobrepago,
    cubierto: Math.abs(pendiente) < TOLERANCIA_EUR,
  };
}

/**
 * Cambio a devolver en un cobro en efectivo.
 * @param totalACobrar  importe pendiente del ticket
 * @param entregado     efectivo entregado por el cliente
 */
export function calcularCambio(totalACobrar: number, entregado: number): number {
  return redondear2(Math.max(entregado - totalACobrar, 0));
}
